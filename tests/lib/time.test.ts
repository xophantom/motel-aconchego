import { describe, it, expect } from 'vitest'
import { resolveEntryTime, formatHm } from '@/lib/time'

// 2026-10-07 14:00 in São Paulo (UTC−3)
const now = new Date('2026-10-07T17:00:00Z')

describe('resolveEntryTime', () => {
  it('resolves an earlier time today (Brasília wall clock)', () => {
    expect(resolveEntryTime('13:20', now).toISOString()).toBe('2026-10-07T16:20:00.000Z')
  })
  it('a time later than now means yesterday (entry before midnight)', () => {
    const justAfterMidnight = new Date('2026-10-08T03:20:00Z') // 00:20 SP
    expect(resolveEntryTime('23:30', justAfterMidnight).toISOString()).toBe('2026-10-08T02:30:00.000Z')
  })
  it('clamps a few minutes of clock skew to now instead of yesterday', () => {
    expect(resolveEntryTime('14:03', now).getTime()).toBe(now.getTime())
  })
  it('rejects malformed input', () => {
    expect(() => resolveEntryTime('25:00', now)).toThrow(/invalid entry time/)
    expect(() => resolveEntryTime('9:5', now)).toThrow(/invalid entry time/)
  })
})

describe('formatHm', () => {
  it('formats in Brasília time regardless of the process TZ', () => {
    expect(formatHm(new Date('2026-10-07T16:20:00Z'))).toBe('13:20')
    expect(formatHm(null)).toBe('—')
  })
})
