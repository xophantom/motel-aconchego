'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { upsertTier, deleteTier } from '@/server/data/loyalty'

export type ActionState = { ok: boolean; error?: string }
const tierSchema = z.object({ minVisits: z.coerce.number().int().min(1), discountPercent: z.coerce.number().int().min(1).max(100) })

export async function saveTierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = tierSchema.safeParse({ minVisits: fd.get('minVisits'), discountPercent: fd.get('discountPercent') })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await upsertTier(parsed.data) } catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/fidelidade')
  return { ok: true }
}
export async function deleteTierAction(id: number): Promise<ActionState> {
  try { await deleteTier(id) } catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro.' } }
  revalidatePath('/fidelidade')
  return { ok: true }
}
