import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'
import type { ProductInput } from '@/lib/validation/product'

export async function listProducts() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  return db.product.findMany({ orderBy: { description: 'asc' } })
}

export async function upsertProduct(input: ProductInput) {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'product:manage')) throw new Error('Forbidden')
  const { code, ...rest } = input
  const product = await db.product.upsert({ where: { code }, create: input, update: rest })
  await logEvent({ type: 'product.update', description: `Produto ${product.description} (${product.code}) salvo`, entity: 'product', entityId: product.code })
  return product
}
