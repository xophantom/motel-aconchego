import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('stay:cancel', () => {
  it('is granted to reception and manager, not housekeeper', () => {
    expect(can('manager', 'stay:cancel')).toBe(true)
    expect(can('reception', 'stay:cancel')).toBe(true)
    expect(can('housekeeper', 'stay:cancel')).toBe(false)
  })
})
