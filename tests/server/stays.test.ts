import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkIn, checkOut, addPrepaid, updateCheckInTime } from '@/server/data/stays'
import { formatHm } from '@/lib/time'

let categoryId: number
beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.loyaltyRedemption.deleteMany()
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

  it('overnight stay is charged the flat overnight price', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', chargeMode: 'overnight', guests: 2, prepaidAmount: 0 })
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
    const { stayAmount } = await checkOut('01')
    expect(stayAmount).toBe(160) // overnightPrice, not the 30-min base
  })

  it('applies the loyalty discount to the stay value only', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', chargeMode: 'overnight', guests: 2, prepaidAmount: 0 })
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000), discountPercent: 50 } })
    const { stayAmount } = await checkOut('01')
    expect(stayAmount).toBe(80) // 160 overnight * 50% off
  })

  it('a free stay (loyalty 100%) charges only consumption minus prepaid', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', chargeMode: 'overnight', guests: 2, prepaidAmount: 0 })
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000), discountPercent: 100, consumptionAmount: 12 } })
    const { stayAmount, balance } = await checkOut('01')
    expect(stayAmount).toBe(0)
    expect(balance).toBe(12)
  })
})

describe('audit trail', () => {
  it('check-in writes a stay.checkin event', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const ev = await db.eventLog.findMany({ where: { type: 'stay.checkin' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entity).toBe('stay')
    expect(ev[0].entityId).toBe(String(stay.id))
    expect(ev[0].roomNumber).toBe('01')
    expect(ev[0].employeeId).toBe(1)
  })

  it('check-out writes a stay.checkout event', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
    await checkOut('01')
    const ev = await db.eventLog.findMany({ where: { type: 'stay.checkout' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(stay.id))
    expect(ev[0].roomNumber).toBe('01')
  })
})

const minutesAgo = (n: number) => new Date(Date.now() - n * 60000)

describe('check-in with a typed entry time', () => {
  it('back-dates the entry to the typed time (forgot to check in)', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0, checkInTime: formatHm(minutesAgo(90)) })
    const ageMin = (Date.now() - stay.checkIn.getTime()) / 60000
    expect(ageMin).toBeGreaterThanOrEqual(89)
    expect(ageMin).toBeLessThan(92)
  })
  it('without a typed time it uses now', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    expect(Date.now() - stay.checkIn.getTime()).toBeLessThan(5000)
  })
  it('rejects an entry older than 12h', async () => {
    await expect(checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0, checkInTime: formatHm(minutesAgo(13 * 60)) })).rejects.toThrow(/too old/)
  })
  it('rejects an entry before the room\'s previous checkout', async () => {
    await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId, checkIn: minutesAgo(240), checkOut: minutesAgo(60), status: 'closed', stayAmount: 75 } })
    await expect(checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0, checkInTime: formatHm(minutesAgo(120)) })).rejects.toThrow(/previous checkout/)
    const ok = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0, checkInTime: formatHm(minutesAgo(30)) })
    expect(ok.status).toBe('open')
  })
})

describe('prepaid after entry', () => {
  it('adds to the stay prepaid, records a cash movement and is deducted at checkout', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 20 })
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: minutesAgo(30) } })
    const updated = await addPrepaid('01', 40)
    expect(Number(updated.prepaidAmount)).toBe(60)
    const { balance } = await checkOut('01')
    expect(balance).toBe(15) // 75 - (20 + 40)
    const movs = await db.cashMovement.findMany({ orderBy: { id: 'asc' } })
    expect(movs.map((m) => Number(m.amount))).toEqual([20, 40, 15])
    expect(await db.eventLog.count({ where: { type: 'stay.prepaid' } })).toBe(1)
  })
  it('rejects a free room and non-positive amounts', async () => {
    await expect(addPrepaid('01', 10)).rejects.toThrow(/not occupied/)
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await expect(addPrepaid('01', 0)).rejects.toThrow(/invalid amount/)
  })
  it('housekeeper cannot launch prepaid', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    session.current = { id: 1, name: 'Cam', role: 'housekeeper' }
    await expect(addPrepaid('01', 10)).rejects.toThrow(/forbidden/i)
  })
})

describe('edit entry time', () => {
  it('moves the open stay entry and logs before → after', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const typed = formatHm(minutesAgo(45))
    const updated = await updateCheckInTime('01', typed)
    expect(updated.id).toBe(stay.id)
    expect(formatHm(updated.checkIn)).toBe(typed)
    const ev = await db.eventLog.findFirstOrThrow({ where: { type: 'stay.edit_checkin' } })
    expect(ev.description).toContain(`→ ${typed}`)
  })
  it('respects the previous checkout of the room', async () => {
    await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId, checkIn: minutesAgo(240), checkOut: minutesAgo(60), status: 'closed', stayAmount: 75 } })
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await expect(updateCheckInTime('01', formatHm(minutesAgo(90)))).rejects.toThrow(/previous checkout/)
  })
  it('rejects a room that is not occupied', async () => {
    await expect(updateCheckInTime('01', '10:00')).rejects.toThrow(/not occupied/)
  })
})
