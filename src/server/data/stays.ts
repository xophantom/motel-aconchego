import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { computeStayAmount } from '@/lib/billing'
import type { CheckInInput } from '@/lib/validation/stay'

async function requireOps() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:manage')) throw new Error('Forbidden')
  return me
}

export async function checkIn(input: CheckInInput) {
  const me = await requireOps()
  const room = await db.room.findUniqueOrThrow({ where: { number: input.roomNumber } })
  if (room.status !== 'free') throw new Error('Room is not free')
  if (!room.categoryId) throw new Error('Room has no category')
  return db.$transaction(async (tx) => {
    const stay = await tx.stay.create({
      data: {
        type: 'room',
        roomNumber: input.roomNumber,
        categoryId: room.categoryId,
        checkIn: new Date(),
        day: input.day,
        guests: input.guests,
        prepaidAmount: input.prepaidAmount,
        status: 'open',
        entryEmployeeId: me.id,
      },
    })
    await tx.room.update({ where: { number: input.roomNumber }, data: { status: 'occupied', currentStayId: stay.id } })
    if (input.prepaidAmount > 0) {
      await tx.cashMovement.create({
        data: { type: 'stay', stayId: stay.id, amount: input.prepaidAmount, employeeId: me.id, occurredAt: new Date(), description: `Antecipado quarto ${input.roomNumber}` },
      })
    }
    return stay
  })
}

export async function checkOut(roomNumber: string) {
  const me = await requireOps()
  const room = await db.room.findUniqueOrThrow({ where: { number: roomNumber }, include: { currentStay: true, category: true } })
  if (room.status !== 'occupied' || !room.currentStay || !room.category) throw new Error('Room is not occupied')
  const stay = room.currentStay
  const cat = room.category
  const rate = await db.rate.findUniqueOrThrow({ where: { categoryId_day: { categoryId: cat.id, day: stay.day } } })
  const checkOutAt = new Date()
  const stayAmount = computeStayAmount({
    billing: cat.billing,
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
  const balance = stayAmount + Number(stay.consumptionAmount) - Number(stay.prepaidAmount)
  await db.$transaction(async (tx) => {
    await tx.stay.update({ where: { id: stay.id }, data: { checkOut: checkOutAt, stayAmount, status: 'closed', paymentEmployeeId: me.id } })
    await tx.cashMovement.create({
      data: { type: 'stay', stayId: stay.id, amount: balance, employeeId: me.id, occurredAt: checkOutAt, description: `Saída quarto ${roomNumber}` },
    })
    await tx.room.update({ where: { number: roomNumber }, data: { status: 'cleaning', currentStayId: null } })
  })
  return { stayAmount, balance }
}
