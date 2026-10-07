import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { upsertProduct } from '@/server/data/products'
import { updateLoyaltyPolicy } from '@/server/data/loyalty'
import { createEmployee } from '@/server/data/employees'
import { updateCategory } from '@/server/data/tariff'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.stockMovement.deleteMany(); await db.product.deleteMany()
  await db.rate.deleteMany()
  await db.roomCategory.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('config audit trail', () => {
  it('upsertProduct writes product.update', async () => {
    await upsertProduct({ code: 'AGU', description: 'Água', category: 'minibar', price: 5, cost: 2, stockQty: 0, minStock: 0, trackStock: false })
    const ev = await db.eventLog.findMany({ where: { type: 'product.update' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe('AGU')
  })

  it('loyalty policy update writes loyalty.policy', async () => {
    await updateLoyaltyPolicy({ everyVisits: 10, discountPercent: 100 })
    expect(await db.eventLog.count({ where: { type: 'loyalty.policy' } })).toBe(1)
  })

  it('createEmployee writes user.create', async () => {
    const created = await createEmployee({ name: 'Rita', username: 'rita', role: 'reception', password: 'secret123' })
    const ev = await db.eventLog.findMany({ where: { type: 'user.create' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(created.id))
  })

  it('updateCategory writes tariff.update', async () => {
    const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
    await updateCategory(cat.id, { billing: 'hotel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 })
    const ev = await db.eventLog.findMany({ where: { type: 'tariff.update' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(cat.id))
  })
})
