import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('product:manage', () => {
  it('only manager manages products', () => {
    expect(can('manager', 'product:manage')).toBe(true)
    expect(can('reception', 'product:manage')).toBe(false)
    expect(can('housekeeper', 'product:manage')).toBe(false)
  })
})
