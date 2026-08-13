'use server'
import { revalidatePath } from 'next/cache'
import { closeShiftSchema, cashMovementSchema } from '@/lib/validation/shift'
import * as shifts from '@/server/data/shifts'
import { updateCashPolicy } from '@/server/data/cash-policy'

export type ActionState = { ok: boolean; error?: string }

function mapErr(e: unknown): string {
  if (e instanceof Error) {
    if (/forbidden/i.test(e.message)) return 'Sem permissão.'
    if (/já aberto/i.test(e.message)) return 'Caixa já está aberto.'
    if (/já fechado/i.test(e.message)) return 'Caixa já fechado neste período.'
    if (/senha/i.test(e.message)) return 'Senha incorreta.'
  }
  return 'Erro ao processar.'
}

export async function closeShiftAction(shiftId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = closeShiftSchema.safeParse({ finalWithdrawCash: fd.get('finalWithdrawCash') ?? 0, finalWithdrawCard: fd.get('finalWithdrawCard') ?? 0, password: fd.get('password') ?? '' })
  if (!parsed.success) return { ok: false, error: 'Informe a senha para fechar.' }
  try { await shifts.closeShift(BigInt(shiftId), parsed.data) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/caixa'); revalidatePath('/quartos')
  return { ok: true }
}

export async function cashMovementAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = cashMovementSchema.safeParse({ type: fd.get('type'), amount: fd.get('amount'), method: fd.get('method') ?? undefined, description: fd.get('description') ?? undefined })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await shifts.addCashMovement(parsed.data) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/caixa')
  return { ok: true }
}

export async function updateCashPolicyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const v = Number(fd.get('expectedOpeningBalance') ?? 0)
  if (!Number.isFinite(v) || v < 0) return { ok: false, error: 'Valor inválido.' }
  try { await updateCashPolicy(v) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/caixa')
  return { ok: true }
}
