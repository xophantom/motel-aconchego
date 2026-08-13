'use client'
import { useActionState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { closeShiftAction, type ActionState } from '@/app/caixa/actions'

const money = (n: number) => `R$ ${n.toFixed(2)}`

export function CloseTurnoButton({ shiftId, saldo, retiradoDinheiro, retiradoCartao }: { shiftId: string; saldo: number; retiradoDinheiro: number; retiradoCartao: number }) {
  const action = closeShiftAction.bind(null, shiftId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  useEffect(() => { if (state.ok) window.location.href = `/caixa/turno/${shiftId}?auto=1&logout=1` }, [state.ok, shiftId])
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Fechar turno</Button></DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Fechar turno</DialogTitle></DialogHeader>
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Saldo atual no caixa</span>
            <span className="tnum font-display text-xl font-bold">{money(saldo)}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Já retirado — dinheiro {money(retiradoDinheiro)} · cartão {money(retiradoCartao)}</p>
        </div>
        <form action={formAction} className="grid gap-3">
          <div className="grid gap-1"><Label htmlFor="fwc">Retirada em dinheiro (R$)</Label><Input id="fwc" name="finalWithdrawCash" type="number" step="0.01" defaultValue="0" /></div>
          <div className="grid gap-1"><Label htmlFor="fwd">Retirada em cartão (R$)</Label><Input id="fwd" name="finalWithdrawCard" type="number" step="0.01" defaultValue="0" /></div>
          <div className="grid gap-1"><Label htmlFor="fwpwd">Sua senha</Label><Input id="fwpwd" name="password" type="password" autoComplete="current-password" placeholder="senha do operador" /></div>
          <Button className="w-full">Confirmar, fechar e sair</Button>
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}
