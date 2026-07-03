import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'
describe('loyalty:manage', () => {
  it('only manager manages loyalty', () => {
    expect(can('manager', 'loyalty:manage')).toBe(true)
    expect(can('reception', 'loyalty:manage')).toBe(false)
    expect(can('housekeeper', 'loyalty:manage')).toBe(false)
  })
})
