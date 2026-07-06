import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { operatorReport } from '@/server/data/reports'

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h)

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Ana', username: 'ana', role: 'reception', passwordHash: 'x' } })
  await db.employee.create({ data: { id: 2, name: 'Bia', username: 'bia', role: 'reception', passwordHash: 'x' } })
  await db.employee.create({ data: { id: 9, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 9, name: 'Boss', role: 'manager' }
})

describe('operatorReport', () => {
  it('groups by who received payment, summing stay + consumption', async () => {
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 8), checkOut: at(2026, 7, 4, 10), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10, paymentEmployeeId: 1 } })
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 11), checkOut: at(2026, 7, 4, 13), status: 'closed', day: 'normal', guests: 2, stayAmount: 100, consumptionAmount: 0, paymentEmployeeId: 1 } })
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 14), checkOut: at(2026, 7, 4, 16), status: 'closed', day: 'normal', guests: 2, stayAmount: 50, consumptionAmount: 5, paymentEmployeeId: 2 } })

    const r = await operatorReport(at(2026, 7, 4), at(2026, 7, 4))
    expect(r.rows.map((x) => x.operator)).toEqual(['Ana', 'Bia']) // 185 > 55
    const ana = r.rows[0]
    expect(ana.aptos).toBe(2); expect(ana.received).toBe(185); expect(ana.avgTicket).toBe(92.5)
    expect(r.totals.aptos).toBe(3); expect(r.totals.received).toBe(240)
  })
})
