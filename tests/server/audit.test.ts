import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { logEvent } from '@/server/audit'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('logEvent', () => {
  it('writes an event stamped with the session operator', async () => {
    await logEvent({ type: 'stay.checkin', description: 'Entrada quarto 07', entity: 'stay', entityId: '42', roomNumber: '07' })
    const rows = await db.eventLog.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('stay.checkin')
    expect(rows[0].description).toBe('Entrada quarto 07')
    expect(rows[0].entity).toBe('stay')
    expect(rows[0].entityId).toBe('42')
    expect(rows[0].roomNumber).toBe('07')
    expect(rows[0].employeeId).toBe(1)
    expect(rows[0].occurredAt).toBeInstanceOf(Date)
  })

  it('writes employeeId=null when there is no session (e.g. a job)', async () => {
    session.current = null
    await logEvent({ type: 'room.status', description: 'Quarto 03 → limpeza' })
    const rows = await db.eventLog.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].employeeId).toBeNull()
    expect(rows[0].entity).toBeNull()
  })

  it('never throws — a DB error is swallowed', async () => {
    const spy = vi.spyOn(db.eventLog, 'create').mockRejectedValueOnce(new Error('boom'))
    await expect(logEvent({ type: 'x', description: 'y' })).resolves.toBeUndefined()
    const rows = await db.eventLog.findMany()
    expect(rows).toHaveLength(0)
    spy.mockRestore()
  })
})
