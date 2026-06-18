import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('operational permissions', () => {
  it('manager manages tariff and stays', () => {
    expect(can('manager', 'tariff:manage')).toBe(true)
    expect(can('manager', 'stay:manage')).toBe(true)
  })
  it('reception manages stays but not tariff', () => {
    expect(can('reception', 'stay:manage')).toBe(true)
    expect(can('reception', 'tariff:manage')).toBe(false)
  })
  it('housekeeper does neither', () => {
    expect(can('housekeeper', 'stay:manage')).toBe(false)
    expect(can('housekeeper', 'tariff:manage')).toBe(false)
  })
})
