'use client'
import { useActionState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { closeShiftAction, type ActionState } from '@/app/caixa/actions'

export function CloseTurnoButton({ shiftId }: { shiftId: string }) {
  const action = closeShiftAction.bind(null, shiftId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  useEffect(() => { if (state.ok) window.location.href = `/caixa/turno/${shiftId}?auto=1` }, [state.ok, shiftId])
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Fechar turno</Button></DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Fechar turno</DialogTitle></DialogHeader>
        <form action={formAction} className="grid gap-3">
          <div className="grid gap-1"><Label htmlFor="fwc">Retirada em dinheiro (R$)</Label><Input id="fwc" name="finalWithdrawCash" type="number" step="0.01" defaultValue="0" /></div>
          <div className="grid gap-1"><Label htmlFor="fwd">Retirada em cartão (R$)</Label><Input id="fwd" name="finalWithdrawCard" type="number" step="0.01" defaultValue="0" /></div>
          <Button className="w-full">Confirmar e fechar (imprime)</Button>
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}
