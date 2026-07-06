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

function dayRange(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1)
  return { start, end }
}
async function requireReports() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'report:view')) throw new Error('Forbidden')
  return me
}

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

export type MovementRow = {
  stayId: string; roomNumber: string | null; checkIn: Date; checkOut: Date | null
  isEntry: boolean; isExit: boolean; durationMin: number | null
  stayAmount: number | null; consumption: number; total: number; operator: string | null
}
export type MovementReport = { rows: MovementRow[]; totals: { entries: number; exits: number; totalStay: number; totalConsumption: number; total: number } }

export async function movementReport(from: Date, to: Date): Promise<MovementReport> {
  await requireReports()
  const { start, end } = dayRange(from, to)
  const stays = await db.stay.findMany({
    where: {
      type: 'room',
      status: { not: 'canceled' },
      OR: [{ checkIn: { gte: start, lt: end } }, { checkOut: { gte: start, lt: end } }],
    },
    orderBy: { checkIn: 'asc' },
    select: {
      id: true, roomNumber: true, checkIn: true, checkOut: true, stayAmount: true, consumptionAmount: true,
      paymentEmployee: { select: { name: true } }, entryEmployee: { select: { name: true } },
    },
  })
  const rows: MovementRow[] = stays.map((s) => {
    const isEntry = s.checkIn >= start && s.checkIn < end
    const isExit = !!s.checkOut && s.checkOut >= start && s.checkOut < end
    const stayAmount = s.stayAmount != null ? Number(s.stayAmount) : null
    const consumption = Number(s.consumptionAmount ?? 0)
    const total = round2((stayAmount ?? 0) + consumption)
    const durationMin = s.checkOut ? Math.max(0, Math.round((s.checkOut.getTime() - s.checkIn.getTime()) / 60000)) : null
    return {
      stayId: String(s.id), roomNumber: s.roomNumber, checkIn: s.checkIn, checkOut: s.checkOut,
      isEntry, isExit, durationMin, stayAmount, consumption, total,
      operator: s.paymentEmployee?.name ?? s.entryEmployee?.name ?? null,
    }
  })
  const totals = {
    entries: rows.filter((r) => r.isEntry).length,
    exits: rows.filter((r) => r.isExit).length,
    totalStay: round2(rows.reduce((a, r) => a + (r.stayAmount ?? 0), 0)),
    totalConsumption: round2(rows.reduce((a, r) => a + r.consumption, 0)),
    total: round2(rows.reduce((a, r) => a + r.total, 0)),
  }
  return { rows, totals }
}

export type StaysOrdersReport = { nStays: number; totalStay: number; avgTicket: number; nWalkins: number; totalConsumption: number }

export async function staysOrdersReport(from: Date, to: Date): Promise<StaysOrdersReport> {
  await requireReports()
  const { start, end } = dayRange(from, to)
  const rooms = await db.stay.findMany({
    where: { type: 'room', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { stayAmount: true, consumptionAmount: true },
  })
  const walkins = await db.stay.findMany({
    where: { type: 'walkin', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { consumptionAmount: true },
  })
  const nStays = rooms.length
  const totalStay = round2(rooms.reduce((a, s) => a + Number(s.stayAmount ?? 0), 0))
  const totalConsumption = round2(
    rooms.reduce((a, s) => a + Number(s.consumptionAmount ?? 0), 0) +
    walkins.reduce((a, s) => a + Number(s.consumptionAmount ?? 0), 0),
  )
  return {
    nStays, totalStay,
    avgTicket: nStays > 0 ? round2(totalStay / nStays) : 0,
    nWalkins: walkins.length, totalConsumption,
  }
}

export type BarRow = { productCode: string; description: string | null; category: string | null; qty: number; revenue: number }
export type BarReport = { rows: BarRow[]; totals: { qty: number; revenue: number } }

export async function barReport(from: Date, to: Date): Promise<BarReport> {
  await requireReports()
  const { start, end } = dayRange(from, to)
  const items = await db.consumption.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: { productCode: true, qty: true, unitPrice: true, product: { select: { description: true, category: true } } },
  })
  const byProduct = new Map<string, BarRow>()
  for (const it of items) {
    const key = it.productCode ?? '?'
    const row = byProduct.get(key) ?? { productCode: key, description: it.product?.description ?? null, category: it.product?.category ?? null, qty: 0, revenue: 0 }
    row.qty += it.qty
    row.revenue += it.qty * Number(it.unitPrice)
    byProduct.set(key, row)
  }
  const rows = [...byProduct.values()]
    .map((r) => ({ ...r, revenue: round2(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || a.productCode.localeCompare(b.productCode))
  return {
    rows,
    totals: { qty: rows.reduce((a, r) => a + r.qty, 0), revenue: round2(rows.reduce((a, r) => a + r.revenue, 0)) },
  }
}
