import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listEvents, listEventTypes, listEventOperators } from '@/server/data/audit'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  await db.employee.create({ data: { id: 2, name: 'Rita', username: 'rita', role: 'reception', passwordHash: 'x' } })
  await db.eventLog.createMany({
    data: [
      { type: 'stay.checkin', description: 'Entrada quarto 07', roomNumber: '07', employeeId: 1, occurredAt: new Date('2026-07-01T10:00:00Z') },
      { type: 'stay.checkout', description: 'Saída quarto 07', roomNumber: '07', employeeId: 2, occurredAt: new Date('2026-07-02T10:00:00Z') },
      { type: 'room.status', description: 'Quarto 03 → limpeza', roomNumber: '03', employeeId: 1, occurredAt: new Date('2026-07-03T10:00:00Z') },
    ],
  })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('listEvents authz', () => {
  it('reception is forbidden', async () => {
    session.current = { id: 2, name: 'Rita', role: 'reception' }
    await expect(listEvents({})).rejects.toThrow(/forbidden/i)
  })
})

describe('listEvents filters + order + pagination', () => {
  it('orders occurredAt desc and joins the operator name', async () => {
    const { events, total } = await listEvents({})
    expect(total).toBe(3)
    expect(events.map((e) => e.type)).toEqual(['room.status', 'stay.checkout', 'stay.checkin'])
    expect(events[2].operatorName).toBe('Boss')
  })
  it('filters by type', async () => {
    const { events, total } = await listEvents({ type: 'stay.checkin' })
    expect(total).toBe(1)
    expect(events[0].roomNumber).toBe('07')
  })
  it('filters by operator', async () => {
    const { events } = await listEvents({ employeeId: 2 })
    expect(events).toHaveLength(1)
    expect(events[0].operatorName).toBe('Rita')
  })
  it('filters by period (from/to inclusive)', async () => {
    const { total } = await listEvents({ from: new Date('2026-07-02T00:00:00Z'), to: new Date('2026-07-02T23:59:59Z') })
    expect(total).toBe(1)
  })
  it('filters by free text q (case-insensitive, on description)', async () => {
    const { total } = await listEvents({ q: 'quarto 07' })
    expect(total).toBe(2)
  })
  it('paginates with take/skip while total stays the full match count', async () => {
    const { events, total } = await listEvents({ take: 2, skip: 0 })
    expect(total).toBe(3)
    expect(events).toHaveLength(2)
    const page2 = await listEvents({ take: 2, skip: 2 })
    expect(page2.events).toHaveLength(1)
  })
})

describe('listEventTypes / listEventOperators', () => {
  it('returns the distinct types present', async () => {
    const types = await listEventTypes()
    expect(types.sort()).toEqual(['room.status', 'stay.checkin', 'stay.checkout'])
  })
  it('returns only operators that have events', async () => {
    const ops = await listEventOperators()
    expect(ops.map((o) => o.name).sort()).toEqual(['Boss', 'Rita'])
  })
})
