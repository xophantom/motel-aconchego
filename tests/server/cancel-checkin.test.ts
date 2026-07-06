import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkIn, cancelCheckIn } from '@/server/data/stays'
import { openShift } from '@/server/data/shifts'

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.shift.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
  await openShift({ openingBalance: 0 }) // shift open so reception passes the window
})

describe('cancelCheckIn', () => {
  it('cancels the stay, frees the room, and reverses the prepaid (net 0)', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 50 })
    await cancelCheckIn('01', 'cliente desistiu')
    const canceled = await db.stay.findUniqueOrThrow({ where: { id: stay.id } })
    expect(canceled.status).toBe('canceled')
    expect(canceled.canceledReason).toBe('cliente desistiu')
    expect(canceled.canceledById).toBe(1)
    const room = await db.room.findUniqueOrThrow({ where: { number: '01' } })
    expect(room.status).toBe('free')
    expect(room.currentStayId).toBeNull()
    const movs = await db.cashMovement.findMany({ where: { stayId: stay.id, type: 'stay' } })
    expect(movs.reduce((a, m) => a + Number(m.amount), 0)).toBe(0) // 50 + (−50)
  })

  it('rejects when the room has no open stay', async () => {
    await expect(cancelCheckIn('01', 'x')).rejects.toThrow(/not occupied/i)
  })

  it('emits a stay.cancel_checkin audit event with the reason', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await cancelCheckIn('01', 'engano')
    const ev = await db.eventLog.findMany({ where: { type: 'stay.cancel_checkin' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(stay.id))
    expect(ev[0].description).toMatch(/engano/)
  })

  it('reception with a closed shift is forbidden; manager passes', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const openShift = await db.shift.findFirstOrThrow()
    await db.shift.update({ where: { id: openShift.id }, data: { closedAt: new Date() } })
    await expect(cancelCheckIn('01', 'x')).rejects.toThrow(/shift closed/i)
    session.current = { id: 1, name: 'Boss', role: 'manager' }
    await cancelCheckIn('01', 'ok')
    expect((await db.room.findUniqueOrThrow({ where: { number: '01' } })).status).toBe('free')
  })
})
