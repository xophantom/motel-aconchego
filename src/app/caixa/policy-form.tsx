'use client'
import { useActionState } from 'react'
import { updateCashPolicyAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function CashPolicyForm({ value }: { value: number }) {
  const [state, action] = useActionState<ActionState, FormData>(updateCashPolicyAction, { ok: false })
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="expectedOpeningBalance">Fundo de caixa esperado (manhã)</Label><Input id="expectedOpeningBalance" name="expectedOpeningBalance" type="number" step="0.01" defaultValue={String(value)} className="w-32" /></div>
      <Button size="sm">Salvar</Button>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">✓ ok</span>}
    </form>
  )
}
