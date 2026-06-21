import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'

export type ReportRow = {
  roomNumber: string
  categoryCode: string | null
  rentals: number
  totalStay: number
  totalConsumption: number
  avgTicket: number
}
export type MonthlyReport = {
  year: number
  month: number
  rows: ReportRow[]
  totals: { rentals: number; totalStay: number; totalConsumption: number; avgTicket: number }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function monthlyOccupancy(year: number, month: number): Promise<MonthlyReport> {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'report:view')) throw new Error('Forbidden')
  month = Math.min(12, Math.max(1, Math.trunc(month)))
  year = Math.min(2100, Math.max(2000, Math.trunc(year)))
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)
  const stays = await db.stay.findMany({
    where: { type: 'room', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { roomNumber: true, stayAmount: true, consumptionAmount: true, category: { select: { code: true } } },
  })
  const byRoom = new Map<string, ReportRow>()
  for (const s of stays) {
    const key = s.roomNumber ?? '?'
    const row = byRoom.get(key) ?? { roomNumber: key, categoryCode: s.category?.code ?? null, rentals: 0, totalStay: 0, totalConsumption: 0, avgTicket: 0 }
    row.rentals += 1
    row.totalStay += Number(s.stayAmount ?? 0)
    row.totalConsumption += Number(s.consumptionAmount ?? 0)
    byRoom.set(key, row)
  }
  const rows = [...byRoom.values()]
    .map((r) => ({ ...r, totalStay: round2(r.totalStay), totalConsumption: round2(r.totalConsumption), avgTicket: r.rentals > 0 ? round2(r.totalStay / r.rentals) : 0 }))
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }))
  const tRentals = rows.reduce((a, r) => a + r.rentals, 0)
  const tStay = round2(rows.reduce((a, r) => a + r.totalStay, 0))
  const tCons = round2(rows.reduce((a, r) => a + r.totalConsumption, 0))
  return { year, month, rows, totals: { rentals: tRentals, totalStay: tStay, totalConsumption: tCons, avgTicket: tRentals > 0 ? round2(tStay / tRentals) : 0 } }
}
