import { vi, describe, it, expect, beforeEach } from 'vitest'
const session = vi.hoisted(() => ({ current: { id: 1, name: 'R', role: 'reception' } as any }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { shiftMetrics } from '@/server/data/shifts'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'R', username: 'r', role: 'reception', passwordHash: 'x' } })
})

describe('shiftMetrics — retirada por método', () => {
  it('splits withdrawals into dinheiro/cartão and computes total + diferença', async () => {
    const shift = await db.shift.create({ data: { businessDate: new Date('2020-01-02'), period: 'day_07_19', employeeId: 1, openedAt: new Date('2020-01-02T07:00:00'), openingBalance: 160, expectedOpeningBalance: 150 } })
    await db.cashMovement.create({ data: { type: 'withdrawal', method: 'cash', amount: -100, employeeId: 1, shiftId: shift.id, occurredAt: new Date('2020-01-02T10:00:00') } })
    await db.cashMovement.create({ data: { type: 'withdrawal', method: 'card', amount: -420, employeeId: 1, shiftId: shift.id, occurredAt: new Date('2020-01-02T10:05:00') } })
    const m = await shiftMetrics(shift)
    expect(m.retiradoDinheiro).toBe(100)
    expect(m.retiradoCartao).toBe(420)
    expect(m.openingDifference).toBe(10) // 160 − 150
    expect(m.total).toBe(m.totalEstadias + m.totalConsumo)
  })
})
