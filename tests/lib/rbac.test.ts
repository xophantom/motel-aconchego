import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('can', () => {
  it('manager can manage users', () => { expect(can('manager', 'users:manage')).toBe(true) })
  it('reception cannot manage users', () => { expect(can('reception', 'users:manage')).toBe(false) })
  it('housekeeper can only change room status', () => {
    expect(can('housekeeper', 'room:status')).toBe(true)
    expect(can('housekeeper', 'users:manage')).toBe(false)
    expect(can('housekeeper', 'cash:withdraw')).toBe(false)
  })
  it('reception can withdraw cash, housekeeper cannot', () => {
    expect(can('reception', 'cash:withdraw')).toBe(true)
    expect(can('housekeeper', 'cash:withdraw')).toBe(false)
  })
})
