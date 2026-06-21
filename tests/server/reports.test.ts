import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { monthlyOccupancy } from '@/server/data/reports'

beforeEach(async () => {
  await db.consumption.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  await db.room.create({ data: { number: '99', status: 'free' } })
  const inJune = (d: number) => new Date(2026, 5, d, 12) // month index 5 = June
  // two closed room stays for 01 in June
  await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: inJune(1), checkOut: inJune(1), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10 } })
  await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: inJune(2), checkOut: inJune(2), status: 'closed', day: 'normal', guests: 2, stayAmount: 85, consumptionAmount: 0 } })
  // excluded: a walk-in, an open stay, and a May checkout
  await db.stay.create({ data: { type: 'walkin', roomNumber: '99', checkIn: inJune(3), checkOut: inJune(3), status: 'closed', stayAmount: 0, consumptionAmount: 50 } })
  await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: inJune(4), status: 'open', day: 'normal', guests: 2 } })
  await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: new Date(2026, 4, 20, 12), checkOut: new Date(2026, 4, 20, 14), status: 'closed', day: 'normal', guests: 2, stayAmount: 999, consumptionAmount: 0 } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('monthlyOccupancy', () => {
  it('aggregates only closed room stays in the month', async () => {
    const rep = await monthlyOccupancy(2026, 6)
    expect(rep.rows).toHaveLength(1)
    const r = rep.rows[0]
    expect(r.roomNumber).toBe('01')
    expect(r.rentals).toBe(2)
    expect(r.totalStay).toBe(160)
    expect(r.totalConsumption).toBe(10)
    expect(r.avgTicket).toBe(80)
    expect(rep.totals).toEqual({ rentals: 2, totalStay: 160, totalConsumption: 10, avgTicket: 80 })
  })
  it('is manager-only', async () => {
    session.current = { id: 2, name: 'R', role: 'reception' }
    await expect(monthlyOccupancy(2026, 6)).rejects.toThrow(/forbidden/i)
  })
})
