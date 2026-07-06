import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ connection: async () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
const redirect = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_REDIRECT') }))
vi.mock('next/navigation', () => ({ redirect }))

import { renderToStaticMarkup } from 'react-dom/server'
import { db } from '@/server/db'
import { ReportBody } from '@/app/relatorios/page'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

async function render(node: Promise<React.ReactElement>) { return renderToStaticMarkup(await node) }

describe('/relatorios selector', () => {
  it('renders the bar report table and CSV link with type', async () => {
    await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true } })
    const html = await render(ReportBody({ searchParams: Promise.resolve({ type: 'bar', from: '2026-07-04', to: '2026-07-04' }) }))
    expect(html).toMatch(/Produtos do bar/)
    expect(html).toContain('type=bar')
    expect(html).toMatch(/Receita/)
  })

  it('redirects reception', async () => {
    session.current = { id: 1, name: 'R', role: 'reception' }
    await expect(render(ReportBody({ searchParams: Promise.resolve({ type: 'bar' }) }))).rejects.toThrow(/REDIRECT/)
  })
})
