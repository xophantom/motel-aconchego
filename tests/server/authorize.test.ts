import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
import { db } from '@/server/db'
import { authorizeCredentials } from '@/server/auth'
import { hashPassword } from '@/server/password'

beforeEach(async () => { await db.employee.deleteMany() })

describe('authorizeCredentials', () => {
  it('returns user for valid active credentials', async () => {
    await db.employee.create({ data: { name: 'Estela', username: 'estela', role: 'reception', passwordHash: await hashPassword('abcdef'), active: true } })
    const u = await authorizeCredentials('estela', 'abcdef')
    expect(u).toMatchObject({ name: 'Estela', role: 'reception' })
  })
  it('returns null for wrong password', async () => {
    await db.employee.create({ data: { name: 'E', username: 'e', role: 'reception', passwordHash: await hashPassword('abcdef'), active: true } })
    expect(await authorizeCredentials('e', 'nope')).toBeNull()
  })
  it('returns null for inactive user', async () => {
    await db.employee.create({ data: { name: 'E', username: 'gone', role: 'reception', passwordHash: await hashPassword('abcdef'), active: false } })
    expect(await authorizeCredentials('gone', 'abcdef')).toBeNull()
  })
})
