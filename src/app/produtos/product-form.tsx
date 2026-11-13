'use client'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createProductAction, updateProductAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { MoneyInput } from '@/components/money-input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export type EditableProduct = { code: string; description: string; category: string; price: number; cost: number; minStock: number; trackStock: boolean }

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return <Button disabled={pending}>{pending ? 'Salvando…' : label}</Button>
}

type Values = Record<string, string>
type FormState = ActionState & { n: number; values?: Values }

// React resets a form after its action runs, even when it returns an error.
// On error, keep what was typed: the form remounts (key = n) with it as defaults.
function useProductForm(run: (prev: ActionState, fd: FormData) => Promise<ActionState>, onDone: () => void) {
  return useActionState<FormState, FormData>(async (prev, fd) => {
    const res = await run(prev, fd)
    if (res.ok) onDone()
    const values = res.ok ? undefined : Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))
    return { ...res, n: prev.n + 1, values }
  }, { ok: false, n: 0 })
}

// Creating and editing are separate on purpose: a single "new/edit" form used
// to overwrite a product whose code was retyped, and was mistaken for restock.
export function NewProductDialog() {
  const [open, setOpen] = useState(false)
  const [state, action] = useProductForm(createProductAction, () => setOpen(false))
  const v = state.values
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Novo produto</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo produto</DialogTitle>
          <DialogDescription>Cadastra um produto que ainda não existe. Para dar entrada no estoque de um produto da lista, use “Reposição / ajuste de estoque”.</DialogDescription>
        </DialogHeader>
        <form key={state.n} action={action} className="grid gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Field name="code" label="Código (até 3 letras)" required className="uppercase" maxLength={3} defaultValue={v?.code} />
            <Field name="description" label="Descrição" required wrapClassName="col-span-2" defaultValue={v?.description} />
          </div>
          <ProductFields values={v} />
          <Field name="stockQty" label="Estoque inicial" type="number" step="1" min="0" defaultValue={v?.stockQty ?? '0'} wrapClassName="max-w-40" />
          <Save label="Criar produto" />
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditProductDialog({ product }: { product: EditableProduct }) {
  const [open, setOpen] = useState(false)
  const [state, action] = useProductForm(updateProductAction.bind(null, product.code), () => setOpen(false))
  const v = state.values
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost">Editar</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {product.code}</DialogTitle>
          <DialogDescription>O estoque não muda aqui: use “Reposição / ajuste de estoque”, que guarda o histórico.</DialogDescription>
        </DialogHeader>
        <form key={state.n} action={action} className="grid gap-3">
          <Field name="description" label="Descrição" required defaultValue={v?.description ?? product.description} />
          <ProductFields product={product} values={v} />
          <Save label="Salvar" />
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}

// `values` (what was typed before an error) wins over the stored product.
function ProductFields({ product, values: v }: { product?: EditableProduct; values?: Values }) {
  return (
    <>
      {/* two columns: money values need room to show "R$ 1.234,50" whole */}
      <div className="grid grid-cols-2 gap-3">
        {/* a new product starts without a price (it must be typed); an edit starts at the stored one */}
        <MoneyField name="price" label="Preço" required defaultValue={v?.price ?? product?.price} optional={!product && !v?.price} />
        <MoneyField name="cost" label="Custo" defaultValue={v?.cost ?? product?.cost ?? 0} />
        <div className="grid gap-1">
          <Label htmlFor="category" className="text-xs">Categoria</Label>
          <NativeSelect id="category" name="category" defaultValue={v?.category ?? product?.category ?? 'minibar'}>
            <NativeSelectOption value="minibar">Frigobar</NativeSelectOption>
            <NativeSelectOption value="erotic">Erótico</NativeSelectOption>
            <NativeSelectOption value="kitchen">Cozinha</NativeSelectOption>
            <NativeSelectOption value="other">Outro</NativeSelectOption>
          </NativeSelect>
        </div>
        <Field name="minStock" label="Mínimo" type="number" step="1" min="0" defaultValue={v?.minStock ?? String(product?.minStock ?? 0)} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="trackStock" defaultChecked={v ? v.trackStock === 'on' : (product?.trackStock ?? true)} className="size-4 accent-primary" /> Controla estoque</label>
    </>
  )
}

function MoneyField({ name, label, ...money }: { name: string; label: string } & Omit<React.ComponentProps<typeof MoneyInput>, 'name' | 'id'>) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <MoneyInput id={name} name={name} {...money} />
    </div>
  )
}

function Field({ name, label, wrapClassName, className, ...input }: { name: string; label: string; wrapClassName?: string } & React.ComponentProps<'input'>) {
  return (
    <div className={`grid gap-1 ${wrapClassName ?? ''}`}>
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} className={`tnum ${className ?? ''}`} {...input} />
    </div>
  )
}
