import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { barReport } from '@/server/data/reports'

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h)

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'occupied', categoryId: cat.id } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true } })
  await db.product.create({ data: { code: 'AGU', description: 'Água', category: 'minibar', price: 5, cost: 2, stockQty: 50, minStock: 6, trackStock: true } })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 10), status: 'open', day: 'normal', guests: 2 } })
  await db.consumption.create({ data: { stayId: stay.id, productCode: 'CLA', qty: 3, unitPrice: 10, createdAt: at(2026, 7, 4, 11) } })
  await db.consumption.create({ data: { stayId: stay.id, productCode: 'AGU', qty: 2, unitPrice: 5, createdAt: at(2026, 7, 4, 12) } })
  // out of period
  await db.consumption.create({ data: { stayId: stay.id, productCode: 'CLA', qty: 9, unitPrice: 10, createdAt: at(2026, 7, 9, 12) } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('barReport', () => {
  it('sums qty and revenue per product in the period, ordered by revenue desc', async () => {
    const r = await barReport(at(2026, 7, 4), at(2026, 7, 4))
    expect(r.rows.map((x) => x.productCode)).toEqual(['CLA', 'AGU']) // 30 > 10
    const cla = r.rows[0]
    expect(cla.qty).toBe(3); expect(cla.revenue).toBe(30); expect(cla.description).toBe('Cerveja')
    expect(r.totals.qty).toBe(5); expect(r.totals.revenue).toBe(40)
  })
})
