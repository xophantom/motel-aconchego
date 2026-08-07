import { vi, describe, it, expect, beforeEach } from 'vitest'
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { getOrOpenCurrentShift } from '@/server/data/shifts'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'R', username: 'r', role: 'reception', passwordHash: 'x' } })
  session.current = { id: 1, name: 'R', role: 'reception' }
})

describe('getOrOpenCurrentShift', () => {
  it('opens with the configured expected float when there is no prior shift', async () => {
    const s = await getOrOpenCurrentShift()
    expect(Number(s.openingBalance)).toBe(150)
    expect(s.closedAt).toBeNull()
  })
  it('is idempotent within the same period', async () => {
    const a = await getOrOpenCurrentShift()
    const b = await getOrOpenCurrentShift()
    expect(String(a.id)).toBe(String(b.id))
  })
  it('carries the closing balance of the last closed shift', async () => {
    await db.shift.create({ data: { businessDate: new Date('2020-01-01'), period: 'day_07_19', employeeId: 1, openedAt: new Date('2020-01-01T07:00:00'), closedAt: new Date('2020-01-01T19:00:00'), openingBalance: 150, closingBalance: 640 } })
    const s = await getOrOpenCurrentShift()
    expect(Number(s.openingBalance)).toBe(640)
  })
})
