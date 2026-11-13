'use client'
import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { closeShiftAction, cashMovementAction, type ActionState, type CloseShiftState } from './actions'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/money-input'
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
      <div className="grid gap-1"><Label htmlFor={`amt-${type}`}>{label}</Label><MoneyInput id={`amt-${type}`} name="amount" optional required allowNegative={type === 'correction'} className={type === 'correction' ? 'w-40' : 'w-32'} /></div>
      <Input name="description" placeholder="motivo" className="w-40" />
      <Submit>{label}</Submit>
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  )
}

// Fechar turno: retirada final dinheiro/cartão + senha → fecha, imprime e desloga.
export function CloseShiftForm({ shiftId, saldo }: { shiftId: string; saldo: number }) {
  const action = closeShiftAction.bind(null, shiftId)
  const [state, formAction] = useActionState<CloseShiftState, FormData>(action, { ok: false })
  // by the id the action closed, not the prop: by now it already points to the next shift
  useEffect(() => { if (state.closedShiftId) window.location.href = `/caixa/turno/${state.closedShiftId}?auto=1&logout=1` }, [state.closedShiftId])
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1"><span className="text-xs uppercase tracking-wide text-muted-foreground">Saldo atual</span><span className="tnum font-display text-lg font-bold">R$ {saldo.toFixed(2)}</span></div>
      <div className="grid gap-1"><Label htmlFor="finalWithdrawCash">Retirada dinheiro</Label><MoneyInput id="finalWithdrawCash" name="finalWithdrawCash" className="w-32" /></div>
      <div className="grid gap-1"><Label htmlFor="finalWithdrawCard">Retirada cartão</Label><MoneyInput id="finalWithdrawCard" name="finalWithdrawCard" className="w-32" /></div>
      <div className="grid gap-1"><Label htmlFor="closePassword">Sua senha</Label><Input id="closePassword" name="password" type="password" autoComplete="current-password" className="w-40" /></div>
      <Submit>Fechar e sair (imprime)</Submit>
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  )
}
