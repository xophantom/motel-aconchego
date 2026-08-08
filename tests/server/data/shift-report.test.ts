import { vi, describe, it, expect, beforeEach } from 'vitest'
const session = vi.hoisted(() => ({ current: { id: 1, name: 'Rec', role: 'reception' } as any }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { shiftReport } from '@/server/data/shifts'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Rec', username: 'rec', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
})

describe('shiftReport', () => {
  it('lists closed stays in the window and summarizes', async () => {
    const shift = await db.shift.create({ data: { businessDate: new Date('2020-03-01'), period: 'day_07_19', employeeId: 1, openedAt: new Date('2020-03-01T07:00:00'), openingBalance: 150, expectedOpeningBalance: 150 } })
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: new Date('2020-03-01T09:00:00'), checkOut: new Date('2020-03-01T11:00:00'), status: 'closed', stayAmount: 75, consumptionAmount: 20 } })
    const rep = await shiftReport(shift.id)
    expect(rep.lines).toHaveLength(1)
    expect(rep.lines[0]).toMatchObject({ room: '01', stayAmount: 75, consumptionAmount: 20 })
    expect(rep.metrics.total).toBe(rep.metrics.totalEstadias + rep.metrics.totalConsumo)
    expect(rep.closedByName).toBeNull()
  })
})
