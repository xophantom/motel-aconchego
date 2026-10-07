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
  it('keeps the open shift current past its window (night closed at 07:05 is still the night)', async () => {
    const night = await db.shift.create({ data: { businessDate: new Date('2020-01-01'), period: 'night_19_07', employeeId: 1, openedAt: new Date(Date.now() - 13 * 3600_000), openingBalance: 150 } })
    const s = await getOrOpenCurrentShift()
    expect(s.id).toBe(night.id)
    expect(await db.shift.count()).toBe(1)
  })
  it('opens a new shift even if its window label was already used (early/accidental close)', async () => {
    const first = await getOrOpenCurrentShift()
    await db.shift.update({ where: { id: first.id }, data: { closedAt: new Date(), closingBalance: 300 } })
    const second = await getOrOpenCurrentShift()
    expect(second.id).not.toBe(first.id)
    expect(second.period).toBe(first.period)
    expect(Number(second.openingBalance)).toBe(300)
  })
  it('ignores a stale open shift left behind before the latest close', async () => {
    const stale = await db.shift.create({ data: { businessDate: new Date('2020-01-01'), period: 'night_19_07', employeeId: 1, openedAt: new Date(Date.now() - 20 * 3600_000), openingBalance: 150 } })
    await db.shift.create({ data: { businessDate: new Date('2020-01-02'), period: 'day_07_19', employeeId: 1, openedAt: new Date(Date.now() - 10 * 3600_000), closedAt: new Date(Date.now() - 3600_000), openingBalance: 150, closingBalance: 420 } })
    const s = await getOrOpenCurrentShift()
    expect(s.id).not.toBe(stale.id)
    expect(Number(s.openingBalance)).toBe(420)
  })
  it('concurrent first calls open a single shift', async () => {
    const all = await Promise.all([getOrOpenCurrentShift(), getOrOpenCurrentShift(), getOrOpenCurrentShift()])
    expect(new Set(all.map((s) => String(s.id))).size).toBe(1)
    expect(await db.shift.count()).toBe(1)
    expect(await db.eventLog.count({ where: { type: 'shift.open' } })).toBe(1)
  })
})
