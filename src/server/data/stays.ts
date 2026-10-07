import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { computeStayAmount } from '@/lib/billing'
import type { CheckInInput } from '@/lib/validation/stay'
import { getCurrentOpenShift, getOrOpenCurrentShift } from '@/server/data/shifts'
import { customerByPlate } from '@/server/data/loyalty'
import { logEvent } from '@/server/audit'
import { formatHm, resolveEntryTime } from '@/lib/time'

async function requireOps() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:manage')) throw new Error('Forbidden')
  return me
}

async function requireCancelWindow() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:cancel')) throw new Error('Forbidden')
  if (me.role !== 'manager') {
    const open = await getCurrentOpenShift()
    if (!open) throw new Error('shift closed')
  }
  return me
}

// A back-dated entry ("forgot to check the room in") can't reach further back
// than this, nor before the room's previous checkout.
const MAX_ENTRY_BACKDATE_MS = 12 * 60 * 60_000

async function resolveCheckInAt(roomNumber: string, hhmm: string, now: Date, excludeStayId?: bigint): Promise<Date> {
  const at = resolveEntryTime(hhmm, now)
  if (now.getTime() - at.getTime() > MAX_ENTRY_BACKDATE_MS) throw new Error('entry time too old')
  const prev = await db.stay.findFirst({
    where: { roomNumber, status: 'closed', checkOut: { not: null }, ...(excludeStayId ? { id: { not: excludeStayId } } : {}) },
    orderBy: { checkOut: 'desc' },
    select: { checkOut: true },
  })
  if (prev?.checkOut && at < prev.checkOut) throw new Error('entry time before previous checkout')
  return at
}

export async function checkIn(input: Omit<CheckInInput, 'chargeMode'> & { chargeMode?: 'period' | 'overnight' }) {
  const me = await requireOps()
  const room = await db.room.findUniqueOrThrow({ where: { number: input.roomNumber } })
  if (room.status !== 'free') throw new Error('Room is not free')
  if (!room.categoryId) throw new Error('Room has no category')
  const now = new Date()
  const checkInAt = input.checkInTime ? await resolveCheckInAt(input.roomNumber, input.checkInTime, now) : now
  const openShiftId = (await getOrOpenCurrentShift().catch(() => null))?.id ?? null
  const customer = input.plate ? await customerByPlate(input.plate) : null
  const stay = await db.$transaction(async (tx) => {
    const stay = await tx.stay.create({
      data: {
        type: 'room',
        roomNumber: input.roomNumber,
        categoryId: room.categoryId,
        checkIn: checkInAt,
        day: input.day,
        chargeMode: input.chargeMode ?? 'period',
        guests: input.guests,
        prepaidAmount: input.prepaidAmount,
        status: 'open',
        entryEmployeeId: me.id,
        customerId: customer?.id ?? null,
      },
    })
    await tx.room.update({ where: { number: input.roomNumber }, data: { status: 'occupied', currentStayId: stay.id } })
    if (input.prepaidAmount > 0) {
      await tx.cashMovement.create({
        data: { type: 'stay', stayId: stay.id, amount: input.prepaidAmount, employeeId: me.id, shiftId: openShiftId, occurredAt: new Date(), description: `Antecipado quarto ${input.roomNumber}` },
      })
    }
    return stay
  })
  await logEvent({
    type: 'stay.checkin',
    description: `Entrada quarto ${input.roomNumber}${input.plate ? ` · placa ${input.plate}` : ''}${checkInAt !== now ? ` · horário informado ${formatHm(checkInAt)}` : ''}`,
    entity: 'stay',
    entityId: String(stay.id),
    roomNumber: input.roomNumber,
  })
  return stay
}

async function requireOpenStay(roomNumber: string) {
  const room = await db.room.findUniqueOrThrow({ where: { number: roomNumber }, include: { currentStay: true } })
  if (room.status !== 'occupied' || !room.currentStay || room.currentStay.status !== 'open') throw new Error('Room is not occupied')
  return room.currentStay
}

// Prepaid received after the entry: adds to the stay's prepaid (deducted at
// checkout) and enters the current shift's cash now, like a check-in prepaid.
export async function addPrepaid(roomNumber: string, amount: number) {
  const me = await requireOps()
  if (!(amount > 0)) throw new Error('invalid amount')
  const stay = await requireOpenStay(roomNumber)
  const openShiftId = (await getOrOpenCurrentShift().catch(() => null))?.id ?? null
  const updated = await db.$transaction(async (tx) => {
    await tx.cashMovement.create({
      data: { type: 'stay', stayId: stay.id, amount, employeeId: me.id, shiftId: openShiftId, occurredAt: new Date(), description: `Antecipado quarto ${roomNumber}` },
    })
    return tx.stay.update({ where: { id: stay.id }, data: { prepaidAmount: { increment: amount } } })
  })
  await logEvent({ type: 'stay.prepaid', description: `Antecipado quarto ${roomNumber} · R$ ${amount.toFixed(2)}`, entity: 'stay', entityId: String(stay.id), roomNumber })
  return updated
}

// Fix the entry time of an occupied room (entry registered late or typo).
export async function updateCheckInTime(roomNumber: string, hhmm: string) {
  await requireOps()
  const stay = await requireOpenStay(roomNumber)
  const at = await resolveCheckInAt(roomNumber, hhmm, new Date(), stay.id)
  const updated = await db.stay.update({ where: { id: stay.id }, data: { checkIn: at } })
  await logEvent({ type: 'stay.edit_checkin', description: `Horário de entrada quarto ${roomNumber}: ${formatHm(stay.checkIn)} → ${formatHm(at)}`, entity: 'stay', entityId: String(stay.id), roomNumber })
  return updated
}

export async function checkOut(roomNumber: string) {
  const me = await requireOps()
  const room = await db.room.findUniqueOrThrow({ where: { number: roomNumber }, include: { currentStay: true, category: true } })
  if (room.status !== 'occupied' || !room.currentStay || !room.category) throw new Error('Room is not occupied')
  const stay = room.currentStay
  const cat = room.category
  const rate = await db.rate.findUniqueOrThrow({ where: { categoryId_day: { categoryId: cat.id, day: stay.day } } })
  const checkOutAt = new Date()
  const rawStayAmount = computeStayAmount({
    billing: cat.billing,
    chargeMode: stay.chargeMode,
    minPeriodMin: cat.minPeriodMin,
    maxPeriodMin: cat.maxPeriodMin,
    includedGuests: cat.includedGuests,
    rate: {
      basePrice: Number(rate.basePrice),
      excessPrice30m: Number(rate.excessPrice30m),
      overnightPrice: Number(rate.overnightPrice),
      extraGuestPrice: Number(rate.extraGuestPrice),
    },
    checkIn: stay.checkIn,
    checkOut: checkOutAt,
    guests: stay.guests,
  })
  const discount = stay.discountPercent ?? 0
  const stayAmount = discount > 0 ? Math.round(rawStayAmount * (1 - discount / 100) * 100) / 100 : rawStayAmount
  const balance = stayAmount + Number(stay.consumptionAmount) - Number(stay.prepaidAmount)
  const openShiftId = (await getOrOpenCurrentShift().catch(() => null))?.id ?? null
  await db.$transaction(async (tx) => {
    await tx.stay.update({ where: { id: stay.id }, data: { checkOut: checkOutAt, stayAmount, status: 'closed', paymentEmployeeId: me.id, shiftId: openShiftId } })
    await tx.cashMovement.create({
      data: { type: 'stay', stayId: stay.id, amount: balance, employeeId: me.id, shiftId: openShiftId, occurredAt: checkOutAt, description: `Saída quarto ${roomNumber}` },
    })
    await tx.room.update({ where: { number: roomNumber }, data: { status: 'cleaning', currentStayId: null } })
  })
  await logEvent({
    type: 'stay.checkout',
    description: `Saída quarto ${roomNumber} · R$ ${balance.toFixed(2)}`,
    entity: 'stay',
    entityId: String(stay.id),
    roomNumber,
  })
  return { stayAmount, balance }
}

export async function cancelCheckIn(roomNumber: string, reason: string): Promise<void> {
  const me = await requireCancelWindow()
  if (!reason.trim()) throw new Error('reason required')
  const room = await db.room.findUniqueOrThrow({ where: { number: roomNumber }, include: { currentStay: true } })
  if (room.status !== 'occupied' || !room.currentStay || room.currentStay.status !== 'open') throw new Error('not occupied')
  const stay = room.currentStay
  const shiftId = (await getOrOpenCurrentShift().catch(() => null))?.id ?? null
  const movs = await db.cashMovement.findMany({ where: { stayId: stay.id, type: 'stay' } })
  await db.$transaction(async (tx) => {
    for (const m of movs) {
      await tx.cashMovement.create({
        data: { type: 'stay', stayId: stay.id, amount: -Number(m.amount), employeeId: me.id, shiftId, occurredAt: new Date(), description: `estorno · cancelamento · ${reason}` },
      })
    }
    await tx.stay.update({ where: { id: stay.id }, data: { status: 'canceled', canceledAt: new Date(), canceledReason: reason, canceledById: me.id } })
    await tx.room.update({ where: { number: roomNumber }, data: { status: 'free', currentStayId: null } })
  })
  await logEvent({ type: 'stay.cancel_checkin', description: `Cancelou entrada quarto ${roomNumber} · ${reason}`, entity: 'stay', entityId: String(stay.id), roomNumber })
}

export async function cancelCheckOut(roomNumber: string, reason: string): Promise<void> {
  const me = await requireCancelWindow()
  if (!reason.trim()) throw new Error('reason required')
  const room = await db.room.findUniqueOrThrow({ where: { number: roomNumber } })
  if (room.status !== 'free' && room.status !== 'cleaning') throw new Error('room reoccupied')
  const stay = await db.stay.findFirst({ where: { roomNumber, status: 'closed', type: 'room' }, orderBy: { checkOut: 'desc' } })
  if (!stay || !stay.checkOut) throw new Error('no closed stay')
  const shiftId = (await getOrOpenCurrentShift().catch(() => null))?.id ?? null
  // the checkout balance movement(s): stay-type, at or after the checkout time (the prepaid was created at check-in, earlier)
  const movs = await db.cashMovement.findMany({ where: { stayId: stay.id, type: 'stay', occurredAt: { gte: stay.checkOut } } })
  await db.$transaction(async (tx) => {
    for (const m of movs) {
      await tx.cashMovement.create({
        data: { type: 'stay', stayId: stay.id, amount: -Number(m.amount), employeeId: me.id, shiftId, occurredAt: new Date(), description: `estorno · cancelamento · ${reason}` },
      })
    }
    await tx.stay.update({ where: { id: stay.id }, data: { status: 'open', checkOut: null, stayAmount: null, paymentEmployeeId: null } })
    await tx.room.update({ where: { number: roomNumber }, data: { status: 'occupied', currentStayId: stay.id } })
  })
  await logEvent({ type: 'stay.cancel_checkout', description: `Cancelou saída quarto ${roomNumber} · ${reason}`, entity: 'stay', entityId: String(stay.id), roomNumber })
}

export async function canCancelNow(): Promise<boolean> {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:cancel')) return false
  if (me.role === 'manager') return true
  return !!(await getCurrentOpenShift())
}

export type TicketData = {
  id: string
  roomNumber: string | null
  categoryDescription: string | null
  checkIn: Date
  checkOut: Date | null
  stayAmount: number
  consumptionAmount: number
  prepaidAmount: number
  discountPercent: number
  items: { description: string; qty: number; unitPrice: number }[]
  entryOperator: string | null
  paymentOperator: string | null
}

export async function getStayForTicket(stayId: bigint): Promise<TicketData | null> {
  await requireOps()
  const stay = await db.stay.findUnique({
    where: { id: stayId },
    select: {
      id: true, roomNumber: true, checkIn: true, checkOut: true,
      stayAmount: true, consumptionAmount: true, prepaidAmount: true, discountPercent: true,
      category: { select: { description: true } },
      entryEmployee: { select: { name: true } },
      paymentEmployee: { select: { name: true } },
      consumptions: { orderBy: { createdAt: 'asc' }, select: { qty: true, unitPrice: true, product: { select: { description: true } }, productCode: true } },
    },
  })
  if (!stay) return null
  return {
    id: String(stay.id),
    roomNumber: stay.roomNumber,
    categoryDescription: stay.category?.description ?? null,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    stayAmount: Number(stay.stayAmount ?? 0),
    consumptionAmount: Number(stay.consumptionAmount ?? 0),
    prepaidAmount: Number(stay.prepaidAmount ?? 0),
    discountPercent: stay.discountPercent,
    items: stay.consumptions.map((c) => ({ description: c.product?.description ?? c.productCode ?? '—', qty: c.qty, unitPrice: Number(c.unitPrice) })),
    entryOperator: stay.entryEmployee?.name ?? null,
    paymentOperator: stay.paymentEmployee?.name ?? null,
  }
}
