'use server'
import { revalidatePath } from 'next/cache'
import { productSchema } from '@/lib/validation/product'
import { upsertProduct } from '@/server/data/products'
import { stockMovementSchema } from '@/lib/validation/stock'
import { addStockMovement } from '@/server/data/stock'

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

export async function stockMovementAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = stockMovementSchema.safeParse({
    productCode: fd.get('productCode'), qty: fd.get('qty'), reason: fd.get('reason'),
    unitCost: fd.get('unitCost') || null, note: fd.get('note') || null,
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await addStockMovement(parsed.data) }
  catch (e) {
    if (e instanceof Error) {
      if (/insufficient stock/i.test(e.message)) return { ok: false, error: 'Estoque insuficiente pro ajuste.' }
      if (/forbidden/i.test(e.message)) return { ok: false, error: 'Sem permissão.' }
    }
    return { ok: false, error: 'Erro ao registrar.' }
  }
  revalidatePath('/produtos')
  return { ok: true }
}
