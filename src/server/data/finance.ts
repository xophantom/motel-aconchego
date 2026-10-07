import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'
import { Prisma, type LedgerKind } from '@/generated/prisma/client'
import { addCivilDays, civilDate, civilIso, spDayRange, toCivil } from '@/lib/time'

const round2 = (n: number) => Math.round(n * 100) / 100

async function requireFinance() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'finance:manage')) throw new Error('Forbidden')
  return me
}

export async function listCostCenters() {
  await requireFinance()
  const centers = await db.costCenter.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, description: true, _count: { select: { entries: true } } },
  })
  return centers.map((c) => ({ code: c.code, description: c.description, entryCount: c._count.entries }))
}

export async function upsertCostCenter(input: { code: string; description: string }) {
  await requireFinance()
  const center = await db.costCenter.upsert({
    where: { code: input.code },
    create: { code: input.code, description: input.description },
    update: { description: input.description },
  })
  await logEvent({ type: 'finance.costcenter.upsert', description: `Centro de custo ${center.code} salvo`, entity: 'costCenter', entityId: center.code })
  return center
}

export async function deleteCostCenter(code: string) {
  await requireFinance()
  const count = await db.ledgerEntry.count({ where: { costCenter: code } })
  if (count > 0) throw new Error('Centro em uso: possui lançamentos vinculados')
  await db.costCenter.delete({ where: { code } })
  await logEvent({ type: 'finance.costcenter.delete', description: `Centro de custo ${code} removido`, entity: 'costCenter', entityId: code })
}

export type EntryFilter = { from: Date; to: Date; costCenter?: string; kind?: LedgerKind }
export type EntryDTO = { entryDate: Date; kind: LedgerKind; amount: number; description: string; costCenter?: string | null }
export type EntryRow = {
  id: bigint; entryDate: Date; kind: LedgerKind; amount: number
  description: string; costCenter: string | null; centerDescription: string | null; operatorName: string | null
}

export async function listEntries(filter: EntryFilter): Promise<EntryRow[]> {
  await requireFinance()
  const where: Prisma.LedgerEntryWhereInput = { entryDate: { gte: filter.from, lte: filter.to } }
  if (filter.costCenter) where.costCenter = filter.costCenter
  if (filter.kind) where.kind = filter.kind
  const rows = await db.ledgerEntry.findMany({
    where,
    orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
    select: {
      id: true, entryDate: true, kind: true, amount: true, description: true, costCenter: true,
      center: { select: { description: true } }, employee: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id, entryDate: r.entryDate, kind: r.kind, amount: Number(r.amount), description: r.description,
    costCenter: r.costCenter, centerDescription: r.center?.description ?? null, operatorName: r.employee?.name ?? null,
  }))
}

export async function createEntry(input: EntryDTO) {
  const me = await requireFinance()
  const entry = await db.ledgerEntry.create({
    data: {
      entryDate: input.entryDate, kind: input.kind, amount: input.amount,
      description: input.description, costCenter: input.costCenter ?? null, employeeId: me.id,
    },
  })
  await logEvent({ type: 'finance.entry.create', description: `${input.kind === 'income' ? 'Receita' : 'Despesa'} R$ ${input.amount.toFixed(2)} · ${input.description}`, entity: 'ledgerEntry', entityId: String(entry.id) })
  return { id: entry.id }
}

export async function updateEntry(id: bigint, input: EntryDTO) {
  await requireFinance()
  await db.ledgerEntry.update({
    where: { id },
    data: {
      entryDate: input.entryDate, kind: input.kind, amount: input.amount,
      description: input.description, costCenter: input.costCenter ?? null,
    },
  })
  await logEvent({ type: 'finance.entry.update', description: `Lançamento #${id} atualizado`, entity: 'ledgerEntry', entityId: String(id) })
  return { id }
}

export async function deleteEntry(id: bigint) {
  await requireFinance()
  await db.ledgerEntry.delete({ where: { id } })
  await logEvent({ type: 'finance.entry.delete', description: `Lançamento #${id} removido`, entity: 'ledgerEntry', entityId: String(id) })
}

export type DailyStatement = {
  date: string
  stays: number
  consumption: number
  cashIn: number
  cashOut: number
  expenses: number
  income: number
  net: number
}


export async function dailyStatement(date: Date): Promise<DailyStatement> {
  await requireFinance()
  date = toCivil(date)
  // timestamps use the Brasília day; the @db.Date ledger column the civil date itself
  const { start, end } = spDayRange(date, date)
  const nextDay = addCivilDays(date, 1)

  const roomStays = await db.stay.findMany({
    where: { type: 'room', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { stayAmount: true, consumptionAmount: true },
  })
  const walkins = await db.stay.findMany({
    where: { type: 'walkin', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { consumptionAmount: true },
  })
  const stays = roomStays.reduce((a, s) => a + Number(s.stayAmount ?? 0), 0)
  const consumption =
    roomStays.reduce((a, s) => a + Number(s.consumptionAmount ?? 0), 0) +
    walkins.reduce((a, s) => a + Number(s.consumptionAmount ?? 0), 0)

  const movs = await db.cashMovement.findMany({
    where: { occurredAt: { gte: start, lt: end } },
    select: { amount: true },
  })
  let cashIn = 0
  let cashOut = 0
  for (const m of movs) {
    const v = Number(m.amount)
    if (v >= 0) cashIn += v
    else cashOut += -v
  }

  const entries = await db.ledgerEntry.findMany({
    where: { entryDate: { gte: date, lt: nextDay } },
    select: { kind: true, amount: true },
  })
  let expenses = 0
  let income = 0
  for (const e of entries) {
    if (e.kind === 'income') income += Number(e.amount)
    else expenses += Number(e.amount)
  }

  const net = cashIn - cashOut + income - expenses
  return {
    date: civilIso(date),
    stays: round2(stays), consumption: round2(consumption),
    cashIn: round2(cashIn), cashOut: round2(cashOut),
    expenses: round2(expenses), income: round2(income), net: round2(net),
  }
}

export type StatementRange = { days: DailyStatement[]; totals: DailyStatement }

export async function statementRange(from: Date, to: Date): Promise<StatementRange> {
  await requireFinance()
  const days: DailyStatement[] = []
  // guard against an inverted or absurd range (cap at 366 iterations)
  const last = toCivil(to)
  for (let day = toCivil(from), i = 0; day <= last && i < 366; day = addCivilDays(day, 1), i++) {
    days.push(await dailyStatement(day))
  }
  const totals = days.reduce<DailyStatement>((t, d) => ({
    date: '',
    stays: t.stays + d.stays, consumption: t.consumption + d.consumption,
    cashIn: t.cashIn + d.cashIn, cashOut: t.cashOut + d.cashOut,
    expenses: t.expenses + d.expenses, income: t.income + d.income, net: t.net + d.net,
  }), { date: '', stays: 0, consumption: 0, cashIn: 0, cashOut: 0, expenses: 0, income: 0, net: 0 })
  totals.stays = round2(totals.stays); totals.consumption = round2(totals.consumption)
  totals.cashIn = round2(totals.cashIn); totals.cashOut = round2(totals.cashOut)
  totals.expenses = round2(totals.expenses); totals.income = round2(totals.income); totals.net = round2(totals.net)
  return { days, totals }
}

export type CostCenterMonthRow = { code: string | null; description: string | null; income: number; expense: number; net: number }
export type CostCenterMonthly = { year: number; month: number; rows: CostCenterMonthRow[]; totals: { income: number; expense: number; net: number } }

export async function costCenterMonthly(year: number, month: number): Promise<CostCenterMonthly> {
  await requireFinance()
  month = Math.min(12, Math.max(1, Math.trunc(month)))
  year = Math.min(2100, Math.max(2000, Math.trunc(year)))
  const start = civilDate(year, month, 1)
  const end = civilDate(year, month + 1, 1)
  const entries = await db.ledgerEntry.findMany({
    where: { entryDate: { gte: start, lt: end } },
    select: { kind: true, amount: true, costCenter: true, center: { select: { description: true } } },
  })
  const map = new Map<string, CostCenterMonthRow>()
  for (const e of entries) {
    const key = e.costCenter ?? ' ' // sentinel for the no-center bucket
    const row = map.get(key) ?? { code: e.costCenter ?? null, description: e.center?.description ?? null, income: 0, expense: 0, net: 0 }
    if (e.kind === 'income') row.income += Number(e.amount)
    else row.expense += Number(e.amount)
    map.set(key, row)
  }
  const rows = [...map.values()]
    .map((r) => ({ ...r, income: round2(r.income), expense: round2(r.expense), net: round2(r.income - r.expense) }))
    .sort((a, b) => {
      if (a.code === null) return 1
      if (b.code === null) return -1
      return a.code.localeCompare(b.code)
    })
  const totals = {
    income: round2(rows.reduce((a, r) => a + r.income, 0)),
    expense: round2(rows.reduce((a, r) => a + r.expense, 0)),
    net: round2(rows.reduce((a, r) => a + r.net, 0)),
  }
  return { year, month, rows, totals }
}
