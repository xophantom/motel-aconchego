import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listProducts, createProduct, updateProduct, lowStockProducts, ProductCodeTakenError } from '@/server/data/products'

const base = { category: 'minibar' as const, price: 1, cost: 0, stockQty: 0, minStock: 0, trackStock: true }

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('products DAL', () => {
  it('creates with the code uppercased; the initial stock goes into the history', async () => {
    await createProduct({ ...base, code: ' cla ', description: 'Cerveja', price: 10, stockQty: 50 })
    const p = await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })
    expect(p).toMatchObject({ description: 'Cerveja', stockQty: 50 })
    expect(await db.stockMovement.findMany({ select: { productCode: true, qty: true, reason: true, note: true } }))
      .toEqual([{ productCode: 'CLA', qty: 50, reason: 'inventory', note: 'estoque inicial' }])
  })
  it('refuses an existing code ignoring case, without touching the product', async () => {
    await db.product.create({ data: { ...base, code: 'REF', description: 'Refrigerante', stockQty: 30 } })
    await db.product.create({ data: { ...base, code: 'Xav', description: 'Chave Perdida' } }) // legacy mixed case
    await expect(createProduct({ ...base, code: 'ref', description: 'Cadastro', stockQty: 6 })).rejects.toBeInstanceOf(ProductCodeTakenError)
    await expect(createProduct({ ...base, code: 'XAV', description: 'Outra' })).rejects.toMatchObject({ existing: { code: 'Xav', description: 'Chave Perdida' } })
    expect(await db.product.count()).toBe(2)
    expect(await db.product.findUniqueOrThrow({ where: { code: 'REF' } })).toMatchObject({ description: 'Refrigerante', stockQty: 30 })
  })
  it('edits description/price/etc. by code and never the stock', async () => {
    await createProduct({ ...base, code: 'CLA', description: 'Cerveja', price: 10, stockQty: 40 })
    await updateProduct('CLA', { description: 'Cerveja Latão', category: 'minibar', price: 12, cost: 4, minStock: 6, trackStock: true })
    const p = await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })
    expect(p).toMatchObject({ description: 'Cerveja Latão', minStock: 6, stockQty: 40 })
    expect(Number(p.price)).toBe(12)
  })
  it('any logged-in user can list', async () => {
    await createProduct({ ...base, code: 'AGU', description: 'Água' })
    session.current = { id: 2, name: 'R', role: 'reception' }
    expect(await listProducts()).toHaveLength(1)
  })
  it('reception cannot create or edit', async () => {
    await createProduct({ ...base, code: 'AGU', description: 'Água' })
    session.current = { id: 2, name: 'R', role: 'reception' }
    await expect(createProduct({ ...base, code: 'X', description: 'x' })).rejects.toThrow(/forbidden/i)
    await expect(updateProduct('AGU', { description: 'x', category: 'other', price: 1, cost: 0, minStock: 0, trackStock: true })).rejects.toThrow(/forbidden/i)
  })

  it('lowStockProducts returns only tracked items at or below their minimum', async () => {
    await createProduct({ ...base, code: 'A', description: 'Baixo', stockQty: 2, minStock: 5 })
    await createProduct({ ...base, code: 'B', description: 'Ok', stockQty: 10, minStock: 5 })
    await createProduct({ ...base, code: 'C', description: 'Sem controle', minStock: 5, trackStock: false })
    const low = await lowStockProducts()
    expect(low.map((p) => p.code)).toEqual(['A'])
  })
})
