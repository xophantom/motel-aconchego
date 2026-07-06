import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { addStockMovement } from '@/server/data/stock'

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.stockMovement.deleteMany(); await db.consumption.deleteMany()
  await db.product.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 5, minStock: 6, trackStock: true } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('addStockMovement', () => {
  it('an entry adds to stockQty and records a movement', async () => {
    const p = await addStockMovement({ productCode: 'CLA', qty: 12, reason: 'restock' })
    expect(p.stockQty).toBe(17)
    const movs = await db.stockMovement.findMany()
    expect(movs).toHaveLength(1)
    expect(movs[0].qty).toBe(12)
    expect(movs[0].employeeId).toBe(1)
  })

  it('an entry with unitCost overwrites product.cost', async () => {
    const p = await addStockMovement({ productCode: 'CLA', qty: 6, reason: 'restock', unitCost: 4.5 })
    expect(p.cost).toBe(4.5)
  })

  it('a negative adjustment reduces stock', async () => {
    const p = await addStockMovement({ productCode: 'CLA', qty: -2, reason: 'loss', note: 'quebra' })
    expect(p.stockQty).toBe(3)
  })

  it('rejects an adjustment that would go below zero', async () => {
    await expect(addStockMovement({ productCode: 'CLA', qty: -10, reason: 'inventory' })).rejects.toThrow(/insufficient stock/i)
    expect((await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })).stockQty).toBe(5) // unchanged
    expect(await db.stockMovement.count()).toBe(0)
  })

  it('housekeeper is forbidden', async () => {
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    await expect(addStockMovement({ productCode: 'CLA', qty: 1, reason: 'restock' })).rejects.toThrow(/forbidden/i)
  })

  it('emits stock.entry for a positive qty and stock.adjust for a negative one', async () => {
    await addStockMovement({ productCode: 'CLA', qty: 3, reason: 'restock' })
    await addStockMovement({ productCode: 'CLA', qty: -1, reason: 'loss' })
    expect(await db.eventLog.count({ where: { type: 'stock.entry' } })).toBe(1)
    expect(await db.eventLog.count({ where: { type: 'stock.adjust' } })).toBe(1)
  })
})
