'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveProductAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

function Save() {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>
}

export function ProductForm() {
  const [state, action] = useActionState<ActionState, FormData>(saveProductAction, { ok: false })
  return (
    <form action={action} className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <Field name="code" label="Código" required />
        <Field name="description" label="Descrição" className="col-span-2" required />
        <div className="grid gap-1">
          <Label htmlFor="category" className="text-xs">Categoria</Label>
          <NativeSelect id="category" name="category" defaultValue="minibar">
            <NativeSelectOption value="minibar">Frigobar</NativeSelectOption>
            <NativeSelectOption value="erotic">Erótico</NativeSelectOption>
            <NativeSelectOption value="kitchen">Cozinha</NativeSelectOption>
            <NativeSelectOption value="other">Outro</NativeSelectOption>
          </NativeSelect>
        </div>
        <Field name="price" label="Preço" type="number" />
        <Field name="cost" label="Custo" type="number" defaultValue="0" />
        <Field name="stockQty" label="Estoque" type="number" defaultValue="0" />
        <Field name="minStock" label="Mínimo" type="number" defaultValue="0" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="trackStock" defaultChecked className="size-4 accent-primary" /> Controla estoque</label>
        <Save />
        {state.error && <span className="text-destructive text-xs">{state.error}</span>}
        {state.ok && <span className="text-xs text-[var(--room-free)]">✓ salvo</span>}
      </div>
    </form>
  )
}

function Field({ name, label, type = 'text', defaultValue, required, className }: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean; className?: string }) {
  return (
    <div className={`grid gap-1 ${className ?? ''}`}>
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type={type} step={type === 'number' ? '0.01' : undefined} defaultValue={defaultValue} required={required} className="tnum" />
    </div>
  )
}
