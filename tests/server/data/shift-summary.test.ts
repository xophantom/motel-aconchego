import { vi, describe, it, expect, beforeEach } from 'vitest'
const session = vi.hoisted(() => ({ current: { id: 1, name: 'R', role: 'reception' } as any }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { currentShiftSummary } from '@/server/data/shifts'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'R', username: 'r', role: 'reception', passwordHash: 'x' } })
})

describe('currentShiftSummary', () => {
  it('auto-opens the current shift when viewing', async () => {
    const s = await currentShiftSummary()
    expect(s.shift).not.toBeNull()
    expect(s.metrics).not.toBeNull()
  })
})
