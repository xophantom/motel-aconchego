import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { costCenterMonthly, upsertCostCenter } from '@/server/data/finance'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.ledgerEntry.deleteMany(); await db.costCenter.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
  await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
})

describe('costCenterMonthly', () => {
  it('groups income/expense/net per center, with a no-center row, month-scoped', async () => {
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 3), kind: 'expense', amount: 40, description: 'A', costCenter: 'LIMP' } })
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 10), kind: 'income', amount: 100, description: 'B', costCenter: 'LIMP' } })
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 15), kind: 'expense', amount: 25, description: 'C' } }) // no center
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 7, 1), kind: 'expense', amount: 999, description: 'next month' } })

    const r = await costCenterMonthly(2026, 7)
    const limp = r.rows.find((x) => x.code === 'LIMP')!
    const none = r.rows.find((x) => x.code === null)!
    expect(limp.income).toBe(100); expect(limp.expense).toBe(40); expect(limp.net).toBe(60)
    expect(none.expense).toBe(25); expect(none.income).toBe(0); expect(none.net).toBe(-25)
    expect(r.totals.income).toBe(100); expect(r.totals.expense).toBe(65); expect(r.totals.net).toBe(35)
  })
})
