import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { createUserAction } from '@/app/(admin)/users/actions'

beforeEach(async () => {
  await db.employee.deleteMany()
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

function form(obj: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.set(k, v)
  return f
}

describe('createUserAction', () => {
  it('creates on valid input', async () => {
    const res = await createUserAction({ ok: false }, form({ name: 'Estela', username: 'estela', role: 'reception', password: 'abcdef' }))
    expect(res.ok).toBe(true)
    expect(await db.employee.count()).toBe(1)
  })
  it('returns field error on short password', async () => {
    const res = await createUserAction({ ok: false }, form({ name: 'X', username: 'x', role: 'reception', password: '123' }))
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/senha/i)
  })
  it('rejects duplicate username', async () => {
    await db.employee.create({ data: { name: 'A', username: 'estela', role: 'reception', passwordHash: 'x' } })
    const res = await createUserAction({ ok: false }, form({ name: 'B', username: 'estela', role: 'reception', password: 'abcdef' }))
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/já existe|exists/i)
  })
})
