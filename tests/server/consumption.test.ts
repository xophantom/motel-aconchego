import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { addConsumption, listConsumption, removeConsumption, walkinSale } from '@/server/data/consumption'
import { openShift, currentShiftSummary } from '@/server/data/shifts'

let stayId: bigint
beforeEach(async () => {
  await db.cashMovement.deleteMany(); await db.consumption.deleteMany(); await db.stay.deleteMany()
  await db.shift.deleteMany(); await db.product.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  await db.room.create({ data: { number: '01', status: 'occupied' } })
  await db.room.create({ data: { number: '99', status: 'free' } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true } })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
  stayId = stay.id
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('consumption', () => {
  it('adds an item, sums the stay, and decrements stock', async () => {
    await addConsumption({ stayId, productCode: 'CLA', qty: 3 })
    const stay = await db.stay.findUniqueOrThrow({ where: { id: stayId } })
    expect(Number(stay.consumptionAmount)).toBe(30)
    const prod = await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })
    expect(prod.stockQty).toBe(47)
    expect(await listConsumption(stayId)).toHaveLength(1)
  })
  it('remove reverses the stay total and the stock', async () => {
    const item = await addConsumption({ stayId, productCode: 'CLA', qty: 2 })
    await removeConsumption(item.id)
    const stay = await db.stay.findUniqueOrThrow({ where: { id: stayId } })
    expect(Number(stay.consumptionAmount)).toBe(0)
    expect((await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })).stockQty).toBe(50)
  })
  it('housekeeper cannot add consumption', async () => {
    session.current = { id: 1, name: 'Cam', role: 'housekeeper' }
    await expect(addConsumption({ stayId, productCode: 'CLA', qty: 1 })).rejects.toThrow(/forbidden/i)
  })
})

describe('walk-in sale', () => {
  it('creates a closed walkin on room 99 with a consumption cash movement and stock decrement', async () => {
    const { stay, total } = await walkinSale({ items: [{ productCode: 'CLA', qty: 2 }] })
    expect(total).toBe(20)
    expect(stay.type).toBe('walkin')
    expect(stay.status).toBe('closed')
    expect((await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })).stockQty).toBe(48)
    const mov = await db.cashMovement.findFirstOrThrow({ where: { stayId: stay.id } })
    expect(mov.type).toBe('consumption')
    expect(Number(mov.amount)).toBe(20)
  })
  it('rejects an empty sale', async () => {
    await expect(walkinSale({ items: [] })).rejects.toThrow(/empty/i)
  })
  it('rejects an unknown product code', async () => {
    await expect(walkinSale({ items: [{ productCode: 'ZZZ', qty: 1 }] })).rejects.toThrow(/inválido/i)
  })
})

describe('shiftMetrics excludes walk-ins from nAptos but includes their consumo', () => {
  it('counts a room checkout as apto and a walk-in only as consumo', async () => {
    const s = await openShift({ openingBalance: 0 })
    const within = new Date(s.openedAt.getTime() + 60_000)
    // a room stay checked out in the window with consumption
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: s.openedAt, checkOut: within, status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10 } })
    // a walk-in closed in the window
    await db.stay.create({ data: { type: 'walkin', roomNumber: '99', checkIn: within, checkOut: within, status: 'closed', stayAmount: 0, consumptionAmount: 20 } })
    const { metrics } = await currentShiftSummary()
    expect(metrics!.nAptos).toBe(1)               // only the room stay
    expect(metrics!.totalEstadias).toBe(75)
    expect(metrics!.totalConsumo).toBe(30)        // 10 (room) + 20 (walk-in)
  })
})
