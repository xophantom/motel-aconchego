import { isNationalHoliday } from './holidays'

export type DayType = 'normal' | 'special'
export type DayReason = 'holiday' | 'holiday_eve' | 'weekend' | 'weekday'
export type CivilDate = { year: number; month: number; day: number }

const MS_DAY = 86_400_000

function weekday(d: CivilDate): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()
}

function nextDay(d: CivilDate): CivilDate {
  const n = new Date(Date.UTC(d.year, d.month - 1, d.day) + MS_DAY)
  return { year: n.getUTCFullYear(), month: n.getUTCMonth() + 1, day: n.getUTCDate() }
}

function mmddOf(d: CivilDate): string {
  return `${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

// Precedence: holiday > holiday_eve > weekend > weekday. `customHolidays` are
// recurring regional holidays as "MM-DD" strings, treated like national ones.
export function resolveDay(d: CivilDate, specialWeekdays: number[], customHolidays: string[] = []): { day: DayType; reason: DayReason } {
  const custom = new Set(customHolidays)
  const isHoliday = (x: CivilDate) => isNationalHoliday(x) || custom.has(mmddOf(x))
  if (isHoliday(d)) return { day: 'special', reason: 'holiday' }
  if (isHoliday(nextDay(d))) return { day: 'special', reason: 'holiday_eve' }
  if (specialWeekdays.includes(weekday(d))) return { day: 'special', reason: 'weekend' }
  return { day: 'normal', reason: 'weekday' }
}

export function dayReasonLabel(reason: DayReason): string {
  switch (reason) {
    case 'holiday': return 'feriado'
    case 'holiday_eve': return 'véspera de feriado'
    case 'weekend': return 'fim de semana'
    case 'weekday': return 'dia de semana'
  }
}

export function civilDateInSaoPaulo(date: Date): CivilDate {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
  const [year, month, day] = s.split('-').map(Number)
  return { year, month, day }
}
