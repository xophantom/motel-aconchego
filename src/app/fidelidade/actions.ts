'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { updateLoyaltyPolicy } from '@/server/data/loyalty'

export type ActionState = { ok: boolean; error?: string }
const policySchema = z.object({ everyVisits: z.coerce.number().int().min(1).max(100), discountPercent: z.coerce.number().int().min(1).max(100) })

export async function saveLoyaltyPolicyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = policySchema.safeParse({ everyVisits: fd.get('everyVisits'), discountPercent: fd.get('discountPercent') })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await updateLoyaltyPolicy(parsed.data) } catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/fidelidade'); revalidatePath('/quartos')
  return { ok: true }
}
