'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { updateCategoryAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

type Cat = { billing: 'motel' | 'hotel'; minPeriodMin: number; maxPeriodMin: number; includedGuests: number }

function Save() {
  const { pending } = useFormStatus()
  return <Button size="sm" variant="outline" disabled={pending}>{pending ? 'Salvando…' : 'Salvar categoria'}</Button>
}

export function CategoryForm({ categoryId, category }: { categoryId: number; category: Cat }) {
  const action = updateCategoryAction.bind(null, categoryId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-b pb-3">
      <div className="grid gap-1">
        <Label htmlFor={`billing-${categoryId}`} className="text-xs">Cobrança</Label>
        <NativeSelect id={`billing-${categoryId}`} name="billing" defaultValue={category.billing} className="h-8 w-28">
          <NativeSelectOption value="motel">Motel</NativeSelectOption>
          <NativeSelectOption value="hotel">Hotel (diária)</NativeSelectOption>
        </NativeSelect>
      </div>
      <Num name="minPeriodMin" label="Mín (min)" defaultValue={category.minPeriodMin} />
      <Num name="maxPeriodMin" label="Máx (min)" defaultValue={category.maxPeriodMin} />
      <Num name="includedGuests" label="Pessoas inc." defaultValue={category.includedGuests} />
      <Save />
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">ok</span>}
    </form>
  )
}

function Num({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type="number" min="0" defaultValue={String(defaultValue)} className="w-24 h-8" />
    </div>
  )
}
