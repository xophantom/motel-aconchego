import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
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
  return db.product.upsert({ where: { code }, create: input, update: rest })
}
