import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ connection: async () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound }))

import { renderToStaticMarkup } from 'react-dom/server'
import { db } from '@/server/db'
import { TicketContent } from '@/app/ticket/[stayId]/page'

let stayId: bigint
beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.consumption.deleteMany(); await db.stay.deleteMany()
  await db.room.deleteMany(); await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '07', status: 'cleaning', categoryId: cat.id } })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '07', categoryId: cat.id, checkIn: new Date(2026, 6, 4, 20), checkOut: new Date(2026, 6, 4, 23), status: 'closed', day: 'normal', guests: 2, stayAmount: 90, consumptionAmount: 0, prepaidAmount: 0, discountPercent: 0, entryEmployeeId: 1, paymentEmployeeId: 1 } })
  stayId = stay.id
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

async function render(node: Promise<React.ReactElement>) { return renderToStaticMarkup(await node) }

describe('/ticket/[stayId]', () => {
  it('renders the receipt for an existing stay', async () => {
    const html = await render(TicketContent({ params: Promise.resolve({ stayId: String(stayId) }), searchParams: Promise.resolve({}) }))
    expect(html).toContain('id="ticket"')
    expect(html).toContain('07')
  })

  it('calls notFound for a missing stay', async () => {
    await expect(render(TicketContent({ params: Promise.resolve({ stayId: '999999' }), searchParams: Promise.resolve({}) }))).rejects.toThrow(/NOT_FOUND/)
  })
})
