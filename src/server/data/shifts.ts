import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { currentPeriod, businessDateFor } from '@/lib/shift'
import { logEvent } from '@/server/audit'
import type { CashMovementInput } from '@/lib/validation/shift'

async function requireCash() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'cash:manage')) throw new Error('Forbidden')
  return me
}

export function getOpenShiftFor(now: Date) {
  return db.shift.findFirst({ where: { period: currentPeriod(now), businessDate: businessDateFor(now), closedAt: null } })
}

export async function openShift(input: { openingBalance: number }) {
  const me = await requireCash()
  const now = new Date()
  const businessDate = businessDateFor(now)
  const period = currentPeriod(now)
  const existing = await db.shift.findUnique({ where: { businessDate_period: { businessDate, period } } })
  if (existing) throw new Error(existing.closedAt ? 'Caixa já fechado neste período' : 'Caixa já aberto')
  const shift = await db.shift.create({ data: { businessDate, period, employeeId: me.id, openedAt: now, openingBalance: input.openingBalance } })
  await logEvent({ type: 'shift.open', description: `Caixa aberto · saldo inicial R$ ${input.openingBalance.toFixed(2)}`, entity: 'shift', entityId: String(shift.id) })
  return shift
}

export async function closeShift(shiftId: bigint, input: { closingBalance: number }) {
  await requireCash()
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId } })
  if (shift.closedAt) throw new Error('Caixa já fechado')
  const now = new Date()
  const metrics = await shiftMetrics({ ...shift, closedAt: now })
  await db.shift.update({ where: { id: shiftId }, data: { closedAt: now, closingBalance: input.closingBalance } })
  await logEvent({ type: 'shift.close', description: `Caixa fechado · saldo R$ ${metrics.saldo.toFixed(2)}`, entity: 'shift', entityId: String(shiftId) })
  return metrics
}

export async function addCashMovement(input: CashMovementInput) {
  const me = await requireCash()
  if (input.type === 'correction' && me.role !== 'manager') throw new Error('Forbidden')
  const now = new Date()
  const open = await getOpenShiftFor(now)
  let amount = input.amount
  if (input.type === 'withdrawal') amount = -Math.abs(amount)
  if (input.type === 'supply') amount = Math.abs(amount)
  const mov = await db.cashMovement.create({
    data: { type: input.type, amount, employeeId: me.id, shiftId: open?.id ?? null, occurredAt: now, description: input.description },
  })
  const label = input.type === 'withdrawal' ? 'Sangria' : input.type === 'supply' ? 'Suprimento' : 'Correção'
  await logEvent({ type: `cash.${input.type}`, description: `${label} R$ ${Math.abs(amount).toFixed(2)}${input.description ? ` · ${input.description}` : ''}`, entity: 'cash', entityId: String(mov.id) })
  return mov
}

export type ShiftMetrics = {
  nAptos: number; totalEstadias: number; totalConsumo: number;
  totalSangrias: number; totalSuprimentos: number; totalCorrecoes: number;
  ticketMedio: number; saldo: number;
}

type ShiftLike = { id: bigint; openedAt: Date; closedAt: Date | null; openingBalance: unknown }

export async function shiftMetrics(shift: ShiftLike): Promise<ShiftMetrics> {
  const checkoutWhere = shift.closedAt
    ? { status: 'closed' as const, checkOut: { gte: shift.openedAt, lte: shift.closedAt } }
    : { status: 'closed' as const, checkOut: { gte: shift.openedAt } }
  const roomAgg = await db.stay.aggregate({ where: { ...checkoutWhere, type: 'room' }, _count: { _all: true }, _sum: { stayAmount: true } })
  const consumoAgg = await db.stay.aggregate({ where: checkoutWhere, _sum: { consumptionAmount: true } })
  const nAptos = roomAgg._count._all
  const totalEstadias = Number(roomAgg._sum.stayAmount ?? 0)
  const totalConsumo = Number(consumoAgg._sum.consumptionAmount ?? 0)
  const movs = await db.cashMovement.findMany({ where: { shiftId: shift.id }, select: { type: true, amount: true } })
  const sum = (t: string) => movs.filter((m) => m.type === t).reduce((a, m) => a + Number(m.amount), 0)
  const round2 = (n: number) => Math.round(n * 100) / 100
  const saldo = Number(shift.openingBalance) + movs.reduce((a, m) => a + Number(m.amount), 0)
  return {
    nAptos,
    totalEstadias: round2(totalEstadias),
    totalConsumo: round2(totalConsumo),
    totalSangrias: round2(sum('withdrawal')),
    totalSuprimentos: round2(sum('supply')),
    totalCorrecoes: round2(sum('correction')),
    ticketMedio: nAptos > 0 ? round2(totalEstadias / nAptos) : 0,
    saldo: round2(saldo),
  }
}

export async function currentShiftSummary() {
  await requireCash()
  const shift = await getOpenShiftFor(new Date())
  if (!shift) return { shift: null, movements: [], metrics: null as ShiftMetrics | null }
  const movements = await db.cashMovement.findMany({ where: { shiftId: shift.id }, orderBy: { occurredAt: 'desc' } })
  return { shift, movements, metrics: await shiftMetrics(shift) }
}

export async function listClosedShifts(limit = 30) {
  await requireCash()
  const shifts = await db.shift.findMany({ where: { closedAt: { not: null } }, orderBy: { openedAt: 'desc' }, take: limit })
  return Promise.all(shifts.map(async (s) => ({ shift: s, metrics: await shiftMetrics(s) })))
}
