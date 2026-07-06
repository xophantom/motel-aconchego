import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { logTicketReprintAction } from '@/app/ticket/actions'

let stayId: bigint
beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '07', status: 'cleaning', categoryId: cat.id } })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '07', categoryId: cat.id, checkIn: new Date(2026, 6, 4, 20), checkOut: new Date(2026, 6, 4, 23), status: 'closed', day: 'normal', guests: 2, stayAmount: 90, consumptionAmount: 0, prepaidAmount: 0, discountPercent: 0, entryEmployeeId: 1, paymentEmployeeId: 1 } })
  stayId = stay.id
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('logTicketReprintAction', () => {
  it('logs a ticket.reprint event for a permitted user', async () => {
    const r = await logTicketReprintAction(String(stayId))
    expect(r.ok).toBe(true)
    const ev = await db.eventLog.findMany({ where: { type: 'ticket.reprint' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(stayId))
    expect(ev[0].roomNumber).toBe('07')
  })

  it('is forbidden for housekeeper (no event written)', async () => {
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    const r = await logTicketReprintAction(String(stayId))
    expect(r.ok).toBe(false)
    expect(await db.eventLog.count({ where: { type: 'ticket.reprint' } })).toBe(0)
  })
})
