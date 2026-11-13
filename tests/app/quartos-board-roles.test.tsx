import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ connection: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
const redirect = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_REDIRECT') }))
vi.mock('next/navigation', () => ({ redirect }))
// Actions pull server-only/next-cache; stub the module (any named export is a no-op).
vi.mock('@/app/quartos/actions', () => new Proxy({}, {
  get: (_t, prop) => (prop === 'then' ? undefined : async () => ({ ok: false })),
  has: () => true,
}))

import { renderToStaticMarkup } from 'react-dom/server'
import { db } from '@/server/db'
import { Board } from '@/app/quartos/page'

beforeEach(async () => {
  await db.employee.createMany({ data: [
    { id: 1, name: 'Rita', username: 'rita', role: 'reception', passwordHash: 'x' },
    { id: 2, name: 'Cami', username: 'cami', role: 'housekeeper', passwordHash: 'x' },
  ] })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.createMany({ data: [{ number: '01', status: 'free', categoryId: cat.id }, { number: '02', status: 'free', categoryId: cat.id }] })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
  await db.room.update({ where: { number: '01' }, data: { status: 'occupied', currentStayId: stay.id } })
})

describe('/quartos board by role', () => {
  it('housekeeper sees the board with an occupied room, without the walk-in sale', async () => {
    session.current = { id: 2, name: 'Cami', role: 'housekeeper' }
    const html = renderToStaticMarkup(await Board())
    expect(html).toContain('01')
    expect(html).toContain('02')
    expect(html).not.toContain('Venda avulsa')
  })
  it('reception still gets it, with the walk-in sale', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    const html = renderToStaticMarkup(await Board())
    expect(html).toContain('01')
    expect(html).toContain('Venda avulsa')
  })
})
