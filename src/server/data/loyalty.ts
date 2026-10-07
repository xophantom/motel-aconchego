import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'
import { normalizePlate, plateVariants } from '@/lib/plate'

// Recurring loyalty: every `everyVisits` paid visits earn `discountPercent` off
// one stay ("a cada 10 visitas, 1 grátis"). A stay that used the benefit is not
// a paid visit. Benefits accumulate and are applied by reception on the room.
export type LoyaltyPolicy = { everyVisits: number; discountPercent: number }
const DEFAULT_POLICY: LoyaltyPolicy = { everyVisits: 10, discountPercent: 100 }

export type LoyaltyStatus = LoyaltyPolicy & { paidVisits: number; used: number; available: number; nextIn: number }

async function requireUser() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  return me
}
async function requireLoyaltyViewer() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'loyalty:view')) throw new Error('Forbidden')
  return me
}
async function requireLoyaltyManager() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'loyalty:manage')) throw new Error('Forbidden')
  return me
}
async function requireOps() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:manage')) throw new Error('Forbidden')
  return me
}

export async function getLoyaltyPolicy(): Promise<LoyaltyPolicy> {
  await requireUser()
  const row = await db.loyaltyPolicy.findUnique({ where: { id: 1 } })
  return row ? { everyVisits: row.everyVisits, discountPercent: row.discountPercent } : DEFAULT_POLICY
}

export async function updateLoyaltyPolicy(input: LoyaltyPolicy) {
  await requireLoyaltyManager()
  const row = await db.loyaltyPolicy.upsert({ where: { id: 1 }, create: { id: 1, ...input }, update: input })
  await logEvent({ type: 'loyalty.policy', description: `Fidelidade: a cada ${input.everyVisits} visitas → ${input.discountPercent}% numa estadia`, entity: 'loyaltyPolicy', entityId: '1' })
  return row
}

export function loyaltyProgress(paidVisits: number, used: number, policy: LoyaltyPolicy): LoyaltyStatus {
  const everyVisits = Math.max(1, policy.everyVisits)
  const earned = Math.floor(paidVisits / everyVisits)
  return { ...policy, everyVisits, paidVisits, used, available: Math.max(0, earned - used), nextIn: everyVisits - (paidVisits % everyVisits) }
}

// Customer for a typed plate: reuse the one stored under it or under an older
// spelling of the same car (hyphen, pre-Mercosul), else create it canonical.
// A plate that is empty once normalized means no customer.
export async function customerByPlate(plate: string) {
  await requireOps()
  const canon = normalizePlate(plate)
  if (!canon) return null
  const existing = await db.customer.findMany({ where: { plate: { in: plateVariants(canon) } }, orderBy: { id: 'asc' } })
  return existing.find((c) => c.plate === canon) ?? existing[0] ?? db.customer.create({ data: { plate: canon } })
}

// Every customer row standing for the same car as `customerId`.
async function sameCarIds(customerId: bigint): Promise<bigint[]> {
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { plate: true } })
  if (!c?.plate) return [customerId]
  const rows = await db.customer.findMany({ where: { plate: { in: plateVariants(normalizePlate(c.plate)) } }, select: { id: true } })
  return rows.length ? rows.map((r) => r.id) : [customerId]
}

const PAID_VISIT = { type: 'room', status: 'closed', redemptions: { none: {} } } as const
const LIVE_REDEMPTION = { stay: { status: { not: 'canceled' } } } as const

export async function loyaltyStatus(customerId: bigint, opts: { excludeStayId?: bigint; policy?: LoyaltyPolicy } = {}): Promise<LoyaltyStatus> {
  await requireUser()
  const [ids, policy] = await Promise.all([sameCarIds(customerId), opts.policy ?? getLoyaltyPolicy()])
  const [paidVisits, used] = await Promise.all([
    db.stay.count({ where: { ...PAID_VISIT, customerId: { in: ids }, ...(opts.excludeStayId ? { id: { not: opts.excludeStayId } } : {}) } }),
    db.loyaltyRedemption.count({ where: { ...LIVE_REDEMPTION, customerId: { in: ids } } }),
  ])
  return loyaltyProgress(paidVisits, used, policy)
}

async function openStayOf(roomNumber: string) {
  const room = await db.room.findUniqueOrThrow({ where: { number: roomNumber }, include: { currentStay: true } })
  const stay = room.currentStay
  if (room.status !== 'occupied' || !stay || stay.status !== 'open') throw new Error('Room is not occupied')
  return stay
}

/** Use one available benefit on the room's open stay. Returns the discount percent. */
export async function applyLoyaltyToRoom(roomNumber: string) {
  await requireOps()
  const stay = await openStayOf(roomNumber)
  if (!stay.customerId) throw new Error('no open stay with customer')
  const customerId = stay.customerId
  const status = await loyaltyStatus(customerId, { excludeStayId: stay.id })
  if (status.available < 1) throw new Error('benefit unavailable')
  await db.$transaction(async (tx) => {
    // lock the stay so a double tap can't redeem twice
    await tx.$executeRaw`SELECT 1 FROM stay WHERE id = ${stay.id} FOR UPDATE`
    if (await tx.loyaltyRedemption.count({ where: { stayId: stay.id } })) throw new Error('benefit already applied')
    await tx.loyaltyRedemption.create({ data: { customerId, stayId: stay.id, discountPercent: status.discountPercent } })
    await tx.stay.update({ where: { id: stay.id }, data: { discountPercent: status.discountPercent } })
  })
  await logEvent({ type: 'loyalty.apply', description: `Fidelidade quarto ${roomNumber} · ${status.discountPercent}% na estadia`, entity: 'stay', entityId: String(stay.id), roomNumber })
  return status.discountPercent
}

/** Undo a benefit applied by mistake: the benefit goes back to the customer. */
export async function removeLoyaltyFromRoom(roomNumber: string) {
  await requireOps()
  const stay = await openStayOf(roomNumber)
  const { count } = await db.loyaltyRedemption.deleteMany({ where: { stayId: stay.id } })
  if (!count) throw new Error('no benefit applied')
  await db.stay.update({ where: { id: stay.id }, data: { discountPercent: 0 } })
  await logEvent({ type: 'loyalty.remove', description: `Fidelidade removida do quarto ${roomNumber}`, entity: 'stay', entityId: String(stay.id), roomNumber })
}

/** Set or fix the plate of the room's open stay (empty clears it). */
export async function setStayPlate(roomNumber: string, plate: string) {
  await requireOps()
  const stay = await openStayOf(roomNumber)
  if (await db.loyaltyRedemption.count({ where: { stayId: stay.id } })) throw new Error('benefit applied')
  const customer = await customerByPlate(plate)
  await db.stay.update({ where: { id: stay.id }, data: { customerId: customer?.id ?? null } })
  await logEvent({ type: 'stay.plate', description: `Placa quarto ${roomNumber}: ${customer?.plate ?? '—'}`, entity: 'stay', entityId: String(stay.id), roomNumber })
  return customer
}

export type LoyaltyCustomerRow = LoyaltyStatus & { plate: string; totalVisits: number; lastVisit: Date | null }

// Every plate with its loyalty progress, most recent visit first. Rows of the
// same car (older spellings) are summed under the canonical plate.
export async function listLoyaltyCustomers(q?: string): Promise<{ policy: LoyaltyPolicy; rows: LoyaltyCustomerRow[] }> {
  await requireLoyaltyViewer()
  const closedRoom = { customerId: { not: null }, type: 'room', status: 'closed' } as const
  const [policy, customers, visits, paid, used] = await Promise.all([
    getLoyaltyPolicy(),
    db.customer.findMany({ where: { plate: { not: null } }, select: { id: true, plate: true } }),
    db.stay.groupBy({ by: ['customerId'], where: closedRoom, _count: { _all: true }, _max: { checkOut: true } }),
    db.stay.groupBy({ by: ['customerId'], where: { ...closedRoom, ...PAID_VISIT }, _count: { _all: true } }),
    db.loyaltyRedemption.groupBy({ by: ['customerId'], where: LIVE_REDEMPTION, _count: { _all: true } }),
  ])
  const key = (id: bigint | null) => String(id)
  const visitsBy = new Map(visits.map((v) => [key(v.customerId), v]))
  const paidBy = new Map(paid.map((v) => [key(v.customerId), v._count._all]))
  const usedBy = new Map(used.map((v) => [key(v.customerId), v._count._all]))
  const byPlate = new Map<string, { totalVisits: number; paidVisits: number; used: number; lastVisit: Date | null }>()
  for (const c of customers) {
    const plate = normalizePlate(c.plate!)
    if (!plate) continue
    const acc = byPlate.get(plate) ?? { totalVisits: 0, paidVisits: 0, used: 0, lastVisit: null }
    const v = visitsBy.get(key(c.id))
    acc.totalVisits += v?._count._all ?? 0
    acc.paidVisits += paidBy.get(key(c.id)) ?? 0
    acc.used += usedBy.get(key(c.id)) ?? 0
    const last = v?._max.checkOut ?? null
    if (last && (!acc.lastVisit || last > acc.lastVisit)) acc.lastVisit = last
    byPlate.set(plate, acc)
  }
  const needle = q ? normalizePlate(q) : ''
  const rows = [...byPlate.entries()]
    .filter(([plate]) => !needle || plate.includes(needle))
    .map(([plate, a]) => ({ plate, totalVisits: a.totalVisits, lastVisit: a.lastVisit, ...loyaltyProgress(a.paidVisits, a.used, policy) }))
    .sort((a, b) => (b.lastVisit?.getTime() ?? 0) - (a.lastVisit?.getTime() ?? 0) || a.plate.localeCompare(b.plate))
  return { policy, rows }
}

export type LoyaltyVisit = {
  id: string; roomNumber: string | null; checkIn: Date; checkOut: Date | null; status: 'open' | 'closed' | 'canceled'
  stayAmount: number | null; consumptionAmount: number; benefitPercent: number | null
}

export async function loyaltyCustomerDetail(plate: string): Promise<{ plate: string; status: LoyaltyStatus; visits: LoyaltyVisit[] } | null> {
  await requireLoyaltyViewer()
  const canon = normalizePlate(plate)
  const customers = canon ? await db.customer.findMany({ where: { plate: { in: plateVariants(canon) } }, select: { id: true } }) : []
  if (!customers.length) return null
  const [status, stays] = await Promise.all([
    loyaltyStatus(customers[0].id),
    db.stay.findMany({
      where: { customerId: { in: customers.map((c) => c.id) }, type: 'room' },
      orderBy: { checkIn: 'desc' },
      take: 100,
      select: { id: true, roomNumber: true, checkIn: true, checkOut: true, status: true, stayAmount: true, consumptionAmount: true, redemptions: { select: { discountPercent: true } } },
    }),
  ])
  return {
    plate: canon,
    status,
    visits: stays.map((s) => ({
      id: String(s.id), roomNumber: s.roomNumber, checkIn: s.checkIn, checkOut: s.checkOut, status: s.status,
      stayAmount: s.stayAmount != null ? Number(s.stayAmount) : null, consumptionAmount: Number(s.consumptionAmount),
      benefitPercent: s.redemptions[0]?.discountPercent ?? null,
    })),
  }
}
