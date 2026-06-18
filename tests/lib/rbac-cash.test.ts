import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('cash:manage', () => {
  it('reception and manager can manage cash', () => {
    expect(can('manager', 'cash:manage')).toBe(true)
    expect(can('reception', 'cash:manage')).toBe(true)
  })
  it('housekeeper cannot', () => {
    expect(can('housekeeper', 'cash:manage')).toBe(false)
  })
})
