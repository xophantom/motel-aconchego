import { describe, it, expect } from 'vitest'
import { currentPeriod, businessDateFor, shiftLabelFor } from '@/lib/shift'

// Brasília wall-clock instants (UTC−3), independent of the process TZ — the
// server runs in UTC on Vercel.
const at = (y: number, mo: number, d: number, h: number) => new Date(Date.UTC(y, mo, d, h + 3, 0, 0))
const civil = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo, d))

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
  it('uses Brasília hours, not UTC (17:00 BRT = 20:00 UTC is still day)', () => {
    expect(currentPeriod(new Date('2026-10-07T20:00:00Z'))).toBe('day_07_19')
    expect(currentPeriod(new Date('2026-10-07T09:30:00Z'))).toBe('night_19_07') // 06:30 BRT
  })
})

describe('businessDateFor', () => {
  it('day-time belongs to the same date', () => {
    expect(businessDateFor(at(2026, 0, 2, 10))).toEqual(civil(2026, 0, 2))
  })
  it('evening (night, >=19h) belongs to the same date', () => {
    expect(businessDateFor(at(2026, 0, 2, 20))).toEqual(civil(2026, 0, 2))
  })
  it('late evening past UTC midnight still belongs to the same date', () => {
    expect(businessDateFor(at(2026, 0, 2, 22))).toEqual(civil(2026, 0, 2)) // 01:00 UTC on the 3rd
  })
  it('after-midnight (night, <7h) belongs to the previous date', () => {
    expect(businessDateFor(at(2026, 0, 2, 2))).toEqual(civil(2026, 0, 1))
  })
})

describe('shiftLabelFor', () => {
  it('labels by the window being opened for, 1h ahead', () => {
    expect(shiftLabelFor(at(2026, 0, 2, 7))).toEqual({ period: 'day_07_19', businessDate: civil(2026, 0, 2) })
    // night closed a bit early (06:30): the next shift is already the day one
    expect(shiftLabelFor(new Date('2026-01-02T09:30:00Z'))).toEqual({ period: 'day_07_19', businessDate: civil(2026, 0, 2) })
    // day closed at 18:20: the next one is the night of the same date
    expect(shiftLabelFor(new Date('2026-01-02T21:20:00Z'))).toEqual({ period: 'night_19_07', businessDate: civil(2026, 0, 2) })
    // 16:00 is still the day window
    expect(shiftLabelFor(at(2026, 0, 2, 16)).period).toBe('day_07_19')
  })
})
