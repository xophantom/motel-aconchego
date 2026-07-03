import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'

async function requireLoyaltyManager() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'loyalty:manage')) throw new Error('Forbidden')
}
async function requireOps() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:manage')) throw new Error('Forbidden')
}
function normalizePlate(p: string) { return p.toUpperCase().replace(/\s+/g, '') }

export async function listTiers() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  return db.loyaltyTier.findMany({ orderBy: { minVisits: 'asc' } })
}
export async function upsertTier(input: { minVisits: number; discountPercent: number }) {
  await requireLoyaltyManager()
  return db.loyaltyTier.upsert({ where: { minVisits: input.minVisits }, create: input, update: { discountPercent: input.discountPercent } })
}
export async function deleteTier(id: number) {
  await requireLoyaltyManager()
  return db.loyaltyTier.delete({ where: { id } })
}
export async function customerByPlate(plate: string) {
  await requireOps()
  const norm = normalizePlate(plate)
  return db.customer.upsert({ where: { plate: norm }, create: { plate: norm }, update: {} })
}
export async function customerVisits(customerId: bigint, excludeStayId?: bigint) {
  return db.stay.count({ where: { customerId, type: 'room', status: 'closed', ...(excludeStayId ? { id: { not: excludeStayId } } : {}) } })
}
export async function availableTiers(customerId: bigint, excludeStayId?: bigint) {
  const visits = await customerVisits(customerId, excludeStayId)
  const [tiers, redeemed] = await Promise.all([
    db.loyaltyTier.findMany({ where: { minVisits: { lte: visits } }, orderBy: { minVisits: 'asc' } }),
    db.loyaltyRedemption.findMany({ where: { customerId }, select: { tierId: true } }),
  ])
  const redeemedIds = new Set(redeemed.map((r) => r.tierId))
  return { visits, tiers: tiers.filter((t) => !redeemedIds.has(t.id)) }
}
export async function redeemTier(input: { customerId: bigint; tierId: number; stayId: bigint }) {
  await requireOps()
  const tier = await db.loyaltyTier.findUniqueOrThrow({ where: { id: input.tierId } })
  await db.loyaltyRedemption.create({ data: { customerId: input.customerId, tierId: tier.id, stayId: input.stayId } })
  return tier.discountPercent
}
