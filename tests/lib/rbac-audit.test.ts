import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('audit:view', () => {
  it('is granted to manager only', () => {
    expect(can('manager', 'audit:view')).toBe(true)
    expect(can('reception', 'audit:view')).toBe(false)
    expect(can('housekeeper', 'audit:view')).toBe(false)
  })
})
