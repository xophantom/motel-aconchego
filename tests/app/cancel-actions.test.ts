import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkIn } from '@/server/data/stays'
import { openShift } from '@/server/data/shifts'
import { cancelCheckInAction, cancelCheckOutAction } from '@/app/quartos/actions'

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const k in o) f.set(k, o[k]); return f }

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.shift.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
  await openShift({ openingBalance: 0 })
})

describe('cancel actions', () => {
  it('requires a reason', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const r = await cancelCheckInAction('01', { ok: false }, fd({ reason: '' }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/motivo/i)
  })

  it('cancelCheckInAction cancels with a reason', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const r = await cancelCheckInAction('01', { ok: false }, fd({ reason: 'engano' }))
    expect(r.ok).toBe(true)
    expect((await db.room.findUniqueOrThrow({ where: { number: '01' } })).status).toBe('free')
  })

  it('maps "no closed stay" to a friendly message', async () => {
    const r = await cancelCheckOutAction('01', { ok: false }, fd({ reason: 'x' }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/nada a cancelar/i)
  })
})
