import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { reportView, REPORT_TYPES } from '@/server/data/reports'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('reportView', () => {
  it('exposes the five report types', () => {
    expect(REPORT_TYPES).toEqual(['occupancy', 'movement', 'stays_orders', 'bar', 'operator'])
  })

  it('defaults to occupancy for a missing/invalid type', async () => {
    const v = await reportView({})
    expect(v.type).toBe('occupancy')
    expect(v.period.kind).toBe('month')
    expect(v.columns[0].label).toMatch(/Apto/i)
    const v2 = await reportView({ type: 'nope' })
    expect(v2.type).toBe('occupancy')
  })

  it('builds a range report with columns for movement', async () => {
    const v = await reportView({ type: 'movement', from: '2026-07-04', to: '2026-07-04' })
    expect(v.type).toBe('movement')
    expect(v.period).toEqual({ kind: 'range', from: new Date(Date.UTC(2026, 6, 4)), to: new Date(Date.UTC(2026, 6, 4)) }) // civil dates = UTC midnight
    expect(v.columns.some((c) => c.key === 'operator')).toBe(true)
  })

  it('is forbidden for reception', async () => {
    session.current = { id: 1, name: 'R', role: 'reception' }
    await expect(reportView({ type: 'bar', from: '2026-07-04', to: '2026-07-04' })).rejects.toThrow(/forbidden/i)
  })
})
