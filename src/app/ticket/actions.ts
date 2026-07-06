'use server'
import { getStayForTicket } from '@/server/data/stays'
import { logEvent } from '@/server/audit'

export type ActionState = { ok: boolean; error?: string }

export async function logTicketReprintAction(stayId: string): Promise<ActionState> {
  let data
  try { data = await getStayForTicket(BigInt(stayId)) }
  catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro.' } }
  if (!data) return { ok: false, error: 'Estadia não encontrada.' }
  await logEvent({ type: 'ticket.reprint', description: `Reimpressão ticket quarto ${data.roomNumber ?? '—'} · estadia #${stayId}`, entity: 'stay', entityId: stayId, roomNumber: data.roomNumber })
  return { ok: true }
}
