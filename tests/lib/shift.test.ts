import { describe, it, expect } from 'vitest'
import { currentPeriod, businessDateFor } from '@/lib/shift'

const at = (y: number, mo: number, d: number, h: number) => new Date(y, mo, d, h, 0, 0)

describe('currentPeriod', () => {
  it('day shift is 07:00–18:59', () => {
    expect(currentPeriod(at(2026, 0, 2, 7))).toBe('day_07_19')
    expect(currentPeriod(at(2026, 0, 2, 18))).toBe('day_07_19')
  })
  it('night shift is 19:00–06:59', () => {
    expect(currentPeriod(at(2026, 0, 2, 19))).toBe('night_19_07')
    expect(currentPeriod(at(2026, 0, 2, 23))).toBe('night_19_07')
    expect(currentPeriod(at(2026, 0, 2, 2))).toBe('night_19_07')
    expect(currentPeriod(at(2026, 0, 2, 6))).toBe('night_19_07')
  })
})

describe('businessDateFor', () => {
  it('day-time belongs to the same date', () => {
    expect(businessDateFor(at(2026, 0, 2, 10))).toEqual(new Date(2026, 0, 2))
  })
  it('evening (night, >=19h) belongs to the same date', () => {
    expect(businessDateFor(at(2026, 0, 2, 20))).toEqual(new Date(2026, 0, 2))
  })
  it('after-midnight (night, <7h) belongs to the previous date', () => {
    expect(businessDateFor(at(2026, 0, 2, 2))).toEqual(new Date(2026, 0, 1))
  })
})
