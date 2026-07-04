import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { createEntryAction, deleteEntryAction, saveCostCenterAction } from '@/app/financeiro/actions'

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const k in o) f.set(k, o[k]); return f }

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.ledgerEntry.deleteMany(); await db.costCenter.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('financeiro actions', () => {
  it('createEntryAction validates and persists with a local civil date', async () => {
    const r = await createEntryAction({ ok: false }, fd({ entryDate: '2026-07-04', kind: 'expense', amount: '12.5', description: 'Sabão' }))
    expect(r.ok).toBe(true)
    const row = await db.ledgerEntry.findFirstOrThrow()
    expect(Number(row.amount)).toBe(12.5)
    // @db.Date reads back as UTC-midnight; assert the civil date via UTC accessors
    expect(row.entryDate.getUTCFullYear()).toBe(2026)
    expect(row.entryDate.getUTCMonth()).toBe(6)  // July (0-based)
    expect(row.entryDate.getUTCDate()).toBe(4)
  })

  it('rejects invalid amount', async () => {
    const r = await createEntryAction({ ok: false }, fd({ entryDate: '2026-07-04', kind: 'expense', amount: '-5', description: 'x' }))
    expect(r.ok).toBe(false)
    expect(await db.ledgerEntry.count()).toBe(0)
  })

  it('reception gets a permission error, not a crash', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    const r = await createEntryAction({ ok: false }, fd({ entryDate: '2026-07-04', kind: 'income', amount: '5', description: 'x' }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/permiss/i)
  })

  it('saveCostCenterAction + deleteEntryAction work end-to-end', async () => {
    expect((await saveCostCenterAction({ ok: false }, fd({ code: 'LIMP', description: 'Limpeza' }))).ok).toBe(true)
    const c = await createEntryAction({ ok: false }, fd({ entryDate: '2026-07-04', kind: 'expense', amount: '9', description: 'x', costCenter: 'LIMP' }))
    expect(c.ok).toBe(true)
    const row = await db.ledgerEntry.findFirstOrThrow()
    expect((await deleteEntryAction(String(row.id))).ok).toBe(true)
    expect(await db.ledgerEntry.count()).toBe(0)
  })
})
