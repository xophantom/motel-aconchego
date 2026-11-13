'use client'
import { useActionState } from 'react'
import { updateCashPolicyAction, type ActionState } from './actions'
import { MoneyInput } from '@/components/money-input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function CashPolicyForm({ value }: { value: number }) {
  const [state, action] = useActionState<ActionState, FormData>(updateCashPolicyAction, { ok: false })
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="expectedOpeningBalance">Fundo de caixa esperado (manhã)</Label><MoneyInput id="expectedOpeningBalance" name="expectedOpeningBalance" defaultValue={value} className="w-36" /></div>
      <Button size="sm">Salvar</Button>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">✓ ok</span>}
    </form>
  )
}
