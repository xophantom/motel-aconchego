'use server'
import { revalidatePath } from 'next/cache'
import { updateCategorySchema, updateRateSchema, tariffPolicySchema } from '@/lib/validation/tariff'
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

export async function updateTariffPolicyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = fd.getAll('weekday').map((v) => Number(v))
  const parsed = tariffPolicySchema.safeParse({ specialWeekdays: raw })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await tariff.updateTariffPolicy(parsed.data.specialWeekdays) }
  catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/tarifas')
  revalidatePath('/quartos')
  return { ok: true }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return /forbidden/i.test(e.message) ? 'Sem permissão.' : e.message
  return 'Erro ao salvar.'
}

export async function addRegionalHolidayAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const date = String(fd.get('date') ?? '')
  const name = String(fd.get('name') ?? '')
  // <input type="date"> gives "YYYY-MM-DD"; keep only "MM-DD" (recurring).
  const monthDay = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5) : date
  try { await tariff.addRegionalHoliday(monthDay, name) }
  catch (e) { return { ok: false, error: errMsg(e) } }
  revalidatePath('/tarifas'); revalidatePath('/quartos')
  return { ok: true }
}

export async function removeRegionalHolidayAction(id: number, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  try { await tariff.removeRegionalHoliday(id) }
  catch (e) { return { ok: false, error: errMsg(e) } }
  revalidatePath('/tarifas'); revalidatePath('/quartos')
  return { ok: true }
}
