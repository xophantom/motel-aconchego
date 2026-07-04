import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('finance:manage', () => {
  it('is granted to manager only', () => {
    expect(can('manager', 'finance:manage')).toBe(true)
    expect(can('reception', 'finance:manage')).toBe(false)
    expect(can('housekeeper', 'finance:manage')).toBe(false)
  })
})
