'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveLoyaltyPolicyAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

function Save() { const { pending } = useFormStatus(); return <Button size="sm" disabled={pending}>{pending ? '…' : 'Salvar'}</Button> }

export function LoyaltyPolicyForm({ everyVisits, discountPercent }: { everyVisits: number; discountPercent: number }) {
  const [state, action] = useActionState<ActionState, FormData>(saveLoyaltyPolicyAction, { ok: false })
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="everyVisits" className="text-xs">A cada (visitas pagas)</Label><Input id="everyVisits" name="everyVisits" type="number" min="1" max="100" defaultValue={everyVisits} className="w-28" required /></div>
      <div className="grid gap-1"><Label htmlFor="discountPercent" className="text-xs">Desconto na estadia (%)</Label><Input id="discountPercent" name="discountPercent" type="number" min="1" max="100" defaultValue={discountPercent} className="w-28" required /></div>
      <Save />
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">✓ salvo</span>}
    </form>
  )
}
