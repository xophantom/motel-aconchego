import { spWallClock } from './time'

export type ShiftPeriod = 'day_07_19' | 'night_19_07'

// Shift windows are Brasília wall-clock hours (the server runs in UTC).
export function currentPeriod(d: Date): ShiftPeriod {
  const h = spWallClock(d).getUTCHours()
  return h >= 7 && h < 19 ? 'day_07_19' : 'night_19_07'
}

// Civil date the shift belongs to, as UTC midnight (what a @db.Date stores).
export function businessDateFor(d: Date): Date {
  const local = spWallClock(d)
  const base = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
  if (local.getUTCHours() < 7) base.setUTCDate(base.getUTCDate() - 1) // night before dawn -> previous day's open
  return base
}

// Label (window) of a shift opened at `openedAt`. Looks 1h ahead so a shift
// opened right after an early close (e.g. 18:30) is labeled the next window.
const LABEL_LOOKAHEAD_MS = 60 * 60_000
export function shiftLabelFor(openedAt: Date): { period: ShiftPeriod; businessDate: Date } {
  const t = new Date(openedAt.getTime() + LABEL_LOOKAHEAD_MS)
  return { period: currentPeriod(t), businessDate: businessDateFor(t) }
}
