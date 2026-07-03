import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkInAction, setRoomStatusAction } from '@/app/quartos/actions'

beforeEach(async () => {
  await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

function form(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('quartos actions', () => {
  it('checkInAction occupies the room', async () => {
    const res = await checkInAction({ ok: false }, form({ roomNumber: '01', day: 'normal', guests: '2', prepaidAmount: '0' }))
    expect(res.ok).toBe(true)
    expect((await db.room.findUniqueOrThrow({ where: { number: '01' } })).status).toBe('occupied')
  })
  it('setRoomStatusAction maintenance requires reason', async () => {
    const res = await setRoomStatusAction({ ok: false }, form({ number: '01', status: 'maintenance' }))
    expect(res.ok).toBe(false)
  })
})
