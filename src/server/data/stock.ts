import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'
import { Prisma, type StockMovementReason } from '@/generated/prisma/client'

async function requireStock() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stock:adjust')) throw new Error('Forbidden')
  return me
}

export type StockInput = { productCode: string; qty: number; reason: StockMovementReason; unitCost?: number | null; note?: string | null }

export async function addStockMovement(input: StockInput) {
  const me = await requireStock()
  if (input.qty === 0) throw new Error('qty must not be zero')
  const product = await db.product.findUniqueOrThrow({ where: { code: input.productCode } })
  if (product.stockQty + input.qty < 0) throw new Error('insufficient stock')
  const setCost = input.qty > 0 && input.unitCost != null
  const updated = await db.$transaction(async (tx) => {
    await tx.stockMovement.create({
      data: { productCode: input.productCode, qty: input.qty, reason: input.reason, unitCost: input.unitCost ?? null, note: input.note ?? null, employeeId: me.id },
    })
    return tx.product.update({
      where: { code: input.productCode },
      data: { stockQty: { increment: input.qty }, ...(setCost ? { cost: input.unitCost as number } : {}) },
    })
  })
  await logEvent({
    type: input.qty > 0 ? 'stock.entry' : 'stock.adjust',
    description: `${input.qty > 0 ? 'Entrada' : 'Ajuste'} ${input.qty > 0 ? '+' : ''}${input.qty} · ${product.description} (${input.productCode})${input.note ? ` · ${input.note}` : ''}`,
    entity: 'product', entityId: input.productCode,
  })
  return { code: updated.code, stockQty: updated.stockQty, cost: Number(updated.cost) }
}

export type StockFilter = { productCode?: string; from?: Date; to?: Date; take?: number }
export type StockRow = {
  id: bigint; createdAt: Date; productCode: string; productDescription: string | null
  qty: number; reason: StockMovementReason; unitCost: number | null; note: string | null; operatorName: string | null
}

export async function listStockMovements(filter: StockFilter): Promise<StockRow[]> {
  await requireStock()
  const where: Prisma.StockMovementWhereInput = {}
  if (filter.productCode) where.productCode = filter.productCode
  if (filter.from || filter.to) where.createdAt = { gte: filter.from, lte: filter.to }
  const rows = await db.stockMovement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filter.take ?? 50,
    select: {
      id: true, createdAt: true, productCode: true, qty: true, reason: true, unitCost: true, note: true,
      product: { select: { description: true } }, employee: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id, createdAt: r.createdAt, productCode: r.productCode, productDescription: r.product?.description ?? null,
    qty: r.qty, reason: r.reason, unitCost: r.unitCost != null ? Number(r.unitCost) : null, note: r.note, operatorName: r.employee?.name ?? null,
  }))
}
