import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import type { ReportColumn } from '@/lib/report-format'

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

export type OperatorRow = { employeeId: number | null; operator: string | null; aptos: number; received: number; avgTicket: number }
export type OperatorReport = { rows: OperatorRow[]; totals: { aptos: number; received: number } }

export async function operatorReport(from: Date, to: Date): Promise<OperatorReport> {
  await requireReports()
  const { start, end } = dayRange(from, to)
  const stays = await db.stay.findMany({
    where: { type: 'room', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { stayAmount: true, consumptionAmount: true, paymentEmployeeId: true, paymentEmployee: { select: { name: true } } },
  })
  const byOp = new Map<string, OperatorRow>()
  for (const s of stays) {
    const key = s.paymentEmployeeId != null ? String(s.paymentEmployeeId) : 'null'
    const row = byOp.get(key) ?? { employeeId: s.paymentEmployeeId ?? null, operator: s.paymentEmployee?.name ?? null, aptos: 0, received: 0, avgTicket: 0 }
    row.aptos += 1
    row.received += Number(s.stayAmount ?? 0) + Number(s.consumptionAmount ?? 0)
    byOp.set(key, row)
  }
  const rows = [...byOp.values()]
    .map((r) => ({ ...r, received: round2(r.received), avgTicket: r.aptos > 0 ? round2(r.received / r.aptos) : 0 }))
    .sort((a, b) => b.received - a.received)
  return {
    rows,
    totals: { aptos: rows.reduce((a, r) => a + r.aptos, 0), received: round2(rows.reduce((a, r) => a + r.received, 0)) },
  }
}

export type ReportPeriod = { kind: 'month'; year: number; month: number } | { kind: 'range'; from: Date; to: Date }
export type ReportView = { type: string; title: string; columns: ReportColumn[]; rows: Record<string, unknown>[]; total: Record<string, unknown> | null; period: ReportPeriod }

export const REPORT_TYPES = ['occupancy', 'movement', 'stays_orders', 'bar', 'operator']

function civilDate(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function reportView(sp: Record<string, string | undefined>): Promise<ReportView> {
  const type = REPORT_TYPES.includes(sp.type ?? '') ? (sp.type as string) : 'occupancy'
  const now = new Date()

  if (type === 'occupancy') {
    const year = Number(sp.year) || now.getFullYear()
    const month = Number(sp.month) || now.getMonth() + 1
    const rep = await monthlyOccupancy(year, month)
    return {
      type, title: `Ocupação ${String(rep.month).padStart(2, '0')}/${rep.year}`,
      columns: [
        { key: 'roomNumber', label: 'Apto', kind: 'text' },
        { key: 'categoryCode', label: 'Categoria', kind: 'text' },
        { key: 'rentals', label: 'Locações', kind: 'int', align: 'right' },
        { key: 'totalStay', label: 'Total estadia', kind: 'money', align: 'right' },
        { key: 'avgTicket', label: 'Ticket médio', kind: 'money', align: 'right' },
        { key: 'totalConsumption', label: 'Total consumo', kind: 'money', align: 'right' },
      ],
      rows: rep.rows as unknown as Record<string, unknown>[],
      total: { roomNumber: 'TOTAL', rentals: rep.totals.rentals, totalStay: rep.totals.totalStay, avgTicket: rep.totals.avgTicket, totalConsumption: rep.totals.totalConsumption },
      period: { kind: 'month', year: rep.year, month: rep.month },
    }
  }

  const from = civilDate(sp.from, new Date(now.getFullYear(), now.getMonth(), 1))
  const to = civilDate(sp.to, now)
  const period: ReportPeriod = { kind: 'range', from, to }

  if (type === 'movement') {
    const rep = await movementReport(from, to)
    return {
      type, title: 'Movimento do período', period,
      columns: [
        { key: 'roomNumber', label: 'Quarto', kind: 'text' },
        { key: 'checkIn', label: 'Entrada', kind: 'datetime' },
        { key: 'checkOut', label: 'Saída', kind: 'datetime' },
        { key: 'durationMin', label: 'Duração', kind: 'duration', align: 'right' },
        { key: 'stayAmount', label: 'Estadia', kind: 'money', align: 'right' },
        { key: 'consumption', label: 'Consumo', kind: 'money', align: 'right' },
        { key: 'total', label: 'Total', kind: 'money', align: 'right' },
        { key: 'operator', label: 'Operador', kind: 'text' },
      ],
      rows: rep.rows as unknown as Record<string, unknown>[],
      total: { roomNumber: 'TOTAL', stayAmount: rep.totals.totalStay, consumption: rep.totals.totalConsumption, total: rep.totals.total },
    }
  }

  if (type === 'stays_orders') {
    const rep = await staysOrdersReport(from, to)
    return {
      type, title: 'Estadias & pedidos', period,
      columns: [
        { key: 'nStays', label: 'Estadias', kind: 'int', align: 'right' },
        { key: 'totalStay', label: 'Total estadia', kind: 'money', align: 'right' },
        { key: 'avgTicket', label: 'Ticket médio', kind: 'money', align: 'right' },
        { key: 'nWalkins', label: 'Vendas avulsas', kind: 'int', align: 'right' },
        { key: 'totalConsumption', label: 'Total consumo', kind: 'money', align: 'right' },
      ],
      rows: [rep as unknown as Record<string, unknown>],
      total: null,
    }
  }

  if (type === 'bar') {
    const rep = await barReport(from, to)
    return {
      type, title: 'Produtos do bar', period,
      columns: [
        { key: 'productCode', label: 'Código', kind: 'text' },
        { key: 'description', label: 'Produto', kind: 'text' },
        { key: 'category', label: 'Categoria', kind: 'text' },
        { key: 'qty', label: 'Qtd', kind: 'int', align: 'right' },
        { key: 'revenue', label: 'Receita', kind: 'money', align: 'right' },
      ],
      rows: rep.rows as unknown as Record<string, unknown>[],
      total: { productCode: 'TOTAL', qty: rep.totals.qty, revenue: rep.totals.revenue },
    }
  }

  const rep = await operatorReport(from, to)
  return {
    type, title: 'Por operador', period,
    columns: [
      { key: 'operator', label: 'Operador', kind: 'text' },
      { key: 'aptos', label: 'Aptos', kind: 'int', align: 'right' },
      { key: 'received', label: 'Total recebido', kind: 'money', align: 'right' },
      { key: 'avgTicket', label: 'Ticket médio', kind: 'money', align: 'right' },
    ],
    rows: rep.rows as unknown as Record<string, unknown>[],
    total: { operator: 'TOTAL', aptos: rep.totals.aptos, received: rep.totals.received },
  }
}
