import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { addStockMovement, listStockMovements } from '@/server/data/stock'
import { addConsumption } from '@/server/data/consumption'

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.stockMovement.deleteMany()
  await db.cashMovement.deleteMany(); await db.consumption.deleteMany(); await db.stay.deleteMany()
  await db.room.deleteMany(); await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  await db.product.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true } })
  await db.product.create({ data: { code: 'AGU', description: 'Água', category: 'minibar', price: 5, cost: 2, stockQty: 20, minStock: 6, trackStock: true } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('listStockMovements', () => {
  it('lists desc with product + operator, filterable by product', async () => {
    await addStockMovement({ productCode: 'CLA', qty: 10, reason: 'restock' })
    await addStockMovement({ productCode: 'AGU', qty: 5, reason: 'restock' })
    const all = await listStockMovements({})
    expect(all).toHaveLength(2)
    expect(all[0].productCode).toBe('AGU') // most recent first
    expect(all[0].operatorName).toBe('Boss')
    expect(all[0].productDescription).toBe('Água')
    const onlyCla = await listStockMovements({ productCode: 'CLA' })
    expect(onlyCla.map((m) => m.productCode)).toEqual(['CLA'])
  })

  it('is forbidden for housekeeper', async () => {
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    await expect(listStockMovements({})).rejects.toThrow(/forbidden/i)
  })
})

describe('consumption does not create a StockMovement (no double counting)', () => {
  it('addConsumption decrements stock via consumption only', async () => {
    const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
    await db.room.create({ data: { number: '01', status: 'occupied', categoryId: cat.id } })
    const stay = await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
    await addConsumption({ stayId: stay.id, productCode: 'CLA', qty: 2 })
    expect((await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })).stockQty).toBe(48) // 50 − 2
    expect(await db.stockMovement.count()).toBe(0) // consumption is NOT a stock movement
  })
})
