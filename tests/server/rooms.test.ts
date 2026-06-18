import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listRoomsWithCurrentStay, setRoomStatus } from '@/server/data/rooms'

beforeEach(async () => {
  await db.stay.deleteMany(); await db.room.deleteMany(); await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  await db.room.create({ data: { number: '01', status: 'free' } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('rooms DAL', () => {
  it('lists rooms for any logged-in user', async () => {
    const rooms = await listRoomsWithCurrentStay()
    expect(rooms).toHaveLength(1)
    expect(rooms[0].number).toBe('01')
  })
  it('reception can set maintenance with a reason', async () => {
    const r = await setRoomStatus('01', 'maintenance', 'chuveiro')
    expect(r.status).toBe('maintenance')
    expect(r.maintenanceReason).toBe('chuveiro')
  })
  it('maintenance without reason is rejected', async () => {
    await expect(setRoomStatus('01', 'maintenance')).rejects.toThrow(/reason/i)
  })
  it('housekeeper can only set cleaning/free', async () => {
    session.current = { id: 2, name: 'Cam', role: 'housekeeper' }
    await db.room.update({ where: { number: '01' }, data: { status: 'cleaning' } })
    const freed = await setRoomStatus('01', 'free')
    expect(freed.status).toBe('free')
    await expect(setRoomStatus('01', 'maintenance', 'x')).rejects.toThrow(/forbidden/i)
  })
  it('cannot set occupied directly', async () => {
    await expect(setRoomStatus('01', 'occupied')).rejects.toThrow(/check-in/i)
  })
})
