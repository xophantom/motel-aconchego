import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { staysOrdersReport } from '@/server/data/reports'

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h)

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  await db.room.create({ data: { number: '99', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('staysOrdersReport', () => {
  it('counts room stays vs walk-ins and sums consumption in the period', async () => {
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 10), checkOut: at(2026, 7, 4, 12), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10 } })
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 13), checkOut: at(2026, 7, 4, 15), status: 'closed', day: 'normal', guests: 2, stayAmount: 100, consumptionAmount: 0 } })
    await db.stay.create({ data: { type: 'walkin', roomNumber: '99', checkIn: at(2026, 7, 4, 16), checkOut: at(2026, 7, 4, 16), status: 'closed', stayAmount: 0, consumptionAmount: 20 } })
    // outside the period
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 9, 10), checkOut: at(2026, 7, 9, 12), status: 'closed', day: 'normal', guests: 2, stayAmount: 999, consumptionAmount: 0 } })

    const r = await staysOrdersReport(at(2026, 7, 4), at(2026, 7, 4))
    expect(r.nStays).toBe(2)
    expect(r.totalStay).toBe(175)
    expect(r.avgTicket).toBe(87.5)
    expect(r.nWalkins).toBe(1)
    expect(r.totalConsumption).toBe(30) // 10 + 0 + 20
  })

  it('returns zeros for an empty period', async () => {
    const r = await staysOrdersReport(at(2026, 1, 1), at(2026, 1, 1))
    expect(r).toEqual({ nStays: 0, totalStay: 0, avgTicket: 0, nWalkins: 0, totalConsumption: 0 })
  })
})
