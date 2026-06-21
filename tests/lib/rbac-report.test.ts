import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('report:view', () => {
  it('only manager views reports', () => {
    expect(can('manager', 'report:view')).toBe(true)
    expect(can('reception', 'report:view')).toBe(false)
    expect(can('housekeeper', 'report:view')).toBe(false)
  })
})
