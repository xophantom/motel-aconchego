import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { openShift, closeShift, addCashMovement, currentShiftSummary, getOpenShiftFor } from '@/server/data/shifts'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.shift.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('shifts DAL', () => {
  it('opens a shift and rejects a second open', async () => {
    const s = await openShift({ openingBalance: 100 })
    expect(Number(s.openingBalance)).toBe(100)
    expect(s.closedAt).toBeNull()
    await expect(openShift({ openingBalance: 0 })).rejects.toThrow(/já aberto/i)
  })

  it('housekeeper cannot open', async () => {
    session.current = { id: 1, name: 'Cam', role: 'housekeeper' }
    await expect(openShift({ openingBalance: 0 })).rejects.toThrow(/forbidden/i)
  })

  it('records sangria as negative and supply as positive, attached to the open shift', async () => {
    const s = await openShift({ openingBalance: 100 })
    const w = await addCashMovement({ type: 'withdrawal', amount: 40 })
    const sup = await addCashMovement({ type: 'supply', amount: 25 })
    expect(Number(w.amount)).toBe(-40)
    expect(Number(sup.amount)).toBe(25)
    expect(w.shiftId).toBe(s.id)
  })

  it('correction is manager-only', async () => {
    await openShift({ openingBalance: 0 })
    await expect(addCashMovement({ type: 'correction', amount: 10 })).rejects.toThrow(/forbidden/i)
    session.current = { id: 1, name: 'Boss', role: 'manager' }
    const c = await addCashMovement({ type: 'correction', amount: -10 })
    expect(Number(c.amount)).toBe(-10)
  })

  it('computes metrics: nAptos by checkout window, totals, ticket médio, saldo', async () => {
    const s = await openShift({ openingBalance: 100 })
    // two stays checked out during the shift window, one before it
    const within = new Date(s.openedAt.getTime() + 60_000)
    const before = new Date(s.openedAt.getTime() - 60_000)
    await db.stay.create({ data: { type: 'room', checkIn: before, checkOut: within, status: 'closed', day: 'normal', guests: 2, stayAmount: 75 } })
    await db.stay.create({ data: { type: 'room', checkIn: before, checkOut: within, status: 'closed', day: 'normal', guests: 2, stayAmount: 85 } })
    await db.stay.create({ data: { type: 'room', checkIn: before, checkOut: before, status: 'closed', day: 'normal', guests: 2, stayAmount: 999 } })
    // stay revenue movements in the shift
    await db.cashMovement.create({ data: { type: 'stay', amount: 75, employeeId: 1, shiftId: s.id, occurredAt: within } })
    await db.cashMovement.create({ data: { type: 'stay', amount: 85, employeeId: 1, shiftId: s.id, occurredAt: within } })
    await addCashMovement({ type: 'withdrawal', amount: 50 })

    const { metrics } = await currentShiftSummary()
    expect(metrics!.nAptos).toBe(2)              // only the two within the window
    expect(metrics!.totalEstadias).toBe(160)     // 75 + 85
    expect(metrics!.totalSangrias).toBe(-50)
    expect(metrics!.ticketMedio).toBe(80)        // 160 / 2
    expect(metrics!.saldo).toBe(210)             // 100 + 160 - 50
  })

  it('closeShift closes and forbids reopening the period', async () => {
    const s = await openShift({ openingBalance: 0 })
    await closeShift(s.id, { closingBalance: 50 })
    expect((await getOpenShiftFor(new Date()))).toBeNull()
    await expect(openShift({ openingBalance: 0 })).rejects.toThrow(/já fechado/i)
  })
})

describe('audit trail', () => {
  it('openShift writes shift.open', async () => {
    const shift = await openShift({ openingBalance: 100 })
    const ev = await db.eventLog.findMany({ where: { type: 'shift.open' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(shift.id))
  })

  it('addCashMovement writes cash.<type>', async () => {
    await openShift({ openingBalance: 100 })
    await addCashMovement({ type: 'withdrawal', amount: 20, description: 'Troco' })
    const ev = await db.eventLog.findMany({ where: { type: 'cash.withdrawal' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entity).toBe('cash')
  })

  it('closeShift writes shift.close', async () => {
    const shift = await openShift({ openingBalance: 100 })
    await closeShift(shift.id, { closingBalance: 100 })
    const ev = await db.eventLog.findMany({ where: { type: 'shift.close' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(shift.id))
  })
})
