import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listCostCenters, upsertCostCenter, deleteCostCenter } from '@/server/data/finance'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.ledgerEntry.deleteMany()
  await db.costCenter.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('cost centers', () => {
  it('reception is forbidden', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    await expect(listCostCenters()).rejects.toThrow(/forbidden/i)
    await expect(upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })).rejects.toThrow(/forbidden/i)
  })

  it('creates, updates (upsert), and lists with entry counts', async () => {
    await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
    await upsertCostCenter({ code: 'LIMP', description: 'Limpeza & higiene' })
    const centers = await listCostCenters()
    expect(centers).toHaveLength(1)
    expect(centers[0].description).toBe('Limpeza & higiene')
    expect(centers[0].entryCount).toBe(0)
  })

  it('deletes an unused center', async () => {
    await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
    await deleteCostCenter('LIMP')
    expect(await listCostCenters()).toHaveLength(0)
  })

  it('blocks delete when entries reference the center', async () => {
    await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 4), kind: 'expense', amount: 10, description: 'Sabão', costCenter: 'LIMP' } })
    await expect(deleteCostCenter('LIMP')).rejects.toThrow(/uso/i)
    expect(await listCostCenters()).toHaveLength(1)
  })

  it('emits audit events on upsert and delete', async () => {
    await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
    await deleteCostCenter('LIMP')
    const up = await db.eventLog.findMany({ where: { type: 'finance.costcenter.upsert' } })
    const del = await db.eventLog.findMany({ where: { type: 'finance.costcenter.delete' } })
    expect(up).toHaveLength(1)
    expect(del).toHaveLength(1)
  })
})
