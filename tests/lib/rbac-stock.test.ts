import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('stock:adjust', () => {
  it('is granted to reception and manager, not housekeeper', () => {
    expect(can('manager', 'stock:adjust')).toBe(true)
    expect(can('reception', 'stock:adjust')).toBe(true)
    expect(can('housekeeper', 'stock:adjust')).toBe(false)
  })
})
