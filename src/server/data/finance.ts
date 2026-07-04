import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'

async function requireFinance() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'finance:manage')) throw new Error('Forbidden')
  return me
}

export async function listCostCenters() {
  await requireFinance()
  const centers = await db.costCenter.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, description: true, _count: { select: { entries: true } } },
  })
  return centers.map((c) => ({ code: c.code, description: c.description, entryCount: c._count.entries }))
}

export async function upsertCostCenter(input: { code: string; description: string }) {
  await requireFinance()
  const center = await db.costCenter.upsert({
    where: { code: input.code },
    create: { code: input.code, description: input.description },
    update: { description: input.description },
  })
  await logEvent({ type: 'finance.costcenter.upsert', description: `Centro de custo ${center.code} salvo`, entity: 'costCenter', entityId: center.code })
  return center
}

export async function deleteCostCenter(code: string) {
  await requireFinance()
  const count = await db.ledgerEntry.count({ where: { costCenter: code } })
  if (count > 0) throw new Error('Centro em uso: possui lançamentos vinculados')
  await db.costCenter.delete({ where: { code } })
  await logEvent({ type: 'finance.costcenter.delete', description: `Centro de custo ${code} removido`, entity: 'costCenter', entityId: code })
}
