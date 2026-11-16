import { vi, describe, it, expect, beforeEach } from 'vitest'
const session = vi.hoisted(() => ({ current: { id: 1, name: 'R', role: 'reception' } as any }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { addCashMovement, closeShift, getOrOpenCurrentShift, shiftReport } from '@/server/data/shifts'
import { hashPassword } from '@/server/password'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'R', username: 'r', role: 'reception', passwordHash: await hashPassword('rpass') } })
})

describe('retirada + fechamento', () => {
  it('records a withdrawal with method', async () => {
    const s = await getOrOpenCurrentShift()
    await addCashMovement({ type: 'withdrawal', amount: 100, method: 'cash' })
    const m = await db.cashMovement.findFirstOrThrow({ where: { shiftId: s.id, type: 'withdrawal' } })
    expect(m.method).toBe('cash')
    expect(Number(m.amount)).toBe(-100)
  })

  it('close computes saldo, records final withdrawals, sets closedBy (carry is covered by shift-open)', async () => {
    const s = await getOrOpenCurrentShift() // opening 150
    const metrics = await closeShift(s.id, { finalWithdrawCash: 50, cardSlips: [], password: 'rpass' })
    expect(metrics.retiradoDinheiro).toBe(50)
    expect(metrics.saldo).toBe(100) // 150 − 50
    const closed = await db.shift.findUniqueOrThrow({ where: { id: s.id } })
    expect(closed.closedById).toBe(1)
    expect(Number(closed.closingBalance)).toBe(100)
  })

  it('records one card withdrawal per receipt and the report lists them in order', async () => {
    const s = await getOrOpenCurrentShift()
    await addCashMovement({ type: 'supply', amount: 500 }) // saldo 650
    const metrics = await closeShift(s.id, { finalWithdrawCash: 0, cardSlips: [87, 120, 45.5], password: 'rpass' })
    expect(metrics.retiradoCartao).toBe(252.5)
    expect(metrics.saldo).toBe(397.5) // 650 − 252,50
    const cards = await db.cashMovement.findMany({ where: { shiftId: s.id, type: 'withdrawal', method: 'card' } })
    expect(cards).toHaveLength(3)
    expect((await shiftReport(s.id)).cardWithdrawals).toEqual([87, 120, 45.5])
  })
})
