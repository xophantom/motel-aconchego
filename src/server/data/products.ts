import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'
import type { ProductInput, ProductUpdateInput } from '@/lib/validation/product'
import type { Product } from '@/generated/prisma/client'
import { categoryLabel } from '@/lib/stock-labels'

const money = (n: unknown) => `R$ ${Number(n).toFixed(2)}`

// What an edit changed, "field before → after", for the audit trail.
function productChanges(a: Product, b: Product): string[] {
  const out: string[] = []
  if (a.description !== b.description) out.push(`descrição ${a.description} → ${b.description}`)
  if (a.category !== b.category) out.push(`categoria ${categoryLabel(a.category)} → ${categoryLabel(b.category)}`)
  if (Number(a.price) !== Number(b.price)) out.push(`preço ${money(a.price)} → ${money(b.price)}`)
  if (Number(a.cost) !== Number(b.cost)) out.push(`custo ${money(a.cost)} → ${money(b.cost)}`)
  if (a.minStock !== b.minStock) out.push(`mínimo ${a.minStock} → ${b.minStock}`)
  if (a.trackStock !== b.trackStock) out.push(b.trackStock ? 'passa a controlar estoque' : 'deixa de controlar estoque')
  return out
}

async function requireProductManager() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'product:manage')) throw new Error('Forbidden')
  return me
}

export class ProductCodeTakenError extends Error {
  constructor(readonly existing: { code: string; description: string }) {
    super('product code taken')
  }
}

export async function listProducts() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  return db.product.findMany({ orderBy: { description: 'asc' } })
}

// Tracked products at or below their minimum — the restock list ("baixo").
export async function lowStockProducts() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  const rows = await db.product.findMany({
    where: { trackStock: true },
    orderBy: { description: 'asc' },
    select: { code: true, description: true, category: true, stockQty: true, minStock: true },
  })
  return rows.filter((p) => p.stockQty <= p.minStock)
}

// Only creates: an existing code (ignoring case — legacy codes like "Xav" are
// mixed case) is refused, never overwritten. The initial stock goes in as an
// inventory movement so it shows in the stock history.
export async function createProduct(input: ProductInput) {
  const me = await requireProductManager()
  const code = input.code.trim().toUpperCase()
  const existing = await db.product.findFirst({ where: { code: { equals: code, mode: 'insensitive' } }, select: { code: true, description: true } })
  if (existing) throw new ProductCodeTakenError(existing)
  const product = await db.$transaction(async (tx) => {
    const created = await tx.product.create({ data: { ...input, code } })
    if (input.stockQty > 0) {
      await tx.stockMovement.create({ data: { productCode: code, qty: input.stockQty, reason: 'inventory', note: 'estoque inicial', employeeId: me.id } })
    }
    return created
  })
  await logEvent({
    type: 'product.create',
    description: `Produto ${product.description} (${product.code}) criado · ${money(product.price)}${product.trackStock ? ` · estoque inicial ${product.stockQty}` : ''}`,
    entity: 'product', entityId: product.code,
  })
  return product
}

// Edits an existing product by its code. Stock is not touched here: it moves
// only through restock/adjust, which keeps a history.
export async function updateProduct(code: string, input: ProductUpdateInput) {
  await requireProductManager()
  const before = await db.product.findUniqueOrThrow({ where: { code } })
  const product = await db.product.update({ where: { code }, data: input })
  const changes = productChanges(before, product)
  await logEvent({
    type: 'product.update',
    description: `Produto ${product.description} (${product.code}) salvo · ${changes.length ? changes.join(' · ') : 'sem alterações'}`,
    entity: 'product', entityId: product.code,
  })
  return product
}
