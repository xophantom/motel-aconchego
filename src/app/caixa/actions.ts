'use server'
import { revalidatePath } from 'next/cache'
import { openShiftSchema, closeShiftSchema, cashMovementSchema } from '@/lib/validation/shift'
import * as shifts from '@/server/data/shifts'

export type ActionState = { ok: boolean; error?: string }

function mapErr(e: unknown): string {
  if (e instanceof Error) {
    if (/forbidden/i.test(e.message)) return 'Sem permissão.'
    if (/já aberto/i.test(e.message)) return 'Caixa já está aberto.'
    if (/já fechado/i.test(e.message)) return 'Caixa já fechado neste período.'
  }
  return 'Erro ao processar.'
}

export async function openShiftAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = openShiftSchema.safeParse({ openingBalance: fd.get('openingBalance') ?? 0 })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await shifts.openShift(parsed.data) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/caixa')
  return { ok: true }
}

export async function closeShiftAction(shiftId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = closeShiftSchema.safeParse({ closingBalance: fd.get('closingBalance') ?? 0 })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await shifts.closeShift(BigInt(shiftId), parsed.data) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/caixa')
  return { ok: true }
}

export async function cashMovementAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = cashMovementSchema.safeParse({ type: fd.get('type'), amount: fd.get('amount'), description: fd.get('description') ?? undefined })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await shifts.addCashMovement(parsed.data) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/caixa')
  return { ok: true }
}
