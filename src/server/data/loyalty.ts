import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'
import { cleanCodename, codenameKey } from '@/lib/codename'

// Recurring loyalty: every `everyVisits` paid visits earn `discountPercent` off
// one stay ("a cada 10 visitas, 1 grátis"). A stay that used the benefit is not
// a paid visit. Benefits accumulate and are applied by reception on the room.
// The client is a codename chosen at reception (the plate is just a record of
// the stay).
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
async function requireCodenameManager() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'codename:manage')) throw new Error('Forbidden')
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

// Client for a codename typed at reception: the one under the same key (case
// and accents ignored), else a new one. An empty codename means no client.
export async function customerByCodename(raw: string) {
  await requireOps()
  const codename = cleanCodename(raw)
  const key = codenameKey(codename)
  if (!key) return null
  return db.customer.upsert({ where: { codenameKey: key }, create: { codename, codenameKey: key }, update: {} })
}

const PAID_VISIT = { type: 'room', status: 'closed', redemptions: { none: {} } } as const
const LIVE_REDEMPTION = { stay: { status: { not: 'canceled' } } } as const

export async function loyaltyStatus(customerId: bigint, opts: { excludeStayId?: bigint; policy?: LoyaltyPolicy } = {}): Promise<LoyaltyStatus> {
  await requireUser()
  const [policy, paidVisits, used] = await Promise.all([
    opts.policy ?? getLoyaltyPolicy(),
    db.stay.count({ where: { ...PAID_VISIT, customerId, ...(opts.excludeStayId ? { id: { not: opts.excludeStayId } } : {}) } }),
    db.loyaltyRedemption.count({ where: { ...LIVE_REDEMPTION, customerId } }),
  ])
  return loyaltyProgress(paidVisits, used, policy)
}

type VisitStats = { totalVisits: number; paidVisits: number; used: number; lastVisit: Date | null }

// Visit counts of many clients in three queries (all of them, or just `ids`).
async function visitStats(ids?: bigint[]): Promise<(id: bigint) => VisitStats> {
  const scope = ids ? { customerId: { in: ids } } : {}
  const closedRoom = { customerId: { not: null }, ...scope, type: 'room', status: 'closed' } as const
  const [visits, paid, used] = await Promise.all([
    db.stay.groupBy({ by: ['customerId'], where: closedRoom, _count: { _all: true }, _max: { checkOut: true } }),
    db.stay.groupBy({ by: ['customerId'], where: { ...closedRoom, ...PAID_VISIT }, _count: { _all: true } }),
    db.loyaltyRedemption.groupBy({ by: ['customerId'], where: { ...LIVE_REDEMPTION, ...scope }, _count: { _all: true } }),
  ])
  const key = (id: bigint | null) => String(id)
  const visitsBy = new Map(visits.map((v) => [key(v.customerId), v]))
  const paidBy = new Map(paid.map((v) => [key(v.customerId), v._count._all]))
  const usedBy = new Map(used.map((v) => [key(v.customerId), v._count._all]))
  return (id) => ({
    totalVisits: visitsBy.get(key(id))?._count._all ?? 0,
    paidVisits: paidBy.get(key(id)) ?? 0,
    used: usedBy.get(key(id)) ?? 0,
    lastVisit: visitsBy.get(key(id))?._max.checkOut ?? null,
  })
}

export type CodenameMatch = { id: string; codename: string; available: number; done: number; everyVisits: number }

// Codenames containing the typed text, those starting with it first, with
// their progress — the picker at check-in and on the room.
export async function searchCodenames(q: string, limit = 8): Promise<CodenameMatch[]> {
  await requireOps()
  const key = codenameKey(q)
  if (!key) return []
  const select = { id: true, codename: true } as const
  const starts = await db.customer.findMany({ where: { codenameKey: { startsWith: key } }, select, orderBy: { codenameKey: 'asc' }, take: limit })
  const contains = starts.length < limit
    ? await db.customer.findMany({ where: { codenameKey: { contains: key }, id: { notIn: starts.map((c) => c.id) } }, select, orderBy: { codenameKey: 'asc' }, take: limit - starts.length })
    : []
  const found = [...starts, ...contains]
  const [policy, stats] = await Promise.all([getLoyaltyPolicy(), visitStats(found.map((c) => c.id))])
  return found.map((c) => {
    const s = stats(c.id)
    const p = loyaltyProgress(s.paidVisits, s.used, policy)
    return { id: String(c.id), codename: c.codename!, available: p.available, done: p.everyVisits - p.nextIn, everyVisits: p.everyVisits }
  })
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

/** Set or change the codename of the room's open stay (empty clears it). */
export async function setStayCodename(roomNumber: string, codename: string) {
  await requireOps()
  const stay = await openStayOf(roomNumber)
  if (await db.loyaltyRedemption.count({ where: { stayId: stay.id } })) throw new Error('benefit applied')
  const customer = await customerByCodename(codename)
  await db.stay.update({ where: { id: stay.id }, data: { customerId: customer?.id ?? null } })
  await logEvent({ type: 'stay.codename', description: `Codinome quarto ${roomNumber}: ${customer?.codename ?? '—'}`, entity: 'stay', entityId: String(stay.id), roomNumber })
  return customer
}

export type LoyaltyCustomerRow = LoyaltyStatus & { id: string; codename: string; totalVisits: number; lastVisit: Date | null }

// Every codename with its loyalty progress, most recent visit first.
export async function listLoyaltyCustomers(q?: string): Promise<{ policy: LoyaltyPolicy; rows: LoyaltyCustomerRow[] }> {
  await requireLoyaltyViewer()
  const needle = q ? codenameKey(q) : ''
  const [policy, customers, stats] = await Promise.all([
    getLoyaltyPolicy(),
    db.customer.findMany({ where: { codenameKey: needle ? { contains: needle } : { not: null } }, select: { id: true, codename: true } }),
    visitStats(),
  ])
  const rows = customers
    .map((c) => {
      const s = stats(c.id)
      return { id: String(c.id), codename: c.codename!, totalVisits: s.totalVisits, lastVisit: s.lastVisit, ...loyaltyProgress(s.paidVisits, s.used, policy) }
    })
    .sort((a, b) => (b.lastVisit?.getTime() ?? 0) - (a.lastVisit?.getTime() ?? 0) || a.codename.localeCompare(b.codename, 'pt-BR'))
  return { policy, rows }
}

export type LoyaltyVisit = {
  id: string; roomNumber: string | null; plate: string | null; checkIn: Date; checkOut: Date | null; status: 'open' | 'closed' | 'canceled'
  stayAmount: number | null; consumptionAmount: number; benefitPercent: number | null
}

export async function loyaltyCustomerDetail(id: string): Promise<{ id: string; codename: string; status: LoyaltyStatus; visits: LoyaltyVisit[] } | null> {
  await requireLoyaltyViewer()
  if (!/^\d+$/.test(id)) return null
  const customer = await db.customer.findUnique({ where: { id: BigInt(id) }, select: { id: true, codename: true } })
  if (!customer?.codename) return null
  const [status, stays] = await Promise.all([
    loyaltyStatus(customer.id),
    db.stay.findMany({
      where: { customerId: customer.id, type: 'room' },
      orderBy: { checkIn: 'desc' },
      take: 100,
      select: { id: true, roomNumber: true, plate: true, checkIn: true, checkOut: true, status: true, stayAmount: true, consumptionAmount: true, redemptions: { select: { discountPercent: true } } },
    }),
  ])
  return {
    id,
    codename: customer.codename,
    status,
    visits: stays.map((s) => ({
      id: String(s.id), roomNumber: s.roomNumber, plate: s.plate, checkIn: s.checkIn, checkOut: s.checkOut, status: s.status,
      stayAmount: s.stayAmount != null ? Number(s.stayAmount) : null, consumptionAmount: Number(s.consumptionAmount),
      benefitPercent: s.redemptions[0]?.discountPercent ?? null,
    })),
  }
}

async function codenameOrThrow(id: bigint) {
  const c = await db.customer.findUnique({ where: { id } })
  if (!c?.codename) throw new Error('codename not found')
  return c as typeof c & { codename: string }
}

export async function renameCodename(id: bigint, raw: string) {
  await requireCodenameManager()
  const before = await codenameOrThrow(id)
  const codename = cleanCodename(raw)
  const key = codenameKey(codename)
  if (!key) throw new Error('codename required')
  const clash = await db.customer.findUnique({ where: { codenameKey: key }, select: { id: true } })
  if (clash && clash.id !== id) throw new Error('codename taken')
  const updated = await db.customer.update({ where: { id }, data: { codename, codenameKey: key } })
  await logEvent({ type: 'customer.rename', description: `Codinome ${before.codename} → ${codename}`, entity: 'customer', entityId: String(id) })
  return updated
}

// Fold a duplicate codename into another: its visits and benefits move over and
// the duplicate is deleted. Returns the codename that remains.
export async function mergeCodenames(fromId: bigint, intoCodename: string) {
  await requireCodenameManager()
  const from = await codenameOrThrow(fromId)
  const key = codenameKey(intoCodename)
  const into = key ? await db.customer.findUnique({ where: { codenameKey: key } }) : null
  if (!into?.codename) throw new Error('codename not found')
  if (into.id === from.id) throw new Error('same codename')
  await db.$transaction([
    db.stay.updateMany({ where: { customerId: from.id }, data: { customerId: into.id } }),
    db.loyaltyRedemption.updateMany({ where: { customerId: from.id }, data: { customerId: into.id } }),
    db.customer.delete({ where: { id: from.id } }),
  ])
  await logEvent({ type: 'customer.merge', description: `Codinome ${from.codename} juntado em ${into.codename}`, entity: 'customer', entityId: String(into.id) })
  return into
}

// Only a codename never used on a stay can go (a typo caught right away);
// one with history is merged instead, so no visit is lost.
export async function deleteCodename(id: bigint) {
  await requireCodenameManager()
  const c = await codenameOrThrow(id)
  const [stays, redemptions] = await Promise.all([
    db.stay.count({ where: { customerId: id } }),
    db.loyaltyRedemption.count({ where: { customerId: id } }),
  ])
  if (stays || redemptions) throw new Error('codename has visits')
  await db.customer.delete({ where: { id } })
  await logEvent({ type: 'customer.delete', description: `Codinome ${c.codename} excluído`, entity: 'customer', entityId: String(id) })
}
