import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { computeStayAmount } from '@/lib/billing'
import type { CheckInInput } from '@/lib/validation/stay'
import { getOpenShiftFor } from '@/server/data/shifts'
import { customerByPlate } from '@/server/data/loyalty'
import { logEvent } from '@/server/audit'

async function requireOps() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:manage')) throw new Error('Forbidden')
  return me
}

export async function checkIn(input: Omit<CheckInInput, 'chargeMode'> & { chargeMode?: 'period' | 'overnight' }) {
  const me = await requireOps()
  const room = await db.room.findUniqueOrThrow({ where: { number: input.roomNumber } })
  if (room.status !== 'free') throw new Error('Room is not free')
  if (!room.categoryId) throw new Error('Room has no category')
  const openShiftId = (await getOpenShiftFor(new Date()))?.id ?? null
  const customer = input.plate ? await customerByPlate(input.plate) : null
  const stay = await db.$transaction(async (tx) => {
    const stay = await tx.stay.create({
      data: {
        type: 'room',
        roomNumber: input.roomNumber,
        categoryId: room.categoryId,
        checkIn: new Date(),
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
    description: `Entrada quarto ${input.roomNumber}${input.plate ? ` · placa ${input.plate}` : ''}`,
    entity: 'stay',
    entityId: String(stay.id),
    roomNumber: input.roomNumber,
  })
  return stay
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
  const openShiftId = (await getOpenShiftFor(checkOutAt))?.id ?? null
  await db.$transaction(async (tx) => {
    await tx.stay.update({ where: { id: stay.id }, data: { checkOut: checkOutAt, stayAmount, status: 'closed', paymentEmployeeId: me.id } })
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
