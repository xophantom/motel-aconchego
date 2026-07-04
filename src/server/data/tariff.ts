import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'
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
  const cat = await db.roomCategory.update({ where: { id }, data: input })
  await logEvent({ type: 'tariff.update', description: `Categoria ${cat.code} atualizada`, entity: 'category', entityId: String(id) })
  return cat
}

export async function updateRate(categoryId: number, input: UpdateRateInput) {
  await requireTariffManager()
  const { day, ...prices } = input
  const rate = await db.rate.update({ where: { categoryId_day: { categoryId, day } }, data: prices })
  await logEvent({ type: 'tariff.update', description: `Tarifa categoria #${categoryId} (${day}) atualizada`, entity: 'rate', entityId: `${categoryId}:${day}` })
  return rate
}

export async function listCategoriesForBoard() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  const cats = await db.roomCategory.findMany({ orderBy: { code: 'asc' }, include: { rates: true } })
  return cats.map((c) => ({
    id: c.id, code: c.code, description: c.description, billing: c.billing,
    minPeriodMin: c.minPeriodMin, maxPeriodMin: c.maxPeriodMin, includedGuests: c.includedGuests,
    rates: c.rates.map((r) => ({
      day: r.day,
      basePrice: Number(r.basePrice), excessPrice30m: Number(r.excessPrice30m),
      overnightPrice: Number(r.overnightPrice), extraGuestPrice: Number(r.extraGuestPrice),
    })),
  }))
}
