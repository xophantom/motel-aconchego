import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { Prisma } from '@/generated/prisma/client'

async function requireAuditView() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'audit:view')) throw new Error('Forbidden')
  return me
}

export type EventFilter = {
  from?: Date
  to?: Date
  type?: string
  employeeId?: number
  q?: string
  take?: number
  skip?: number
}

export type EventRow = {
  id: bigint
  occurredAt: Date
  type: string | null
  description: string | null
  roomNumber: string | null
  entity: string | null
  entityId: string | null
  operatorName: string | null
}

function buildWhere(filter: EventFilter): Prisma.EventLogWhereInput {
  const where: Prisma.EventLogWhereInput = {}
  if (filter.from || filter.to) where.occurredAt = { gte: filter.from, lte: filter.to }
  if (filter.type) where.type = filter.type
  if (filter.employeeId) where.employeeId = filter.employeeId
  if (filter.q) where.description = { contains: filter.q, mode: 'insensitive' }
  return where
}

export async function listEvents(filter: EventFilter): Promise<{ events: EventRow[]; total: number }> {
  await requireAuditView()
  const where = buildWhere(filter)
  const [rows, total] = await Promise.all([
    db.eventLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: filter.take ?? 100,
      skip: filter.skip ?? 0,
      select: {
        id: true, occurredAt: true, type: true, description: true,
        roomNumber: true, entity: true, entityId: true,
        employee: { select: { name: true } },
      },
    }),
    db.eventLog.count({ where }),
  ])
  const events = rows.map((r) => ({
    id: r.id, occurredAt: r.occurredAt, type: r.type, description: r.description,
    roomNumber: r.roomNumber, entity: r.entity, entityId: r.entityId,
    operatorName: r.employee?.name ?? null,
  }))
  return { events, total }
}

export async function listEventTypes(): Promise<string[]> {
  await requireAuditView()
  const rows = await db.eventLog.findMany({ distinct: ['type'], select: { type: true }, orderBy: { type: 'asc' } })
  return rows.map((r) => r.type).filter((t): t is string => !!t)
}

export async function listEventOperators(): Promise<{ id: number; name: string }[]> {
  await requireAuditView()
  return db.employee.findMany({ where: { events: { some: {} } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
}
