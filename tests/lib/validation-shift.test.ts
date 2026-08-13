import { describe, it, expect } from 'vitest'
import { cashMovementSchema, closeShiftSchema } from '@/lib/validation/shift'

describe('cashMovementSchema', () => {
  it('requires method on withdrawal', () => {
    expect(cashMovementSchema.safeParse({ type: 'withdrawal', amount: 100 }).success).toBe(false)
    expect(cashMovementSchema.safeParse({ type: 'withdrawal', amount: 100, method: 'cash' }).success).toBe(true)
  })
  it('does not require method on supply', () => {
    expect(cashMovementSchema.safeParse({ type: 'supply', amount: 50 }).success).toBe(true)
  })
})
describe('closeShiftSchema', () => {
  it('defaults final withdrawals to 0 when a password is given', () => {
    expect(closeShiftSchema.parse({ password: 'x' })).toEqual({ finalWithdrawCash: 0, finalWithdrawCard: 0, password: 'x' })
  })
  it('requires a password', () => {
    expect(closeShiftSchema.safeParse({}).success).toBe(false)
  })
})
