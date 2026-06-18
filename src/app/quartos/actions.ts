'use server'
import { revalidatePath } from 'next/cache'
import { checkInSchema } from '@/lib/validation/stay'
import { z } from 'zod'
import * as stays from '@/server/data/stays'
import { setRoomStatus } from '@/server/data/rooms'
import type { RoomStatus } from '@/generated/prisma/client'

export type ActionState = { ok: boolean; error?: string }

function mapErr(e: unknown): string {
  if (e instanceof Error) {
    if (/forbidden/i.test(e.message)) return 'Sem permissão.'
    if (/not free/i.test(e.message)) return 'Quarto não está livre.'
    if (/not occupied/i.test(e.message)) return 'Quarto não está ocupado.'
    if (/reason/i.test(e.message)) return 'Manutenção exige um motivo.'
  }
  return 'Erro ao processar.'
}

export async function checkInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = checkInSchema.safeParse({
    roomNumber: fd.get('roomNumber'), day: fd.get('day'), guests: fd.get('guests'), prepaidAmount: fd.get('prepaidAmount') ?? 0,
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await stays.checkIn(parsed.data) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function checkOutAction(roomNumber: string): Promise<ActionState> {
  try { await stays.checkOut(roomNumber) } catch (e) { return { ok: false, error: mapErr(e) } }
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
