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

const DEFAULT_SPECIAL_WEEKDAYS = [5, 6]

export async function getTariffPolicy(): Promise<{ specialWeekdays: number[] }> {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  const row = await db.tariffPolicy.findUnique({ where: { id: 1 } })
  return { specialWeekdays: row?.specialWeekdays ?? [...DEFAULT_SPECIAL_WEEKDAYS] }
}

export async function updateTariffPolicy(specialWeekdays: number[]): Promise<{ specialWeekdays: number[] }> {
  await requireTariffManager()
  const clean = [...new Set(specialWeekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
  const row = await db.tariffPolicy.upsert({
    where: { id: 1 },
    update: { specialWeekdays: clean },
    create: { id: 1, specialWeekdays: clean },
  })
  await logEvent({ type: 'tariff.policy', description: `Dias especiais: [${clean.join(', ')}]`, entity: 'tariff_policy', entityId: '1' })
  return { specialWeekdays: row.specialWeekdays }
}

const MONTH_DAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

// Recurring regional holidays ("MM-DD"), treated like national ones by resolveDay.
export async function listRegionalHolidays() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  return db.regionalHoliday.findMany({ orderBy: { monthDay: 'asc' }, select: { id: true, monthDay: true, name: true } })
}

export async function addRegionalHoliday(monthDay: string, name: string) {
  await requireTariffManager()
  if (!MONTH_DAY_RE.test(monthDay)) throw new Error('Data inválida (use MM-DD)')
  const clean = name.trim() || 'Feriado regional'
  const row = await db.regionalHoliday.upsert({ where: { monthDay }, update: { name: clean }, create: { monthDay, name: clean } })
  await logEvent({ type: 'tariff.policy', description: `Feriado regional ${monthDay} · ${clean}`, entity: 'regional_holiday', entityId: String(row.id) })
  return row
}

export async function removeRegionalHoliday(id: number) {
  await requireTariffManager()
  await db.regionalHoliday.delete({ where: { id } })
  await logEvent({ type: 'tariff.policy', description: `Feriado regional removido #${id}`, entity: 'regional_holiday', entityId: String(id) })
}
