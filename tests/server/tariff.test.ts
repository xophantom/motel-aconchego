import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listCategoriesWithRates, updateCategory, updateRate } from '@/server/data/tariff'

async function fixture() {
  const cat = await db.roomCategory.create({
    data: { code: 'A', description: 'Suíte', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 },
  })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'special', basePrice: 85, excessPrice30m: 15, overnightPrice: 180, extraGuestPrice: 25 } })
  return cat
}

beforeEach(async () => {
  await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('tariff DAL', () => {
  it('manager lists categories with both rates', async () => {
    await fixture()
    const cats = await listCategoriesWithRates()
    expect(cats).toHaveLength(1)
    expect(cats[0].rates).toHaveLength(2)
  })
  it('non-manager is forbidden', async () => {
    await fixture()
    session.current = { id: 2, name: 'R', role: 'reception' }
    await expect(listCategoriesWithRates()).rejects.toThrow(/forbidden/i)
  })
  it('updates a category and a rate', async () => {
    const cat = await fixture()
    await updateCategory(cat.id, { billing: 'hotel', minPeriodMin: 0, maxPeriodMin: 1440, includedGuests: 2 })
    await updateRate(cat.id, { day: 'normal', basePrice: 80, excessPrice30m: 20, overnightPrice: 200, extraGuestPrice: 30 })
    const fresh = await db.roomCategory.findUniqueOrThrow({ where: { id: cat.id }, include: { rates: true } })
    expect(fresh.billing).toBe('hotel')
    const normal = fresh.rates.find((r) => r.day === 'normal')!
    expect(Number(normal.basePrice)).toBe(80)
  })
})
