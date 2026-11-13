'use server'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@/generated/prisma/client'
import { productSchema, productUpdateSchema } from '@/lib/validation/product'
import { createProduct, updateProduct, ProductCodeTakenError } from '@/server/data/products'
import { stockMovementSchema } from '@/lib/validation/stock'
import { addStockMovement } from '@/server/data/stock'

export type ActionState = { ok: boolean; error?: string }

const productFields = (fd: FormData) => ({
  description: fd.get('description'), category: fd.get('category'), price: fd.get('price'), cost: fd.get('cost'),
  minStock: fd.get('minStock'), trackStock: fd.get('trackStock') === 'on' || fd.get('trackStock') === 'true',
})

function productErr(e: unknown): string {
  if (e instanceof ProductCodeTakenError) {
    return `Já existe o produto ${e.existing.code} · ${e.existing.description}. Para dar entrada no estoque dele, use "Reposição / ajuste de estoque".`
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'Já existe um produto com esse código.'
  if (e instanceof Error && /forbidden/i.test(e.message)) return 'Sem permissão.'
  return 'Erro ao salvar.'
}

export async function createProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = productSchema.safeParse({ ...productFields(fd), code: fd.get('code'), stockQty: fd.get('stockQty') })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await createProduct(parsed.data) } catch (e) { return { ok: false, error: productErr(e) } }
  revalidatePath('/produtos')
  return { ok: true }
}

export async function updateProductAction(code: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = productUpdateSchema.safeParse(productFields(fd))
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await updateProduct(code, parsed.data) } catch (e) { return { ok: false, error: productErr(e) } }
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
