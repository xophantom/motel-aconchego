import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { getOrOpenCurrentShift, closeShift, addCashMovement, currentShiftSummary, getOpenShiftFor } from '@/server/data/shifts'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.shift.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('shifts DAL', () => {
  it('records sangria as negative and supply as positive, attached to the open shift', async () => {
    const s = await getOrOpenCurrentShift()
    const w = await addCashMovement({ type: 'withdrawal', amount: 40, method: 'cash' })
    const sup = await addCashMovement({ type: 'supply', amount: 25 })
    expect(Number(w.amount)).toBe(-40)
    expect(Number(sup.amount)).toBe(25)
    expect(w.shiftId).toBe(s.id)
  })

  it('correction is manager-only', async () => {
    await getOrOpenCurrentShift()
    await expect(addCashMovement({ type: 'correction', amount: 10 })).rejects.toThrow(/forbidden/i)
    session.current = { id: 1, name: 'Boss', role: 'manager' }
    const c = await addCashMovement({ type: 'correction', amount: -10 })
    expect(Number(c.amount)).toBe(-10)
  })

  it('computes metrics: nAptos by checkout window, totals, ticket médio, saldo', async () => {
    const s = await getOrOpenCurrentShift() // opening 150 (no prior shift, default fundo)
    const within = new Date(s.openedAt.getTime() + 60_000)
    const before = new Date(s.openedAt.getTime() - 60_000)
    await db.stay.create({ data: { type: 'room', checkIn: before, checkOut: within, status: 'closed', day: 'normal', guests: 2, stayAmount: 75 } })
    await db.stay.create({ data: { type: 'room', checkIn: before, checkOut: within, status: 'closed', day: 'normal', guests: 2, stayAmount: 85 } })
    await db.stay.create({ data: { type: 'room', checkIn: before, checkOut: before, status: 'closed', day: 'normal', guests: 2, stayAmount: 999 } })
    await db.cashMovement.create({ data: { type: 'stay', amount: 75, employeeId: 1, shiftId: s.id, occurredAt: within } })
    await db.cashMovement.create({ data: { type: 'stay', amount: 85, employeeId: 1, shiftId: s.id, occurredAt: within } })
    await addCashMovement({ type: 'withdrawal', amount: 50, method: 'cash' })

    const { metrics } = await currentShiftSummary()
    expect(metrics!.nAptos).toBe(2)
    expect(metrics!.totalEstadias).toBe(160)
    expect(metrics!.totalSangrias).toBe(-50)
    expect(metrics!.retiradoDinheiro).toBe(50)
    expect(metrics!.ticketMedio).toBe(80)
    expect(metrics!.saldo).toBe(260) // 150 + 160 - 50
  })

  it('closeShift closes and forbids reopening the period', async () => {
    const s = await getOrOpenCurrentShift()
    await closeShift(s.id, { finalWithdrawCash: 0, finalWithdrawCard: 0 })
    expect((await getOpenShiftFor(new Date()))).toBeNull()
    await expect(getOrOpenCurrentShift()).rejects.toThrow(/já fechado/i)
  })
})

describe('audit trail', () => {
  it('auto-open writes shift.open', async () => {
    const shift = await getOrOpenCurrentShift()
    const ev = await db.eventLog.findMany({ where: { type: 'shift.open' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(shift.id))
  })

  it('addCashMovement writes cash.<type>', async () => {
    await getOrOpenCurrentShift()
    await addCashMovement({ type: 'withdrawal', amount: 20, method: 'cash', description: 'Troco' })
    const ev = await db.eventLog.findMany({ where: { type: 'cash.withdrawal' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entity).toBe('cash')
  })

  it('closeShift writes shift.close', async () => {
    const shift = await getOrOpenCurrentShift()
    await closeShift(shift.id, { finalWithdrawCash: 0, finalWithdrawCard: 0 })
    const ev = await db.eventLog.findMany({ where: { type: 'shift.close' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(shift.id))
  })
})
