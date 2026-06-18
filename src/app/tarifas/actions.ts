'use server'
import { revalidatePath } from 'next/cache'
import { updateCategorySchema, updateRateSchema } from '@/lib/validation/tariff'
import * as tariff from '@/server/data/tariff'

export type ActionState = { ok: boolean; error?: string }

export async function updateCategoryAction(categoryId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = updateCategorySchema.safeParse({
    billing: fd.get('billing'), minPeriodMin: fd.get('minPeriodMin'),
    maxPeriodMin: fd.get('maxPeriodMin'), includedGuests: fd.get('includedGuests'),
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await tariff.updateCategory(categoryId, parsed.data) }
  catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/tarifas')
  return { ok: true }
}

export async function updateRateAction(categoryId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = updateRateSchema.safeParse({
    day: fd.get('day'), basePrice: fd.get('basePrice'), excessPrice30m: fd.get('excessPrice30m'),
    overnightPrice: fd.get('overnightPrice'), extraGuestPrice: fd.get('extraGuestPrice'),
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await tariff.updateRate(categoryId, parsed.data) }
  catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/tarifas')
  return { ok: true }
}
