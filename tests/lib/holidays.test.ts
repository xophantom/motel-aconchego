import { describe, it, expect } from 'vitest'
import { easterSunday } from '@/lib/holidays'

describe('easterSunday', () => {
  it('computes Gregorian Easter for known years', () => {
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 })
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 })
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 })
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 })
  })
})
