import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { getStayForTicket } from '@/server/data/stays'

let stayId: bigint
beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.consumption.deleteMany(); await db.stay.deleteMany()
  await db.product.deleteMany(); await db.room.deleteMany(); await db.rate.deleteMany()
  await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rústico', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '07', status: 'cleaning', categoryId: cat.id } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true } })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '07', categoryId: cat.id, checkIn: new Date(2026, 6, 4, 20), checkOut: new Date(2026, 6, 4, 23), status: 'closed', day: 'normal', guests: 2, stayAmount: 90, consumptionAmount: 20, prepaidAmount: 30, discountPercent: 10, entryEmployeeId: 1, paymentEmployeeId: 1 } })
  await db.consumption.create({ data: { stayId: stay.id, productCode: 'CLA', qty: 2, unitPrice: 10 } })
  stayId = stay.id
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('getStayForTicket', () => {
  it('returns the charged fields, items and operators', async () => {
    const t = (await getStayForTicket(stayId))!
    expect(t.roomNumber).toBe('07')
    expect(t.categoryDescription).toBe('Rústico')
    expect(t.stayAmount).toBe(90)
    expect(t.consumptionAmount).toBe(20)
    expect(t.prepaidAmount).toBe(30)
    expect(t.discountPercent).toBe(10)
    expect(t.items).toEqual([{ description: 'Cerveja', qty: 2, unitPrice: 10 }])
    expect(t.entryOperator).toBe('Boss')
    expect(t.paymentOperator).toBe('Boss')
  })

  it('returns null for a missing stay', async () => {
    expect(await getStayForTicket(999999n)).toBeNull()
  })

  it('is forbidden for housekeeper', async () => {
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    await expect(getStayForTicket(stayId)).rejects.toThrow(/forbidden/i)
  })
})
