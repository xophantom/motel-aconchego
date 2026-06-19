'use server'
import { revalidatePath } from 'next/cache'
import { productSchema } from '@/lib/validation/product'
import { upsertProduct } from '@/server/data/products'

export type ActionState = { ok: boolean; error?: string }

export async function saveProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = productSchema.safeParse({
    code: fd.get('code'), description: fd.get('description'), category: fd.get('category'),
    price: fd.get('price'), cost: fd.get('cost'), stockQty: fd.get('stockQty'),
    minStock: fd.get('minStock'), trackStock: fd.get('trackStock') === 'on' || fd.get('trackStock') === 'true',
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await upsertProduct(parsed.data) }
  catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/produtos')
  return { ok: true }
}
