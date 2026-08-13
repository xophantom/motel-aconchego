import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listProducts, upsertProduct, lowStockProducts } from '@/server/data/products'

beforeEach(async () => {
  await db.consumption.deleteMany(); await db.stockMovement.deleteMany(); await db.product.deleteMany()
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('products DAL', () => {
  it('manager upserts (create then update) a product', async () => {
    await upsertProduct({ code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true })
    let p = await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })
    expect(Number(p.price)).toBe(10)
    await upsertProduct({ code: 'CLA', description: 'Cerveja Latão', category: 'minibar', price: 12, cost: 4, stockQty: 40, minStock: 6, trackStock: true })
    p = await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })
    expect(Number(p.price)).toBe(12)
    expect(p.description).toBe('Cerveja Latão')
  })
  it('any logged-in user can list', async () => {
    await upsertProduct({ code: 'AGU', description: 'Água', category: 'minibar', price: 5, cost: 1, stockQty: 10, minStock: 2, trackStock: true })
    session.current = { id: 2, name: 'R', role: 'reception' }
    expect(await listProducts()).toHaveLength(1)
  })
  it('reception cannot upsert', async () => {
    session.current = { id: 2, name: 'R', role: 'reception' }
    await expect(upsertProduct({ code: 'X', description: 'x', category: 'other', price: 1, cost: 0, stockQty: 0, minStock: 0, trackStock: true })).rejects.toThrow(/forbidden/i)
  })

  it('lowStockProducts returns only tracked items at or below their minimum', async () => {
    await upsertProduct({ code: 'A', description: 'Baixo', category: 'minibar', price: 1, cost: 0, stockQty: 2, minStock: 5, trackStock: true })
    await upsertProduct({ code: 'B', description: 'Ok', category: 'minibar', price: 1, cost: 0, stockQty: 10, minStock: 5, trackStock: true })
    await upsertProduct({ code: 'C', description: 'Sem controle', category: 'minibar', price: 1, cost: 0, stockQty: 0, minStock: 5, trackStock: false })
    const low = await lowStockProducts()
    expect(low.map((p) => p.code)).toEqual(['A'])
  })
})
