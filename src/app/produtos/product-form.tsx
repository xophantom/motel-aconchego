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
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Field name="code" label="Código" w="w-20" />
      <Field name="description" label="Descrição" w="w-48" />
      <div className="grid gap-1">
        <Label htmlFor="category" className="text-xs">Categoria</Label>
        <NativeSelect id="category" name="category" defaultValue="minibar" className="h-8 w-28">
          <NativeSelectOption value="minibar">Frigobar</NativeSelectOption>
          <NativeSelectOption value="erotic">Erótico</NativeSelectOption>
          <NativeSelectOption value="kitchen">Cozinha</NativeSelectOption>
          <NativeSelectOption value="other">Outro</NativeSelectOption>
        </NativeSelect>
      </div>
      <Field name="price" label="Preço" type="number" w="w-24" />
      <Field name="cost" label="Custo" type="number" w="w-24" defaultValue="0" />
      <Field name="stockQty" label="Estoque" type="number" w="w-24" defaultValue="0" />
      <Field name="minStock" label="Mínimo" type="number" w="w-24" defaultValue="0" />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="trackStock" defaultChecked /> controla estoque</label>
      <Save />
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">salvo</span>}
    </form>
  )
}

function Field({ name, label, type = 'text', w, defaultValue }: { name: string; label: string; type?: string; w: string; defaultValue?: string }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type={type} step={type === 'number' ? '0.01' : undefined} defaultValue={defaultValue} className={`h-8 ${w}`} required={name === 'code' || name === 'description'} />
    </div>
  )
}
