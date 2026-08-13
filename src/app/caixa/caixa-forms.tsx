'use client'
import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { closeShiftAction, cashMovementAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? '…' : children}</Button>
}

// Retirada com método (dinheiro/cartão); suprimento/correção sem método.
export function MovementForm({ type, label, canUse }: { type: 'withdrawal' | 'supply' | 'correction'; label: string; canUse: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(cashMovementAction, { ok: false })
  if (!canUse) return null
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="type" value={type} />
      {type === 'withdrawal' && (
        <div className="grid gap-1"><Label htmlFor="method">Método</Label>
          <NativeSelect id="method" name="method" defaultValue="cash" className="w-32">
            <NativeSelectOption value="cash">Dinheiro</NativeSelectOption>
            <NativeSelectOption value="card">Cartão</NativeSelectOption>
          </NativeSelect>
        </div>
      )}
      <div className="grid gap-1"><Label htmlFor={`amt-${type}`}>{label} (R$)</Label><Input id={`amt-${type}`} name="amount" type="number" step="0.01" className="w-28" /></div>
      <Input name="description" placeholder="motivo" className="w-40" />
      <Submit>{label}</Submit>
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  )
}

// Fechar turno: retirada final dinheiro/cartão + senha → fecha, imprime e desloga.
export function CloseShiftForm({ shiftId, saldo }: { shiftId: string; saldo: number }) {
  const action = closeShiftAction.bind(null, shiftId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  useEffect(() => { if (state.ok) window.location.href = `/caixa/turno/${shiftId}?auto=1&logout=1` }, [state.ok, shiftId])
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1"><span className="text-xs uppercase tracking-wide text-muted-foreground">Saldo atual</span><span className="tnum font-display text-lg font-bold">R$ {saldo.toFixed(2)}</span></div>
      <div className="grid gap-1"><Label htmlFor="finalWithdrawCash">Retirada dinheiro</Label><Input id="finalWithdrawCash" name="finalWithdrawCash" type="number" step="0.01" defaultValue="0" className="w-28" /></div>
      <div className="grid gap-1"><Label htmlFor="finalWithdrawCard">Retirada cartão</Label><Input id="finalWithdrawCard" name="finalWithdrawCard" type="number" step="0.01" defaultValue="0" className="w-28" /></div>
      <div className="grid gap-1"><Label htmlFor="closePassword">Sua senha</Label><Input id="closePassword" name="password" type="password" autoComplete="current-password" className="w-40" /></div>
      <Submit>Fechar e sair (imprime)</Submit>
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  )
}
