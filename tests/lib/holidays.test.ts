import { describe, it, expect } from 'vitest'
import { easterSunday, nationalHolidays, isNationalHoliday, nationalHolidayList } from '@/lib/holidays'

describe('easterSunday', () => {
  it('computes Gregorian Easter for known years', () => {
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 })
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 })
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 })
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 })
  })
})

describe('nationalHolidays', () => {
  it('includes fixed national holidays', () => {
    const h = nationalHolidays(2026)
    for (const d of ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']) {
      expect(h.has(d)).toBe(true)
    }
  })
  it('includes movable holidays derived from Easter 2026 (05/04)', () => {
    const h = nationalHolidays(2026)
    expect(h.has('04-03')).toBe(true) // Sexta-feira Santa
    expect(h.has('02-16')).toBe(true) // Carnaval segunda
    expect(h.has('02-17')).toBe(true) // Carnaval terça
    expect(h.has('06-04')).toBe(true) // Corpus Christi
  })
  it('isNationalHoliday matches by civil date', () => {
    expect(isNationalHoliday({ year: 2026, month: 9, day: 7 })).toBe(true)
    expect(isNationalHoliday({ year: 2026, month: 9, day: 8 })).toBe(false)
  })
  it('nationalHolidayList is sorted and named', () => {
    const list = nationalHolidayList(2026)
    expect(list[0]).toEqual({ date: '01-01', name: 'Confraternização Universal' })
    expect(list.some((x) => x.name === 'Corpus Christi')).toBe(true)
    expect(list.map((x) => x.date)).toEqual([...list.map((x) => x.date)].sort())
  })
})
