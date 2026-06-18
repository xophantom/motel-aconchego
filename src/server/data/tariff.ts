import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import type { UpdateCategoryInput, UpdateRateInput } from '@/lib/validation/tariff'

async function requireTariffManager() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'tariff:manage')) throw new Error('Forbidden')
  return me
}

export async function listCategoriesWithRates() {
  await requireTariffManager()
  return db.roomCategory.findMany({ orderBy: { code: 'asc' }, include: { rates: { orderBy: { day: 'asc' } } } })
}

export async function updateCategory(id: number, input: UpdateCategoryInput) {
  await requireTariffManager()
  return db.roomCategory.update({ where: { id }, data: input })
}

export async function updateRate(categoryId: number, input: UpdateRateInput) {
  await requireTariffManager()
  const { day, ...prices } = input
  return db.rate.update({ where: { categoryId_day: { categoryId, day } }, data: prices })
}
