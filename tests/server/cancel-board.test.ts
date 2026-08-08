import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listRoomsWithCurrentStay } from '@/server/data/rooms'
import { canCancelNow, checkIn, checkOut } from '@/server/data/stays'
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
})

describe('board cancel data', () => {
  it('lastClosedStayId points at the most recent closed stay of a freed room', async () => {
    await getOrOpenCurrentShift()
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
    await checkOut('01') // room now 'cleaning'
    const rooms = await listRoomsWithCurrentStay()
    const r01 = rooms.find((r) => r.number === '01')!
    expect(r01.lastClosedStayId).toBe(stay.id)
  })

  it('lastClosedStayId is null for an occupied room and for a never-used room', async () => {
    await getOrOpenCurrentShift()
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const rooms = await listRoomsWithCurrentStay()
    expect(rooms.find((r) => r.number === '01')!.lastClosedStayId).toBeNull()
  })

  it('canCancelNow: reception needs an open shift; manager always; housekeeper never', async () => {
    expect(await canCancelNow()).toBe(false) // reception, no shift
    await getOrOpenCurrentShift()
    expect(await canCancelNow()).toBe(true)  // reception, shift open
    session.current = { id: 1, name: 'M', role: 'manager' }
    await db.shift.updateMany({ data: { closedAt: new Date() } })
    expect(await canCancelNow()).toBe(true)  // manager, shift closed
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    expect(await canCancelNow()).toBe(false)
  })
})
