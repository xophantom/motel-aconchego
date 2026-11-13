'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Prisma } from '@/generated/prisma/client'
import { CODENAME_MAX } from '@/lib/codename'
import { updateLoyaltyPolicy, searchCodenames, renameCodename, mergeCodenames, deleteCodename, type CodenameMatch } from '@/server/data/loyalty'

export type ActionState = { ok: boolean; error?: string }
const policySchema = z.object({ everyVisits: z.coerce.number().int().min(1).max(100), discountPercent: z.coerce.number().int().min(1).max(100) })

export async function saveLoyaltyPolicyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = policySchema.safeParse({ everyVisits: fd.get('everyVisits'), discountPercent: fd.get('discountPercent') })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await updateLoyaltyPolicy(parsed.data) } catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/fidelidade'); revalidatePath('/quartos')
  return { ok: true }
}

// The codename picker (check-in, room, merge) searches as reception types.
export async function searchCodenamesAction(q: string): Promise<CodenameMatch[]> {
  try { return await searchCodenames(String(q).slice(0, CODENAME_MAX)) } catch { return [] }
}

function codenameErr(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'Já existe um codinome com esse nome.'
  if (e instanceof Error) {
    if (/forbidden/i.test(e.message)) return 'Sem permissão.'
    if (/codename taken/i.test(e.message)) return 'Já existe um codinome com esse nome.'
    if (/codename required/i.test(e.message)) return 'Informe o codinome.'
    if (/same codename/i.test(e.message)) return 'Escolha outro codinome para juntar.'
    if (/codename not found/i.test(e.message)) return 'Codinome não encontrado.'
    if (/has visits/i.test(e.message)) return 'Codinome com visitas não pode ser excluído: junte com outro.'
  }
  return 'Erro ao salvar.'
}

export async function renameCodenameAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try { await renameCodename(BigInt(id), String(fd.get('codename') ?? '')) } catch (e) { return { ok: false, error: codenameErr(e) } }
  revalidatePath('/fidelidade'); revalidatePath('/quartos')
  return { ok: true }
}

// After merging, the duplicate no longer exists: show the codename that remains.
export async function mergeCodenameAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  let into
  try { into = await mergeCodenames(BigInt(id), String(fd.get('into') ?? '')) } catch (e) { return { ok: false, error: codenameErr(e) } }
  revalidatePath('/fidelidade'); revalidatePath('/quartos')
  redirect(`/fidelidade?c=${into.id}`)
}

export async function deleteCodenameAction(id: string): Promise<ActionState> {
  try { await deleteCodename(BigInt(id)) } catch (e) { return { ok: false, error: codenameErr(e) } }
  revalidatePath('/fidelidade')
  redirect('/fidelidade')
}
