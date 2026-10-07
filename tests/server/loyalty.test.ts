import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import {
  getLoyaltyPolicy, updateLoyaltyPolicy, loyaltyProgress, customerByPlate, loyaltyStatus,
  applyLoyaltyToRoom, removeLoyaltyFromRoom, setStayPlate, listLoyaltyCustomers, loyaltyCustomerDetail,
} from '@/server/data/loyalty'

const RECEPTION = { id: 1, name: 'R', role: 'reception' }
const MANAGER = { id: 1, name: 'M', role: 'manager' }

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = RECEPTION
})

async function closedVisits(customerId: bigint, n: number, at = new Date('2026-09-01T12:00:00Z')) {
  await db.stay.createMany({ data: Array.from({ length: n }, () => ({ type: 'room' as const, customerId, checkIn: at, checkOut: at, status: 'closed' as const, day: 'normal' as const, guests: 2, stayAmount: 75 })) })
}
async function occupiedRoom(number: string, customerId: bigint | null) {
  const stay = await db.stay.create({ data: { type: 'room', customerId, checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
  await db.room.create({ data: { number, status: 'occupied', currentStayId: stay.id } })
  return stay
}

describe('policy', () => {
  it('defaults to every 10 visits → 100% (1 free stay)', async () => {
    expect(await getLoyaltyPolicy()).toEqual({ everyVisits: 10, discountPercent: 100 })
  })
  it('manager updates it (audited); reception cannot', async () => {
    await expect(updateLoyaltyPolicy({ everyVisits: 5, discountPercent: 50 })).rejects.toThrow(/forbidden/i)
    session.current = MANAGER
    await updateLoyaltyPolicy({ everyVisits: 5, discountPercent: 50 })
    expect(await getLoyaltyPolicy()).toEqual({ everyVisits: 5, discountPercent: 50 })
    expect(await db.eventLog.count({ where: { type: 'loyalty.policy' } })).toBe(1)
  })
})

describe('loyaltyProgress', () => {
  const policy = { everyVisits: 10, discountPercent: 100 }
  it('earns one benefit per completed cycle, minus the used ones', () => {
    expect(loyaltyProgress(0, 0, policy)).toMatchObject({ available: 0, nextIn: 10 })
    expect(loyaltyProgress(9, 0, policy)).toMatchObject({ available: 0, nextIn: 1 })
    expect(loyaltyProgress(10, 0, policy)).toMatchObject({ available: 1, nextIn: 10 })
    expect(loyaltyProgress(23, 1, policy)).toMatchObject({ available: 1, nextIn: 7 })
    expect(loyaltyProgress(23, 2, policy)).toMatchObject({ available: 0 })
  })
})

describe('customerByPlate', () => {
  it('normalizes and reuses (hyphen, spaces, case)', async () => {
    const a = await customerByPlate(' abc-1d23 ')
    const b = await customerByPlate('ABC1D23')
    expect(a!.id).toBe(b!.id)
    expect(a!.plate).toBe('ABC1D23')
  })
  it('reuses a customer stored under an older spelling of the same car', async () => {
    const legacy = await db.customer.create({ data: { plate: 'ABC-1234' } })
    expect((await customerByPlate('abc1c34'))!.id).toBe(legacy.id)
    expect((await customerByPlate('ABC1234'))!.id).toBe(legacy.id)
  })
  it('an empty plate means no customer', async () => {
    expect(await customerByPlate(' - ')).toBeNull()
  })
})

describe('loyaltyStatus', () => {
  it('counts paid visits only: a stay that used the benefit is not a paid visit', async () => {
    const c = (await customerByPlate('AAA1A11'))!
    await closedVisits(c.id, 10)
    const freeStay = await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), checkOut: new Date(), status: 'closed', day: 'normal', guests: 2, stayAmount: 0, discountPercent: 100 } })
    await db.loyaltyRedemption.create({ data: { customerId: c.id, stayId: freeStay.id, discountPercent: 100 } })
    expect(await loyaltyStatus(c.id)).toMatchObject({ paidVisits: 10, used: 1, available: 0, nextIn: 10 })
  })
  it('a benefit used on a canceled stay goes back to the customer', async () => {
    const c = (await customerByPlate('AAA1A12'))!
    await closedVisits(c.id, 10)
    const canceled = await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), status: 'canceled', day: 'normal', guests: 2 } })
    await db.loyaltyRedemption.create({ data: { customerId: c.id, stayId: canceled.id, discountPercent: 100 } })
    expect((await loyaltyStatus(c.id)).available).toBe(1)
  })
  it('sums visits stored under older spellings of the same car', async () => {
    const legacy = await db.customer.create({ data: { plate: 'ABC-1234' } })
    const canon = await db.customer.create({ data: { plate: 'ABC1C34' } })
    await closedVisits(legacy.id, 6)
    await closedVisits(canon.id, 4)
    expect(await loyaltyStatus(canon.id)).toMatchObject({ paidVisits: 10, available: 1 })
  })
})

describe('apply / remove on the room', () => {
  it('needs a completed cycle; applies the benefit once per stay', async () => {
    const c = (await customerByPlate('BBB2B22'))!
    await closedVisits(c.id, 9)
    await occupiedRoom('201', c.id)
    await expect(applyLoyaltyToRoom('201')).rejects.toThrow(/unavailable/)
    await closedVisits(c.id, 1)
    expect(await applyLoyaltyToRoom('201')).toBe(100)
    const room = await db.room.findUniqueOrThrow({ where: { number: '201' }, include: { currentStay: true } })
    expect(room.currentStay!.discountPercent).toBe(100)
    await expect(applyLoyaltyToRoom('201')).rejects.toThrow(/unavailable|already applied/)
    expect(await db.eventLog.count({ where: { type: 'loyalty.apply' } })).toBe(1)
  })
  it('is recurring: every 10 paid visits earn another free stay', async () => {
    const c = (await customerByPlate('CCC3C33'))!
    await closedVisits(c.id, 10)
    const first = await occupiedRoom('202', c.id)
    await applyLoyaltyToRoom('202')
    await db.stay.update({ where: { id: first.id }, data: { status: 'closed', checkOut: new Date(), stayAmount: 0 } })
    await db.room.update({ where: { number: '202' }, data: { status: 'free', currentStayId: null } })
    expect((await loyaltyStatus(c.id)).available).toBe(0)
    await closedVisits(c.id, 10)
    expect(await loyaltyStatus(c.id)).toMatchObject({ paidVisits: 20, used: 1, available: 1 })
  })
  it('remove gives the benefit back', async () => {
    const c = (await customerByPlate('DDD4D44'))!
    await closedVisits(c.id, 10)
    const stay = await occupiedRoom('203', c.id)
    await applyLoyaltyToRoom('203')
    await removeLoyaltyFromRoom('203')
    expect((await db.stay.findUniqueOrThrow({ where: { id: stay.id } })).discountPercent).toBe(0)
    expect((await loyaltyStatus(c.id, { excludeStayId: stay.id })).available).toBe(1)
    await expect(removeLoyaltyFromRoom('203')).rejects.toThrow(/no benefit applied/)
  })
  it('throws when the open stay has no plate', async () => {
    await occupiedRoom('204', null)
    await expect(applyLoyaltyToRoom('204')).rejects.toThrow(/no open stay/)
  })
})

describe('setStayPlate', () => {
  it('sets or fixes the plate of the open stay; blocked while a benefit is applied', async () => {
    const stay = await occupiedRoom('205', null)
    const c = await setStayPlate('205', 'eee-5e55')
    expect((await db.stay.findUniqueOrThrow({ where: { id: stay.id } })).customerId).toBe(c!.id)
    expect(c!.plate).toBe('EEE5E55')
    await closedVisits(c!.id, 10)
    await applyLoyaltyToRoom('205')
    await expect(setStayPlate('205', 'FFF6F66')).rejects.toThrow(/benefit applied/)
    expect(await db.eventLog.count({ where: { type: 'stay.plate' } })).toBe(1)
  })
})

describe('list + detail (manager)', () => {
  it('lists plates with progress, merging old spellings, most recent first; filters by plate', async () => {
    await expect(listLoyaltyCustomers()).rejects.toThrow(/forbidden/i)
    const legacy = await db.customer.create({ data: { plate: 'ABC-1234' } })
    const canon = await db.customer.create({ data: { plate: 'ABC1C34' } })
    const other = await db.customer.create({ data: { plate: 'ZZZ9Z99' } })
    await closedVisits(legacy.id, 7, new Date('2026-09-01T12:00:00Z'))
    await closedVisits(canon.id, 5, new Date('2026-09-02T12:00:00Z'))
    await closedVisits(other.id, 1, new Date('2026-10-01T12:00:00Z'))
    session.current = MANAGER
    const { rows } = await listLoyaltyCustomers()
    expect(rows.map((r) => r.plate)).toEqual(['ZZZ9Z99', 'ABC1C34'])
    expect(rows[1]).toMatchObject({ paidVisits: 12, available: 1, nextIn: 8, totalVisits: 12 })
    expect((await listLoyaltyCustomers('abc-1')).rows.map((r) => r.plate)).toEqual(['ABC1C34'])
  })
  it('detail lists the visits of a plate with the benefit used', async () => {
    const c = (await customerByPlate('GGG7G77'))!
    await closedVisits(c.id, 10)
    await occupiedRoom('206', c.id)
    await applyLoyaltyToRoom('206')
    session.current = MANAGER
    const d = await loyaltyCustomerDetail('ggg-7g77')
    expect(d!.plate).toBe('GGG7G77')
    expect(d!.visits).toHaveLength(11)
    expect(d!.visits.filter((v) => v.benefitPercent === 100)).toHaveLength(1)
    expect(await loyaltyCustomerDetail('NOPE123')).toBeNull()
  })
})
