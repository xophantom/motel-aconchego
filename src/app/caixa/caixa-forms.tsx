'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { openShiftAction, closeShiftAction, cashMovementAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? '…' : children}</Button>
}

export function OpenShiftForm() {
  const [state, action] = useActionState<ActionState, FormData>(openShiftAction, { ok: false })
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="openingBalance">Saldo inicial</Label><Input id="openingBalance" name="openingBalance" type="number" step="0.01" defaultValue="0" className="w-32" /></div>
      <Submit>Abrir caixa</Submit>
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  )
}

export function CloseShiftForm({ shiftId }: { shiftId: string }) {
  const action = closeShiftAction.bind(null, shiftId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  return (
    <form action={formAction} className="flex items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="closingBalance">Saldo final (conferência)</Label><Input id="closingBalance" name="closingBalance" type="number" step="0.01" defaultValue="0" className="w-32" /></div>
      <Submit>Fechar caixa</Submit>
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  )
}

export function MovementForm({ type, label, canUse }: { type: 'withdrawal' | 'supply' | 'correction'; label: string; canUse: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(cashMovementAction, { ok: false })
  if (!canUse) return null
  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="type" value={type} />
      <div className="grid gap-1"><Label htmlFor={`amt-${type}`}>{label} (R$)</Label><Input id={`amt-${type}`} name="amount" type="number" step="0.01" className="w-28" /></div>
      <Input name="description" placeholder="motivo" className="w-40" />
      <Submit>{label}</Submit>
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  )
}
