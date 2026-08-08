import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkIn, checkOut, cancelCheckOut } from '@/server/data/stays'
import { getOrOpenCurrentShift } from '@/server/data/shifts'

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.shift.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
  await getOrOpenCurrentShift()
})

async function closedStay() {
  const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 30 })
  await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
  await checkOut('01') // stayAmount 75, balance 45
  return stay
}

describe('cancelCheckOut', () => {
  it('reopens the stay, re-occupies the room, reverses the checkout balance (prepaid kept)', async () => {
    const stay = await closedStay()
    await cancelCheckOut('01', 'saiu por engano')
    const reopened = await db.stay.findUniqueOrThrow({ where: { id: stay.id } })
    expect(reopened.status).toBe('open')
    expect(reopened.checkOut).toBeNull()
    expect(reopened.stayAmount).toBeNull()
    const room = await db.room.findUniqueOrThrow({ where: { number: '01' } })
    expect(room.status).toBe('occupied')
    expect(room.currentStayId).toBe(stay.id)
    // prepaid 30 stays; checkout balance 45 and its −45 reversal net 0 → sum of stay movements = 30
    const movs = await db.cashMovement.findMany({ where: { stayId: stay.id, type: 'stay' } })
    expect(movs.reduce((a, m) => a + Number(m.amount), 0)).toBe(30)
  })

  it('emits a stay.cancel_checkout audit event', async () => {
    const stay = await closedStay()
    await cancelCheckOut('01', 'engano')
    const ev = await db.eventLog.findMany({ where: { type: 'stay.cancel_checkout' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(stay.id))
  })

  it('rejects when the room was reoccupied', async () => {
    await closedStay()
    await db.room.update({ where: { number: '01' }, data: { status: 'occupied' } })
    await expect(cancelCheckOut('01', 'x')).rejects.toThrow(/reoccupied/i)
  })

  it('rejects when there is no closed stay', async () => {
    await expect(cancelCheckOut('01', 'x')).rejects.toThrow(/no closed stay/i)
  })
})
