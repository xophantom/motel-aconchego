import { describe, it, expect } from 'vitest'
import { normalizePlate } from '@/lib/plate'

describe('normalizePlate', () => {
  it('uppercases and keeps only letters and digits', () => {
    expect(normalizePlate(' abc-1d23 ')).toBe('ABC1D23')
    expect(normalizePlate('ABC 1D23')).toBe('ABC1D23')
    expect(normalizePlate('-')).toBe('')
  })
  it('converts the old AAA9999 format to Mercosul (same car)', () => {
    expect(normalizePlate('ABC-1234')).toBe('ABC1C34')
    expect(normalizePlate('xyz0987')).toBe('XYZ0J87')
  })
})
