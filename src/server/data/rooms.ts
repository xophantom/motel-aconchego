import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import type { RoomStatus } from '@/generated/prisma/client'

export async function listRoomsWithCurrentStay() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  return db.room.findMany({
    where: { active: true },
    orderBy: { number: 'asc' },
    select: {
      number: true,
      status: true,
      maintenanceReason: true,
      category: { select: { code: true, description: true } },
      currentStay: { select: { id: true, checkIn: true, guests: true, day: true, chargeMode: true, categoryId: true, prepaidAmount: true, consumptionAmount: true } },
    },
  })
}

export async function setRoomStatus(number: string, status: RoomStatus, reason?: string) {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  if (status === 'occupied') throw new Error('Use check-in to occupy a room')
  if (me.role === 'housekeeper' && status !== 'free' && status !== 'cleaning') {
    throw new Error('Forbidden')
  }
  if (status === 'maintenance' && !reason) throw new Error('Maintenance requires a reason')
  return db.room.update({
    where: { number },
    data: { status, maintenanceReason: status === 'maintenance' ? reason : null },
  })
}
