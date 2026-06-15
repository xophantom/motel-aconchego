import { vi, describe, it, expect } from 'vitest'
vi.mock('server-only', () => ({}))
import { hashPassword, verifyPassword } from '@/server/password'

describe('password', () => {
  it('hash then verify succeeds', async () => {
    const hash = await hashPassword('s3cret')
    expect(hash).not.toBe('s3cret')
    expect(await verifyPassword('s3cret', hash)).toBe(true)
  })
  it('wrong password fails', async () => {
    const hash = await hashPassword('s3cret')
    expect(await verifyPassword('nope', hash)).toBe(false)
  })
  it('legacy placeholder never verifies', async () => {
    expect(await verifyPassword('anything', 'CHANGE_ME')).toBe(false)
  })
})
