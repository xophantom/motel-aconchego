import { describe, it, expect } from 'vitest'
import { normalizePlate, plateVariants } from '@/lib/plate'

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

describe('plateVariants', () => {
  it('lists the spellings stored before canonicalization', () => {
    expect(plateVariants('ABC1C34').sort()).toEqual(['ABC-1234', 'ABC-1C34', 'ABC1234', 'ABC1C34'])
    expect(plateVariants('ABC1Z34').sort()).toEqual(['ABC-1Z34', 'ABC1Z34']) // Z: not a converted plate
  })
})
