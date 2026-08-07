import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'

const DEFAULT_EXPECTED = 150

export async function getCashPolicy(): Promise<{ expectedOpeningBalance: number }> {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  const row = await db.cashPolicy.findUnique({ where: { id: 1 } })
  return { expectedOpeningBalance: row ? Number(row.expectedOpeningBalance) : DEFAULT_EXPECTED }
}

export async function updateCashPolicy(expectedOpeningBalance: number): Promise<{ expectedOpeningBalance: number }> {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'finance:manage')) throw new Error('Forbidden')
  const clean = Math.max(0, Math.round(expectedOpeningBalance * 100) / 100)
  const row = await db.cashPolicy.upsert({ where: { id: 1 }, update: { expectedOpeningBalance: clean }, create: { id: 1, expectedOpeningBalance: clean } })
  await logEvent({ type: 'cash.policy', description: `Fundo de caixa esperado: R$ ${clean.toFixed(2)}`, entity: 'cash_policy', entityId: '1' })
  return { expectedOpeningBalance: Number(row.expectedOpeningBalance) }
}
