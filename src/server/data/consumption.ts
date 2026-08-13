import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { getOrOpenCurrentShift } from '@/server/data/shifts'
import { logEvent } from '@/server/audit'

async function requireOps() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:manage')) throw new Error('Forbidden')
  return me
}

export async function addConsumption(input: { stayId: bigint; productCode: string; qty: number }) {
  await requireOps()
  const stay = await db.stay.findUniqueOrThrow({ where: { id: input.stayId } })
  if (stay.status !== 'open') throw new Error('Stay is not open')
  const product = await db.product.findUniqueOrThrow({ where: { code: input.productCode } })
  const unitPrice = Number(product.price)
  const lineTotal = unitPrice * input.qty
  const item = await db.$transaction(async (tx) => {
    const item = await tx.consumption.create({ data: { stayId: input.stayId, productCode: input.productCode, qty: input.qty, unitPrice } })
    await tx.stay.update({ where: { id: input.stayId }, data: { consumptionAmount: { increment: lineTotal } } })
    if (product.trackStock) await tx.product.update({ where: { code: input.productCode }, data: { stockQty: { decrement: input.qty } } })
    return item
  })
  await logEvent({ type: 'consumption.add', description: `Consumo +${input.qty}× ${product.description} · quarto ${stay.roomNumber ?? '—'}`, entity: 'stay', entityId: String(input.stayId), roomNumber: stay.roomNumber })
  return item
}

export async function listConsumption(stayId: bigint) {
  await requireOps()
  return db.consumption.findMany({ where: { stayId }, orderBy: { createdAt: 'asc' }, include: { product: { select: { description: true } } } })
}

export async function listConsumptionForStays(stayIds: bigint[]) {
  await requireOps()
  if (stayIds.length === 0) return []
  return db.consumption.findMany({ where: { stayId: { in: stayIds } }, orderBy: { createdAt: 'asc' }, include: { product: { select: { description: true } } } })
}

export async function removeConsumption(id: bigint) {
  await requireOps()
  const item = await db.consumption.findUniqueOrThrow({ where: { id }, include: { stay: true } })
  if (item.stay.status !== 'open') throw new Error('Stay is not open')
  const lineTotal = Number(item.unitPrice) * item.qty
  await db.$transaction(async (tx) => {
    await tx.consumption.delete({ where: { id } })
    await tx.stay.update({ where: { id: item.stayId }, data: { consumptionAmount: { decrement: lineTotal } } })
    if (item.productCode) {
      const product = await tx.product.findUnique({ where: { code: item.productCode } })
      if (product?.trackStock) await tx.product.update({ where: { code: item.productCode }, data: { stockQty: { increment: item.qty } } })
    }
  })
  await logEvent({ type: 'consumption.remove', description: `Consumo removido · ${item.qty}× (${item.productCode ?? '—'})`, entity: 'stay', entityId: String(item.stayId), roomNumber: item.stay.roomNumber })
}

export async function walkinSale(input: { items: { productCode: string; qty: number }[] }) {
  const me = await requireOps()
  if (input.items.length === 0) throw new Error('Empty sale')
  const products = await db.product.findMany({ where: { code: { in: input.items.map((i) => i.productCode) } } })
  const codes = new Set(products.map((p) => p.code))
  for (const i of input.items) {
    if (!codes.has(i.productCode)) throw new Error('Produto inválido')
    if (!Number.isInteger(i.qty) || i.qty < 1) throw new Error('Quantidade inválida')
  }
  const priceOf = (code: string) => Number(products.find((p) => p.code === code)?.price ?? 0)
  const total = input.items.reduce((a, i) => a + priceOf(i.productCode) * i.qty, 0)
  const now = new Date()
  const openShiftId = (await getOrOpenCurrentShift().catch(() => null))?.id ?? null
  const result = await db.$transaction(async (tx) => {
    const stay = await tx.stay.create({
      data: { type: 'walkin', roomNumber: '99', checkIn: now, checkOut: now, status: 'closed', stayAmount: 0, consumptionAmount: total, paymentEmployeeId: me.id, shiftId: openShiftId },
    })
    for (const i of input.items) {
      await tx.consumption.create({ data: { stayId: stay.id, productCode: i.productCode, qty: i.qty, unitPrice: priceOf(i.productCode) } })
      const product = products.find((p) => p.code === i.productCode)
      if (product?.trackStock) await tx.product.update({ where: { code: i.productCode }, data: { stockQty: { decrement: i.qty } } })
    }
    await tx.cashMovement.create({ data: { type: 'consumption', stayId: stay.id, amount: total, employeeId: me.id, shiftId: openShiftId, occurredAt: now, description: 'Venda avulsa' } })
    return { stay, total }
  })
  await logEvent({ type: 'consumption.walkin', description: `Venda avulsa · R$ ${total.toFixed(2)}`, entity: 'stay', entityId: String(result.stay.id) })
  return result
}
