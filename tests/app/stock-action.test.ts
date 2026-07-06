import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { stockMovementAction } from '@/app/produtos/actions'

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const k in o) f.set(k, o[k]); return f }

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.stockMovement.deleteMany(); await db.consumption.deleteMany()
  await db.product.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 5, minStock: 6, trackStock: true } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('stockMovementAction', () => {
  it('registers an entry', async () => {
    const r = await stockMovementAction({ ok: false }, fd({ productCode: 'CLA', qty: '12', reason: 'restock' }))
    expect(r.ok).toBe(true)
    expect((await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })).stockQty).toBe(17)
  })

  it('rejects qty = 0', async () => {
    const r = await stockMovementAction({ ok: false }, fd({ productCode: 'CLA', qty: '0', reason: 'restock' }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/inválid/i)
  })

  it('maps insufficient stock', async () => {
    const r = await stockMovementAction({ ok: false }, fd({ productCode: 'CLA', qty: '-10', reason: 'inventory' }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/insuficiente/i)
  })
})
