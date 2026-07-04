'use server'
import { revalidatePath } from 'next/cache'
import { entrySchema, costCenterSchema } from '@/lib/validation/finance'
import * as finance from '@/server/data/finance'

export type ActionState = { ok: boolean; error?: string }

const permErr = (e: unknown) => (e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.')

// 'YYYY-MM-DD' → local midnight Date (avoids the UTC shift of new Date('YYYY-MM-DD'))
function civilDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function createEntryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = entrySchema.safeParse({
    entryDate: fd.get('entryDate'), kind: fd.get('kind'), amount: fd.get('amount'),
    description: fd.get('description'), costCenter: fd.get('costCenter') || null,
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try {
    await finance.createEntry({ ...parsed.data, entryDate: civilDate(parsed.data.entryDate) })
  } catch (e) { return { ok: false, error: permErr(e) } }
  revalidatePath('/financeiro')
  return { ok: true }
}

export async function updateEntryAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = entrySchema.safeParse({
    entryDate: fd.get('entryDate'), kind: fd.get('kind'), amount: fd.get('amount'),
    description: fd.get('description'), costCenter: fd.get('costCenter') || null,
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try {
    await finance.updateEntry(BigInt(id), { ...parsed.data, entryDate: civilDate(parsed.data.entryDate) })
  } catch (e) { return { ok: false, error: permErr(e) } }
  revalidatePath('/financeiro')
  return { ok: true }
}

export async function deleteEntryAction(id: string): Promise<ActionState> {
  try { await finance.deleteEntry(BigInt(id)) } catch (e) { return { ok: false, error: permErr(e) } }
  revalidatePath('/financeiro')
  return { ok: true }
}

export async function saveCostCenterAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = costCenterSchema.safeParse({ code: fd.get('code'), description: fd.get('description') })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await finance.upsertCostCenter(parsed.data) } catch (e) { return { ok: false, error: permErr(e) } }
  revalidatePath('/financeiro')
  return { ok: true }
}

export async function deleteCostCenterAction(code: string): Promise<ActionState> {
  try { await finance.deleteCostCenter(code) }
  catch (e) { return { ok: false, error: e instanceof Error && /uso/i.test(e.message) ? 'Centro em uso: possui lançamentos.' : permErr(e) } }
  revalidatePath('/financeiro')
  return { ok: true }
}
