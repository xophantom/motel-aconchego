import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { upsertTier, listTiers, customerByPlate, customerVisits, availableTiers, redeemTier } from '@/server/data/loyalty'

beforeEach(async () => {
  await db.loyaltyRedemption.deleteMany(); await db.loyaltyTier.deleteMany()
  await db.stay.deleteMany(); await db.customer.deleteMany(); await db.room.deleteMany()
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('tiers', () => {
  it('manager upserts and lists tiers ordered', async () => {
    await upsertTier({ minVisits: 10, discountPercent: 100 })
    await upsertTier({ minVisits: 5, discountPercent: 50 })
    const tiers = await listTiers()
    expect(tiers.map((t) => t.minVisits)).toEqual([5, 10])
  })
  it('reception cannot upsert', async () => {
    session.current = { id: 2, name: 'R', role: 'reception' }
    await expect(upsertTier({ minVisits: 3, discountPercent: 30 })).rejects.toThrow(/forbidden/i)
  })
})

describe('plate + visits + redemption', () => {
  beforeEach(() => { session.current = { id: 1, name: 'R', role: 'reception' } })
  it('customerByPlate normalizes and reuses', async () => {
    const a = await customerByPlate(' abc1d23 ')
    const b = await customerByPlate('ABC1D23')
    expect(a.id).toBe(b.id)
    expect(a.plate).toBe('ABC1D23')
  })
  it('counts closed room stays, excluding the current one', async () => {
    const c = await customerByPlate('AAA0000')
    await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), checkOut: new Date(), status: 'closed', day: 'normal', guests: 2 } })
    const current = await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
    expect(await customerVisits(c.id)).toBe(1)
    expect(await customerVisits(c.id, current.id)).toBe(1)
  })
  it('availableTiers = earned minus redeemed; redeem is once per tier', async () => {
    session.current = { id: 1, name: 'M', role: 'manager' }
    const t5 = await upsertTier({ minVisits: 1, discountPercent: 50 })
    session.current = { id: 1, name: 'R', role: 'reception' }
    const c = await customerByPlate('BBB1111')
    await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), checkOut: new Date(), status: 'closed', day: 'normal', guests: 2 } })
    let av = await availableTiers(c.id)
    expect(av.visits).toBe(1)
    expect(av.tiers).toHaveLength(1)
    const stay = await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
    const pct = await redeemTier({ customerId: c.id, tierId: t5.id, stayId: stay.id })
    expect(pct).toBe(50)
    av = await availableTiers(c.id)
    expect(av.tiers).toHaveLength(0)
    await expect(redeemTier({ customerId: c.id, tierId: t5.id, stayId: stay.id })).rejects.toThrow()
  })
})
