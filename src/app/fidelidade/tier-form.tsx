'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveTierAction, deleteTierAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

function Save() { const { pending } = useFormStatus(); return <Button size="sm" disabled={pending}>{pending ? '…' : 'Salvar'}</Button> }

export function TierForm() {
  const [state, action] = useActionState<ActionState, FormData>(saveTierAction, { ok: false })
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="minVisits" className="text-xs">Visitas</Label><Input id="minVisits" name="minVisits" type="number" min="1" className="w-24" required /></div>
      <div className="grid gap-1"><Label htmlFor="discountPercent" className="text-xs">Desconto %</Label><Input id="discountPercent" name="discountPercent" type="number" min="1" max="100" className="w-24" required /></div>
      <Save />
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-emerald-600">salvo</span>}
    </form>
  )
}

export function DeleteTier({ id }: { id: number }) {
  const [, action] = useActionState<ActionState, FormData>(async () => deleteTierAction(id), { ok: false })
  return <form action={action}><Button size="sm" variant="ghost" type="submit">remover</Button></form>
}
