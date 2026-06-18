import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkIn, checkOut } from '@/server/data/stays'
import { openShift } from '@/server/data/shifts'

beforeEach(async () => {
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.shift.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

it('checkout movement is attached to the open shift', async () => {
  const shift = await openShift({ openingBalance: 0 })
  const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
  await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
  await checkOut('01')
  const mov = await db.cashMovement.findFirstOrThrow({ where: { stayId: stay.id } })
  expect(mov.shiftId).toBe(shift.id)
})

it('movement has null shift when no caixa is open (does not block)', async () => {
  const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 50 })
  const mov = await db.cashMovement.findFirstOrThrow({ where: { stayId: stay.id } })
  expect(mov.shiftId).toBeNull()
})
