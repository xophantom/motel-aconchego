'use server'
import { revalidatePath } from 'next/cache'
import { checkInSchema } from '@/lib/validation/stay'
import { z } from 'zod'
import * as stays from '@/server/data/stays'
import { setRoomStatus } from '@/server/data/rooms'
import type { RoomStatus } from '@/generated/prisma/client'
import { addConsumptionSchema } from '@/lib/validation/product'
import { addConsumption, removeConsumption, walkinSale } from '@/server/data/consumption'
import { applyTierToRoom } from '@/server/data/loyalty'

export type ActionState = { ok: boolean; error?: string }

function mapErr(e: unknown): string {
  if (e instanceof Error) {
    if (/forbidden/i.test(e.message)) return 'Sem permissão.'
    if (/not free/i.test(e.message)) return 'Quarto não está livre.'
    if (/not occupied/i.test(e.message)) return 'Quarto não está ocupado.'
    if (/reason/i.test(e.message)) return 'Manutenção exige um motivo.'
    if (/no open stay/i.test(e.message)) return 'Sem cliente na estadia.'
    if (/benefit unavailable/i.test(e.message)) return 'Benefício indisponível.'
    if (/shift closed/i.test(e.message)) return 'Caixa fechado — só o gerente cancela.'
    if (/room reoccupied/i.test(e.message)) return 'Quarto já foi reocupado.'
    if (/no closed stay/i.test(e.message)) return 'Nada a cancelar.'
    if (/reason required/i.test(e.message)) return 'Informe o motivo.'
  }
  return 'Erro ao processar.'
}

export async function checkInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = checkInSchema.safeParse({
    roomNumber: fd.get('roomNumber'), day: fd.get('day'), chargeMode: fd.get('chargeMode') ?? 'period', guests: fd.get('guests'), prepaidAmount: fd.get('prepaidAmount') ?? 0, plate: fd.get('plate') ?? undefined,
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await stays.checkIn(parsed.data) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function applyBenefitAction(roomNumber: string, tierId: number): Promise<ActionState> {
  try { await applyTierToRoom(roomNumber, tierId) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function checkOutAction(roomNumber: string): Promise<ActionState> {
  try { await stays.checkOut(roomNumber) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

const cancelSchema = z.object({ reason: z.string().trim().min(1) })

export async function cancelCheckInAction(roomNumber: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = cancelSchema.safeParse({ reason: fd.get('reason') })
  if (!parsed.success) return { ok: false, error: 'Informe o motivo.' }
  try { await stays.cancelCheckIn(roomNumber, parsed.data.reason) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function cancelCheckOutAction(roomNumber: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = cancelSchema.safeParse({ reason: fd.get('reason') })
  if (!parsed.success) return { ok: false, error: 'Informe o motivo.' }
  try { await stays.cancelCheckOut(roomNumber, parsed.data.reason) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

const statusSchema = z.object({ number: z.string().min(1), status: z.enum(['free', 'cleaning', 'maintenance']), reason: z.string().optional() })

export async function setRoomStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = statusSchema.safeParse({ number: fd.get('number'), status: fd.get('status'), reason: fd.get('reason') ?? undefined })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await setRoomStatus(parsed.data.number, parsed.data.status as RoomStatus, parsed.data.reason) }
  catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function addConsumptionAction(stayId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = addConsumptionSchema.safeParse({ productCode: fd.get('productCode'), qty: fd.get('qty') })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await addConsumption({ stayId: BigInt(stayId), ...parsed.data }) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function removeConsumptionAction(id: string): Promise<ActionState> {
  try { await removeConsumption(BigInt(id)) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function walkinSaleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let items: unknown
  try { items = JSON.parse(String(fd.get('items') ?? '[]')) } catch { return { ok: false, error: 'Itens inválidos.' } }
  const itemsSchema = z.array(z.object({ productCode: z.string().min(1), qty: z.number().int().min(1) })).min(1)
  const valid = itemsSchema.safeParse(items)
  if (!valid.success) return { ok: false, error: 'Itens inválidos.' }
  try { await walkinSale({ items: valid.data }) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}
