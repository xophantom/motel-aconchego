export type ShiftPeriod = 'day_07_19' | 'night_19_07'

export function currentPeriod(d: Date): ShiftPeriod {
  const h = d.getHours()
  return h >= 7 && h < 19 ? 'day_07_19' : 'night_19_07'
}

export function businessDateFor(d: Date): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (d.getHours() < 7) base.setDate(base.getDate() - 1) // night before dawn -> previous day's open
  return base
}
