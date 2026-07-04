import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { createEntry, updateEntry, deleteEntry, listEntries, upsertCostCenter } from '@/server/data/finance'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.ledgerEntry.deleteMany()
  await db.costCenter.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
  await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
})

describe('entries CRUD', () => {
  it('reception is forbidden', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    await expect(createEntry({ entryDate: D(2026, 7, 4), kind: 'expense', amount: 10, description: 'x' })).rejects.toThrow(/forbidden/i)
  })

  it('creates an entry with the acting operator and audit event', async () => {
    const { id } = await createEntry({ entryDate: D(2026, 7, 4), kind: 'expense', amount: 25.5, description: 'Sabão', costCenter: 'LIMP' })
    const row = await db.ledgerEntry.findUniqueOrThrow({ where: { id } })
    expect(Number(row.amount)).toBe(25.5)
    expect(row.kind).toBe('expense')
    expect(row.employeeId).toBe(1)
    expect(await db.eventLog.count({ where: { type: 'finance.entry.create' } })).toBe(1)
  })

  it('updates and deletes an entry (with audit)', async () => {
    const { id } = await createEntry({ entryDate: D(2026, 7, 4), kind: 'income', amount: 100, description: 'Reembolso' })
    await updateEntry(id, { entryDate: D(2026, 7, 4), kind: 'income', amount: 120, description: 'Reembolso corrigido' })
    expect(Number((await db.ledgerEntry.findUniqueOrThrow({ where: { id } })).amount)).toBe(120)
    await deleteEntry(id)
    expect(await db.ledgerEntry.count()).toBe(0)
    expect(await db.eventLog.count({ where: { type: 'finance.entry.update' } })).toBe(1)
    expect(await db.eventLog.count({ where: { type: 'finance.entry.delete' } })).toBe(1)
  })

  it('lists filtered by period, center and kind; joins center + operator', async () => {
    await createEntry({ entryDate: D(2026, 7, 1), kind: 'expense', amount: 10, description: 'A', costCenter: 'LIMP' })
    await createEntry({ entryDate: D(2026, 7, 5), kind: 'income', amount: 20, description: 'B' })
    await createEntry({ entryDate: D(2026, 8, 1), kind: 'expense', amount: 30, description: 'C', costCenter: 'LIMP' })
    const all = await listEntries({ from: D(2026, 7, 1), to: D(2026, 7, 31) })
    expect(all.map((e) => e.description)).toEqual(['B', 'A']) // entryDate desc
    expect(all[1].centerDescription).toBe('Limpeza')
    expect(all[0].operatorName).toBe('Boss')
    const onlyExpense = await listEntries({ from: D(2026, 7, 1), to: D(2026, 7, 31), kind: 'expense' })
    expect(onlyExpense.map((e) => e.description)).toEqual(['A'])
    const onlyLimp = await listEntries({ from: D(2026, 7, 1), to: D(2026, 8, 31), costCenter: 'LIMP' })
    expect(onlyLimp.map((e) => e.description)).toEqual(['C', 'A'])
  })
})
