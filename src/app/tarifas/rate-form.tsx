'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { updateRateAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

type Rate = { day: 'normal' | 'special'; basePrice: string; excessPrice30m: string; overnightPrice: string; extraGuestPrice: string }

function Save() {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>
}

export function RateForm({ categoryId, rate }: { categoryId: number; rate: Rate }) {
  const action = updateRateAction.bind(null, categoryId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  const label = rate.day === 'normal' ? 'Semana' : 'Fim de semana'
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="day" value={rate.day} />
      <div className="text-sm font-medium w-28">{label}</div>
      <Field name="basePrice" label="Base" defaultValue={rate.basePrice} />
      <Field name="excessPrice30m" label="Exc./30m" defaultValue={rate.excessPrice30m} />
      <Field name="overnightPrice" label="Pernoite" defaultValue={rate.overnightPrice} />
      <Field name="extraGuestPrice" label="Pessoa+" defaultValue={rate.extraGuestPrice} />
      <Save />
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">✓ ok</span>}
    </form>
  )
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type="number" step="0.01" defaultValue={defaultValue} className="w-24 h-8" />
    </div>
  )
}
