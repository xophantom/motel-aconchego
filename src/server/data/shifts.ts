import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { currentPeriod, businessDateFor } from '@/lib/shift'
import { logEvent } from '@/server/audit'
import { verifyPassword } from '@/server/password'
import type { CashMovementInput, CloseShiftInput } from '@/lib/validation/shift'
import { getCashPolicy } from '@/server/data/cash-policy'

async function requireCash() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'cash:manage')) throw new Error('Forbidden')
  return me
}

export function getOpenShiftFor(now: Date) {
  return db.shift.findFirst({ where: { period: currentPeriod(now), businessDate: businessDateFor(now), closedAt: null } })
}

// Resolve the current period's shift, opening it automatically (carrying the
// previous shift's closing balance) when none is open yet.
export async function getOrOpenCurrentShift() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  const now = new Date()
  const businessDate = businessDateFor(now)
  const period = currentPeriod(now)
  const existing = await db.shift.findUnique({ where: { businessDate_period: { businessDate, period } } })
  if (existing && !existing.closedAt) return existing
  if (existing && existing.closedAt) throw new Error('Caixa já fechado neste período')
  const last = await db.shift.findFirst({ where: { closedAt: { not: null } }, orderBy: { closedAt: 'desc' } })
  const { expectedOpeningBalance } = await getCashPolicy()
  const openingBalance = last ? Number(last.closingBalance ?? 0) : expectedOpeningBalance
  const expected = period === 'day_07_19' ? expectedOpeningBalance : openingBalance
  const shift = await db.shift.create({ data: { businessDate, period, employeeId: me.id, openedAt: now, openingBalance, expectedOpeningBalance: expected } })
  await logEvent({ type: 'shift.open', description: `Caixa aberto (auto) · saldo inicial R$ ${openingBalance.toFixed(2)}`, entity: 'shift', entityId: String(shift.id) })
  return shift
}

export async function closeShift(shiftId: bigint, input: CloseShiftInput): Promise<ShiftMetrics> {
  const me = await requireCash()
  const emp = await db.employee.findUniqueOrThrow({ where: { id: me.id } })
  if (!(await verifyPassword(input.password, emp.passwordHash))) throw new Error('Senha incorreta')
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId } })
  if (shift.closedAt) throw new Error('Caixa já fechado')
  const now = new Date()
  const finals: { method: 'cash' | 'card'; amount: number }[] = []
  if (input.finalWithdrawCash > 0) finals.push({ method: 'cash', amount: input.finalWithdrawCash })
  if (input.finalWithdrawCard > 0) finals.push({ method: 'card', amount: input.finalWithdrawCard })
  for (const f of finals) {
    await db.cashMovement.create({ data: { type: 'withdrawal', method: f.method, amount: -Math.abs(f.amount), employeeId: me.id, shiftId, occurredAt: now, description: 'Retirada no fechamento' } })
  }
  const fresh = await db.shift.findUniqueOrThrow({ where: { id: shiftId } })
  const metrics = await shiftMetrics(fresh)
  await db.shift.update({ where: { id: shiftId }, data: { closedAt: now, closedById: me.id, closingBalance: metrics.saldo } })
  await logEvent({ type: 'shift.close', description: `Caixa fechado · saldo R$ ${metrics.saldo.toFixed(2)}`, entity: 'shift', entityId: String(shiftId) })
  return metrics
}

export async function addCashMovement(input: CashMovementInput) {
  const me = await requireCash()
  if (input.type === 'correction' && me.role !== 'manager') throw new Error('Forbidden')
  const now = new Date()
  const open = await getOrOpenCurrentShift()
  let amount = input.amount
  if (input.type === 'withdrawal') amount = -Math.abs(amount)
  if (input.type === 'supply') amount = Math.abs(amount)
  const mov = await db.cashMovement.create({
    data: { type: input.type, method: input.type === 'withdrawal' ? (input.method ?? null) : null, amount, employeeId: me.id, shiftId: open.id, occurredAt: now, description: input.description },
  })
  const label = input.type === 'withdrawal' ? 'Sangria' : input.type === 'supply' ? 'Suprimento' : 'Correção'
  await logEvent({ type: `cash.${input.type}`, description: `${label} R$ ${Math.abs(amount).toFixed(2)}${input.description ? ` · ${input.description}` : ''}`, entity: 'cash', entityId: String(mov.id) })
  return mov
}

export type ShiftMetrics = {
  nAptos: number; totalEstadias: number; totalConsumo: number;
  totalSangrias: number; totalSuprimentos: number; totalCorrecoes: number;
  retiradoDinheiro: number; retiradoCartao: number; total: number; openingDifference: number;
  ticketMedio: number; saldo: number;
}

type ShiftLike = { id: bigint; openedAt: Date; closedAt: Date | null; openingBalance: unknown; expectedOpeningBalance?: unknown }

export async function shiftMetrics(shift: ShiftLike): Promise<ShiftMetrics> {
  // Stays are attributed to the shift they were closed in (stay.shiftId, set at
  // checkout), consistent with how cash movements are attributed. This avoids the
  // time-window overlap of unbounded open shifts.
  const stayWhere = { status: 'closed' as const, shiftId: shift.id }
  const roomAgg = await db.stay.aggregate({ where: { ...stayWhere, type: 'room' }, _count: { _all: true }, _sum: { stayAmount: true } })
  const consumoAgg = await db.stay.aggregate({ where: stayWhere, _sum: { consumptionAmount: true } })
  const nAptos = roomAgg._count._all
  const totalEstadias = Number(roomAgg._sum.stayAmount ?? 0)
  const totalConsumo = Number(consumoAgg._sum.consumptionAmount ?? 0)
  const movs = await db.cashMovement.findMany({ where: { shiftId: shift.id }, select: { type: true, amount: true, method: true } })
  const sum = (t: string) => movs.filter((m) => m.type === t).reduce((a, m) => a + Number(m.amount), 0)
  const sumMethod = (mth: string) => movs.filter((m) => m.type === 'withdrawal' && m.method === mth).reduce((a, m) => a + Math.abs(Number(m.amount)), 0)
  const round2 = (n: number) => Math.round(n * 100) / 100
  const expected = Number(shift.expectedOpeningBalance ?? shift.openingBalance)
  const saldo = Number(shift.openingBalance) + movs.reduce((a, m) => a + Number(m.amount), 0)
  return {
    nAptos,
    totalEstadias: round2(totalEstadias),
    totalConsumo: round2(totalConsumo),
    totalSangrias: round2(sum('withdrawal')),
    totalSuprimentos: round2(sum('supply')),
    totalCorrecoes: round2(sum('correction')),
    retiradoDinheiro: round2(sumMethod('cash')),
    retiradoCartao: round2(sumMethod('card')),
    total: round2(totalEstadias + totalConsumo),
    openingDifference: round2(Number(shift.openingBalance) - expected),
    ticketMedio: nAptos > 0 ? round2(totalEstadias / nAptos) : 0,
    saldo: round2(saldo),
  }
}

export async function currentShiftSummary() {
  await requireCash()
  let shift
  try { shift = await getOrOpenCurrentShift() }
  catch (e) { if (e instanceof Error && /já fechado/i.test(e.message)) return { shift: null, movements: [], metrics: null as ShiftMetrics | null, closed: true }; throw e }
  const movements = await db.cashMovement.findMany({ where: { shiftId: shift.id }, orderBy: { occurredAt: 'desc' } })
  return { shift, movements, metrics: await shiftMetrics(shift), closed: false }
}

export async function listClosedShifts(limit = 30) {
  await requireCash()
  const shifts = await db.shift.findMany({ where: { closedAt: { not: null } }, orderBy: { openedAt: 'desc' }, take: limit })
  return Promise.all(shifts.map(async (s) => ({ shift: s, metrics: await shiftMetrics(s) })))
}

export type ShiftReportLine = { room: string; checkIn: Date; checkOut: Date | null; stayAmount: number; consumptionAmount: number }
export type ShiftReport = {
  shift: { id: string; period: string; businessDate: Date; openedAt: Date; closedAt: Date | null; openingBalance: number }
  metrics: ShiftMetrics; closedByName: string | null; lines: ShiftReportLine[]
}

export async function shiftReport(shiftId: bigint): Promise<ShiftReport> {
  await requireCash()
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId }, include: { closedBy: true } })
  const stays = await db.stay.findMany({ where: { status: 'closed', shiftId }, orderBy: { checkOut: 'asc' } })
  const lines: ShiftReportLine[] = stays.map((s) => ({ room: s.roomNumber ?? '—', checkIn: s.checkIn, checkOut: s.checkOut, stayAmount: Number(s.stayAmount ?? 0), consumptionAmount: Number(s.consumptionAmount) }))
  const metrics = await shiftMetrics(shift)
  return {
    shift: { id: String(shift.id), period: shift.period, businessDate: shift.businessDate, openedAt: shift.openedAt, closedAt: shift.closedAt, openingBalance: Number(shift.openingBalance) },
    metrics, closedByName: shift.closedBy?.name ?? null, lines,
  }
}
