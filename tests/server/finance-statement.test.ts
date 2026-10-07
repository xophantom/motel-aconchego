import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { dailyStatement, statementRange } from '@/server/data/finance'

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h)

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.ledgerEntry.deleteMany(); await db.costCenter.deleteMany()
  await db.cashMovement.deleteMany(); await db.consumption.deleteMany(); await db.stay.deleteMany()
  await db.room.deleteMany(); await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  await db.room.create({ data: { number: '01', status: 'free' } })
  await db.room.create({ data: { number: '99', status: 'free' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('dailyStatement', () => {
  it('is forbidden for reception', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    await expect(dailyStatement(at(2026, 7, 4))).rejects.toThrow(/forbidden/i)
  })

  it('aggregates stays, consumption, cash, and ledger for one civil day', async () => {
    // a room stay checked out on the 4th: stayAmount 75, consumption 10
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 10), checkOut: at(2026, 7, 4, 11), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10 } })
    // a walk-in closed on the 4th: consumption 20
    await db.stay.create({ data: { type: 'walkin', roomNumber: '99', checkIn: at(2026, 7, 4, 12), checkOut: at(2026, 7, 4, 12), status: 'closed', stayAmount: 0, consumptionAmount: 20 } })
    // cash: +85 (stay balance), +20 (walkin), -30 (sangria)
    await db.cashMovement.create({ data: { type: 'stay', amount: 85, occurredAt: at(2026, 7, 4, 11), employeeId: 1 } })
    await db.cashMovement.create({ data: { type: 'consumption', amount: 20, occurredAt: at(2026, 7, 4, 12), employeeId: 1 } })
    await db.cashMovement.create({ data: { type: 'withdrawal', amount: -30, occurredAt: at(2026, 7, 4, 13), employeeId: 1 } })
    // ledger: expense 40, income 15 on the 4th
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 4), kind: 'expense', amount: 40, description: 'Compra' } })
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 4), kind: 'income', amount: 15, description: 'Venda' } })
    // noise on the 5th (must be excluded)
    await db.cashMovement.create({ data: { type: 'supply', amount: 999, occurredAt: at(2026, 7, 5, 10), employeeId: 1 } })

    const s = await dailyStatement(at(2026, 7, 4))
    expect(s.date).toBe('2026-07-04')
    expect(s.stays).toBe(75)
    expect(s.consumption).toBe(30)          // 10 (room) + 20 (walk-in)
    expect(s.cashIn).toBe(105)              // 85 + 20
    expect(s.cashOut).toBe(30)              // |−30|
    expect(s.expenses).toBe(40)
    expect(s.income).toBe(15)
    expect(s.net).toBe(50)                  // (105 − 30) + 15 − 40 = 50
  })

  it('a 22:00 BRT movement (01:00 UTC next day) counts on its Brasília day', async () => {
    await db.cashMovement.create({ data: { type: 'stay', amount: 50, occurredAt: new Date('2026-07-04T22:00:00-03:00'), employeeId: 1 } })
    expect((await dailyStatement(at(2026, 7, 4))).cashIn).toBe(50)
    expect((await dailyStatement(at(2026, 7, 5))).cashIn).toBe(0)
  })
})

describe('statementRange', () => {
  it('produces one row per civil day and correct totals', async () => {
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 4), kind: 'expense', amount: 40, description: 'A' } })
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 5), kind: 'income', amount: 100, description: 'B' } })
    const r = await statementRange(new Date(2026, 6, 4), new Date(2026, 6, 6))
    expect(r.days.map((d) => d.date)).toEqual(['2026-07-04', '2026-07-05', '2026-07-06'])
    expect(r.days[0].expenses).toBe(40)
    expect(r.days[1].income).toBe(100)
    expect(r.totals.expenses).toBe(40)
    expect(r.totals.income).toBe(100)
    expect(r.totals.net).toBe(60) // (0) + 100 - 40
  })
})
