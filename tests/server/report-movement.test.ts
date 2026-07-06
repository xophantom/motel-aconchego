import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { movementReport } from '@/server/data/reports'

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h)

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  await db.room.create({ data: { number: '02', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('movementReport', () => {
  it('is forbidden for reception', async () => {
    session.current = { id: 1, name: 'R', role: 'reception' }
    await expect(movementReport(at(2026, 7, 4), at(2026, 7, 4))).rejects.toThrow(/forbidden/i)
  })

  it('flags entries and exits in the range with totals', async () => {
    // stay A: checked in AND out on the 4th (both) — charged
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 10), checkOut: at(2026, 7, 4, 12), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10, paymentEmployeeId: 1 } })
    // stay B: checked in on the 4th, still open (entry only)
    await db.stay.create({ data: { type: 'room', roomNumber: '02', checkIn: at(2026, 7, 4, 20), status: 'open', day: 'normal', guests: 2, consumptionAmount: 5, entryEmployeeId: 1 } })
    // stay C: checked in on the 3rd, out on the 5th — both outside the 4th → excluded
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 3, 10), checkOut: at(2026, 7, 5, 10), status: 'closed', day: 'normal', guests: 2, stayAmount: 160, consumptionAmount: 0, paymentEmployeeId: 1 } })

    const r = await movementReport(at(2026, 7, 4), at(2026, 7, 4))
    expect(r.rows).toHaveLength(2)
    const a = r.rows.find((x) => x.roomNumber === '01')!
    expect(a.isEntry).toBe(true); expect(a.isExit).toBe(true)
    expect(a.total).toBe(85) // 75 + 10
    const b = r.rows.find((x) => x.roomNumber === '02')!
    expect(b.isEntry).toBe(true); expect(b.isExit).toBe(false); expect(b.stayAmount).toBeNull()
    expect(r.totals.entries).toBe(2); expect(r.totals.exits).toBe(1)
    expect(r.totals.total).toBe(90) // 85 + 5
  })
})
