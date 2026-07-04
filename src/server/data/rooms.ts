import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { logEvent } from '@/server/audit'
import type { RoomStatus } from '@/generated/prisma/client'

const STATUS_PT: Record<RoomStatus, string> = {
  free: 'livre',
  occupied: 'ocupado',
  cleaning: 'limpeza',
  maintenance: 'manutenção',
}

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
      currentStay: { select: { id: true, checkIn: true, guests: true, day: true, chargeMode: true, categoryId: true, prepaidAmount: true, consumptionAmount: true, customerId: true, discountPercent: true, customer: { select: { plate: true } } } },
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
  const room = await db.room.update({
    where: { number },
    data: { status, maintenanceReason: status === 'maintenance' ? reason : null },
  })
  await logEvent({
    type: 'room.status',
    description: `Quarto ${number} → ${STATUS_PT[status]}${status === 'maintenance' && reason ? ` (${reason})` : ''}`,
    entity: 'room',
    entityId: number,
    roomNumber: number,
  })
  return room
}
