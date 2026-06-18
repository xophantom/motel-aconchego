import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkIn, checkOut } from '@/server/data/stays'

let categoryId: number
beforeEach(async () => {
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  categoryId = cat.id
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('check-in', () => {
  it('opens a stay and marks the room occupied', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    expect(stay.status).toBe('open')
    const room = await db.room.findUniqueOrThrow({ where: { number: '01' } })
    expect(room.status).toBe('occupied')
    expect(room.currentStayId).toBe(stay.id)
  })
  it('rejects check-in on a non-free room', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await expect(checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })).rejects.toThrow(/not free/i)
  })
  it('records a cash movement for the prepaid amount', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 50 })
    const movs = await db.cashMovement.findMany()
    expect(movs).toHaveLength(1)
    expect(Number(movs[0].amount)).toBe(50)
  })
  it('housekeeper cannot check in', async () => {
    session.current = { id: 1, name: 'Cam', role: 'housekeeper' }
    await expect(checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })).rejects.toThrow(/forbidden/i)
  })
})

describe('check-out', () => {
  it('closes the stay, computes amount, frees the room to cleaning, records balance', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 30 })
    // backdate check-in by 30 min so duration <= minPeriod -> base 75
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
    const { stayAmount } = await checkOut('01')
    expect(stayAmount).toBe(75)
    const room = await db.room.findUniqueOrThrow({ where: { number: '01' } })
    expect(room.status).toBe('cleaning')
    expect(room.currentStayId).toBeNull()
    const closed = await db.stay.findUniqueOrThrow({ where: { id: stay.id } })
    expect(closed.status).toBe('closed')
    expect(Number(closed.stayAmount)).toBe(75)
    // balance movement = stay 75 - prepaid 30 = 45 (plus the 30 prepaid movement)
    const movs = await db.cashMovement.findMany({ orderBy: { id: 'asc' } })
    expect(movs.map((m) => Number(m.amount))).toEqual([30, 45])
  })
})
