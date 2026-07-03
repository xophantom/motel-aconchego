import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { listCategoriesForBoard } from '@/server/data/tariff'

beforeEach(async () => {
  await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  const c = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: c.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  session.current = { id: 1, name: 'R', role: 'reception' }
})

describe('listCategoriesForBoard', () => {
  it('any logged-in user gets categories with numeric rates', async () => {
    const cats = await listCategoriesForBoard()
    expect(cats).toHaveLength(1)
    expect(cats[0].rates[0].basePrice).toBe(75)
    expect(typeof cats[0].rates[0].basePrice).toBe('number')
  })
  it('rejects a logged-out user', async () => {
    session.current = null
    await expect(listCategoriesForBoard()).rejects.toThrow(/forbidden/i)
  })
})
