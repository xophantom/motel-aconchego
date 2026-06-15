import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listEmployees, createEmployee, deactivateEmployee, countActiveManagers, updateEmployee, resetPassword } from '@/server/data/employees'
import { verifyPassword } from '@/server/password'

beforeEach(async () => {
  await db.employee.deleteMany()
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('employees DAL', () => {
  it('manager creates a user with hashed password', async () => {
    const e = await createEmployee({ name: 'Estela', username: 'estela', role: 'reception', password: 'abcdef' })
    expect(e.username).toBe('estela')
    const fresh = await db.employee.findUniqueOrThrow({ where: { username: 'estela' } })
    expect(await verifyPassword('abcdef', fresh.passwordHash)).toBe(true)
  })
  it('non-manager cannot list/create', async () => {
    session.current = { id: 2, name: 'Recep', role: 'reception' }
    await expect(listEmployees()).rejects.toThrow(/forbidden/i)
    await expect(createEmployee({ name: 'X', username: 'x', role: 'reception', password: 'abcdef' })).rejects.toThrow(/forbidden/i)
  })
  it('cannot deactivate the last active manager', async () => {
    const m = await createEmployee({ name: 'Only', username: 'only', role: 'manager', password: 'abcdef' })
    await db.employee.updateMany({ where: { role: 'manager', id: { not: m.id } }, data: { active: false } })
    await expect(deactivateEmployee(m.id)).rejects.toThrow(/last manager/i)
    expect(await countActiveManagers()).toBeGreaterThanOrEqual(1)
  })

  it('cannot demote the last active manager via role change', async () => {
    const m = await createEmployee({ name: 'Only', username: 'onlymgr', role: 'manager', password: 'abcdef' })
    await db.employee.updateMany({ where: { role: 'manager', id: { not: m.id } }, data: { active: false } })
    await expect(updateEmployee(m.id, { role: 'reception', active: true })).rejects.toThrow(/last manager/i)
  })

  it('manager can reset a password', async () => {
    const e = await createEmployee({ name: 'P', username: 'pchg', role: 'reception', password: 'abcdef' })
    await resetPassword(e.id, 'newpass1')
    const fresh = await db.employee.findUniqueOrThrow({ where: { id: e.id } })
    expect(await verifyPassword('newpass1', fresh.passwordHash)).toBe(true)
    expect(await verifyPassword('abcdef', fresh.passwordHash)).toBe(false)
  })
})
