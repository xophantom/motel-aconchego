// The motel runs on Brasília time, but the server (Vercel) runs in UTC, so
// anything that turns a wall-clock time into an instant (or back) must pin the
// zone explicitly instead of relying on the process TZ.
export const MOTEL_TZ = 'America/Sao_Paulo'
// Brazil dropped DST in 2019, so São Paulo is a fixed UTC−3.
const SP_OFFSET_MIN = -3 * 60

const MIN = 60_000
const DAY = 24 * 60 * MIN
// A typed time slightly ahead of the clock is skew, not "yesterday".
const SKEW_MIN = 5

export const ENTRY_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// The São Paulo wall clock of `d`, to be read with the getUTC* getters.
export function spWallClock(d: Date): Date {
  return new Date(d.getTime() + SP_OFFSET_MIN * MIN)
}

// Resolve an "HH:MM" São Paulo wall-clock time to its most recent occurrence at
// or before `now` (a time later than now means it was yesterday, e.g. 23:30
// typed at 00:20). A few minutes ahead of `now` is clamped to `now`.
export function resolveEntryTime(hhmm: string, now: Date): Date {
  if (!ENTRY_TIME_RE.test(hhmm)) throw new Error('invalid entry time')
  const [h, m] = hhmm.split(':').map(Number)
  const local = spWallClock(now)
  let at = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m) - SP_OFFSET_MIN * MIN
  if (at > now.getTime() + SKEW_MIN * MIN) at -= DAY
  return new Date(Math.min(at, now.getTime()))
}

// Civil (calendar) dates — report/finance filters, @db.Date columns — travel as
// Dates at UTC midnight: process-TZ independent and exactly what @db.Date stores.
export function civilDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

// 'YYYY-MM-DD' → civil date; anything else → null.
export function parseCivilDate(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return civilDate(y, m, d)
}

// Today's Brasília calendar date.
export function todayCivil(now: Date = new Date()): Date {
  const l = spWallClock(now)
  return civilDate(l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate())
}

export function civilIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// Snap any Date standing for a calendar day (UTC or local midnight/noon) to the
// canonical UTC-midnight civil date.
export function toCivil(d: Date): Date {
  return civilDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function addCivilDays(d: Date, days: number): Date {
  return new Date(toCivil(d).getTime() + days * DAY)
}

// The instant a civil date starts in Brasília (00:00 BRT), for timestamp filters.
export function spStartOf(d: Date): Date {
  return new Date(toCivil(d).getTime() - SP_OFFSET_MIN * MIN)
}

// [from 00:00, to+1 00:00) in Brasília, as instants.
export function spDayRange(from: Date, to: Date): { start: Date; end: Date } {
  return { start: spStartOf(from), end: spStartOf(addCivilDays(to, 1)) }
}

export function formatCivil(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

export function formatHm(d: Date | null | undefined): string {
  return d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: MOTEL_TZ }) : '—'
}

// "07/10 14:05"
export function formatDayHm(d: Date | null | undefined): string {
  return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: MOTEL_TZ }).replace(',', '') : '—'
}
