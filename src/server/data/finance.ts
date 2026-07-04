import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'
import { Prisma, type LedgerKind } from '@/generated/prisma/client'

const round2 = (n: number) => Math.round(n * 100) / 100

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

export type EntryFilter = { from: Date; to: Date; costCenter?: string; kind?: LedgerKind }
export type EntryDTO = { entryDate: Date; kind: LedgerKind; amount: number; description: string; costCenter?: string | null }
export type EntryRow = {
  id: bigint; entryDate: Date; kind: LedgerKind; amount: number
  description: string; costCenter: string | null; centerDescription: string | null; operatorName: string | null
}

export async function listEntries(filter: EntryFilter): Promise<EntryRow[]> {
  await requireFinance()
  const where: Prisma.LedgerEntryWhereInput = { entryDate: { gte: filter.from, lte: filter.to } }
  if (filter.costCenter) where.costCenter = filter.costCenter
  if (filter.kind) where.kind = filter.kind
  const rows = await db.ledgerEntry.findMany({
    where,
    orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
    select: {
      id: true, entryDate: true, kind: true, amount: true, description: true, costCenter: true,
      center: { select: { description: true } }, employee: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id, entryDate: r.entryDate, kind: r.kind, amount: Number(r.amount), description: r.description,
    costCenter: r.costCenter, centerDescription: r.center?.description ?? null, operatorName: r.employee?.name ?? null,
  }))
}

export async function createEntry(input: EntryDTO) {
  const me = await requireFinance()
  const entry = await db.ledgerEntry.create({
    data: {
      entryDate: input.entryDate, kind: input.kind, amount: input.amount,
      description: input.description, costCenter: input.costCenter ?? null, employeeId: me.id,
    },
  })
  await logEvent({ type: 'finance.entry.create', description: `${input.kind === 'income' ? 'Receita' : 'Despesa'} R$ ${input.amount.toFixed(2)} · ${input.description}`, entity: 'ledgerEntry', entityId: String(entry.id) })
  return { id: entry.id }
}

export async function updateEntry(id: bigint, input: EntryDTO) {
  await requireFinance()
  await db.ledgerEntry.update({
    where: { id },
    data: {
      entryDate: input.entryDate, kind: input.kind, amount: input.amount,
      description: input.description, costCenter: input.costCenter ?? null,
    },
  })
  await logEvent({ type: 'finance.entry.update', description: `Lançamento #${id} atualizado`, entity: 'ledgerEntry', entityId: String(id) })
  return { id }
}

export async function deleteEntry(id: bigint) {
  await requireFinance()
  await db.ledgerEntry.delete({ where: { id } })
  await logEvent({ type: 'finance.entry.delete', description: `Lançamento #${id} removido`, entity: 'ledgerEntry', entityId: String(id) })
}
