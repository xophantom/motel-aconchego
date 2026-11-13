import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ connection: async () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
const redirect = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_REDIRECT') }))
vi.mock('next/navigation', () => ({ redirect }))

import { renderToStaticMarkup } from 'react-dom/server'
import { db } from '@/server/db'
import { ProductsBody } from '@/app/produtos/page'

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.stockMovement.deleteMany(); await db.consumption.deleteMany()
  await db.product.deleteMany(); await db.employee.deleteMany()
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 5, minStock: 6, trackStock: true } })
  session.current = { id: 1, name: 'Rita', role: 'reception' }
})

async function render(node: Promise<React.ReactElement>) { return renderToStaticMarkup(await node) }

describe('/produtos access', () => {
  it('reception sees the stock section but not the product register', async () => {
    const html = await render(ProductsBody({ searchParams: Promise.resolve({}) }))
    expect(html).toMatch(/Reposição/i)
    expect(html).not.toContain('Novo produto')
    expect(html).not.toContain('>Editar<')
    expect(html).toContain('Quantidade atual') // shown once a product is picked
  })

  it('manager sees the register too, below the restock (the everyday task)', async () => {
    session.current = { id: 1, name: 'Boss', role: 'manager' }
    const html = await render(ProductsBody({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Novo produto')
    expect(html).toContain('>Editar<')
    expect(html.indexOf('Reposição')).toBeLessThan(html.indexOf('Novo produto'))
  })

  it('housekeeper is redirected', async () => {
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    await expect(render(ProductsBody({ searchParams: Promise.resolve({}) }))).rejects.toThrow(/REDIRECT/)
  })
})
