import { describe, it, expect } from 'vitest'
import { resolveDay, dayReasonLabel, civilDateInSaoPaulo } from '@/lib/tariff-day'

const FRI_SAT = [5, 6]

describe('resolveDay', () => {
  it('normal on a plain weekday', () => {
    // 2026-09-08 is a Tuesday, no holiday nearby
    expect(resolveDay({ year: 2026, month: 9, day: 8 }, FRI_SAT)).toEqual({ day: 'normal', reason: 'weekday' })
  })
  it('special by configured weekday (Saturday)', () => {
    // 2026-09-05 is a Saturday
    expect(resolveDay({ year: 2026, month: 9, day: 5 }, FRI_SAT)).toEqual({ day: 'special', reason: 'weekend' })
  })
  it('special on a national holiday (07/09, Monday)', () => {
    expect(resolveDay({ year: 2026, month: 9, day: 7 }, FRI_SAT)).toEqual({ day: 'special', reason: 'holiday' })
  })
  it('special on a holiday eve (06/09, Sunday, eve of 07/09)', () => {
    expect(resolveDay({ year: 2026, month: 9, day: 6 }, FRI_SAT)).toEqual({ day: 'special', reason: 'holiday_eve' })
  })
  it('holiday wins over weekend when both apply', () => {
    // 01/05/2026 (Dia do Trabalho) is a Friday → holiday, not weekend
    expect(resolveDay({ year: 2026, month: 5, day: 1 }, FRI_SAT)).toEqual({ day: 'special', reason: 'holiday' })
  })
  it('treats 31/12 as eve of 01/01 across the year boundary', () => {
    expect(resolveDay({ year: 2026, month: 12, day: 31 }, [])).toEqual({ day: 'special', reason: 'holiday_eve' })
  })
})

describe('resolveDay with custom regional holidays', () => {
  it('special on a custom regional holiday', () => {
    expect(resolveDay({ year: 2026, month: 8, day: 15 }, FRI_SAT, ['08-15'])).toEqual({ day: 'special', reason: 'holiday' })
  })
  it('special on the eve of a custom regional holiday', () => {
    expect(resolveDay({ year: 2026, month: 8, day: 14 }, FRI_SAT, ['08-15'])).toEqual({ day: 'special', reason: 'holiday_eve' })
  })
  it('ignores custom holidays that do not match the date', () => {
    expect(resolveDay({ year: 2026, month: 9, day: 8 }, FRI_SAT, ['08-15'])).toEqual({ day: 'normal', reason: 'weekday' })
  })
})

describe('dayReasonLabel', () => {
  it('maps reasons to PT-BR labels', () => {
    expect(dayReasonLabel('holiday')).toBe('feriado')
    expect(dayReasonLabel('holiday_eve')).toBe('véspera de feriado')
    expect(dayReasonLabel('weekend')).toBe('fim de semana')
    expect(dayReasonLabel('weekday')).toBe('dia de semana')
  })
})

describe('civilDateInSaoPaulo', () => {
  it('converts a UTC instant to the São Paulo civil date', () => {
    // 2026-09-07T02:00:00Z → São Paulo (UTC-3) is 2026-09-06 23:00
    expect(civilDateInSaoPaulo(new Date('2026-09-07T02:00:00Z'))).toEqual({ year: 2026, month: 9, day: 6 })
    expect(civilDateInSaoPaulo(new Date('2026-09-07T12:00:00Z'))).toEqual({ year: 2026, month: 9, day: 7 })
  })
})
