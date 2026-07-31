// Meeus/Jones/Butcher Gregorian algorithm. Returns Easter Sunday (month 1-12, day).
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

const MS_DAY = 86_400_000

function mmdd(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const FIXED: { date: string; name: string }[] = [
  { date: '01-01', name: 'Confraternização Universal' },
  { date: '04-21', name: 'Tiradentes' },
  { date: '05-01', name: 'Dia do Trabalho' },
  { date: '09-07', name: 'Independência' },
  { date: '10-12', name: 'Nossa Senhora Aparecida' },
  { date: '11-02', name: 'Finados' },
  { date: '11-15', name: 'Proclamação da República' },
  { date: '11-20', name: 'Consciência Negra' },
  { date: '12-25', name: 'Natal' },
]

export function nationalHolidayList(year: number): { date: string; name: string }[] {
  const e = easterSunday(year)
  const base = Date.UTC(year, e.month - 1, e.day)
  const movable: { offset: number; name: string }[] = [
    { offset: -2, name: 'Sexta-feira Santa' },
    { offset: -48, name: 'Carnaval (segunda)' },
    { offset: -47, name: 'Carnaval (terça)' },
    { offset: 60, name: 'Corpus Christi' },
  ]
  const list = [
    ...FIXED,
    ...movable.map((m) => ({ date: mmdd(new Date(base + m.offset * MS_DAY)), name: m.name })),
  ]
  return list.sort((a, b) => a.date.localeCompare(b.date))
}

export function nationalHolidays(year: number): Set<string> {
  return new Set(nationalHolidayList(year).map((h) => h.date))
}

export function isNationalHoliday(d: { year: number; month: number; day: number }): boolean {
  const key = `${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
  return nationalHolidays(d.year).has(key)
}
