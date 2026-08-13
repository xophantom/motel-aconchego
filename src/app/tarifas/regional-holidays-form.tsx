'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { addRegionalHolidayAction, removeRegionalHolidayAction, type ActionState } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ptDate = (md: string) => md.split('-').reverse().join('/')

function AddBtn() {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? '…' : 'Adicionar'}</Button>
}

export function RegionalHolidaysForm({ holidays }: { holidays: { id: number; monthDay: string; name: string }[] }) {
  const [state, addAction] = useActionState<ActionState, FormData>(addRegionalHolidayAction, { ok: false })
  return (
    <div className="grid gap-3">
      <ul className="grid gap-1.5">
        {holidays.length === 0 && <li className="text-xs text-muted-foreground">Nenhum feriado regional cadastrado.</li>}
        {holidays.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
            <span><span className="tnum font-medium">{ptDate(h.monthDay)}</span> · {h.name}</span>
            <RemoveHoliday id={h.id} />
          </li>
        ))}
      </ul>
      <form action={addAction} className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div className="grid gap-1"><Label htmlFor="rh-date" className="text-xs">Data</Label><Input id="rh-date" name="date" type="date" className="w-40" required /></div>
        <div className="grid gap-1"><Label htmlFor="rh-name" className="text-xs">Nome</Label><Input id="rh-name" name="name" placeholder="Aniversário da cidade" className="w-56" required /></div>
        <AddBtn />
        {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      </form>
      <p className="text-[11px] text-muted-foreground">Recorrem todo ano (dia/mês) e valem como feriado — inclusive na véspera. O ano escolhido é ignorado.</p>
    </div>
  )
}

function RemoveHoliday({ id }: { id: number }) {
  const action = removeRegionalHolidayAction.bind(null, id)
  const [, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  return (
    <form action={formAction}>
      <Button size="icon" variant="ghost" type="submit" className="size-6 text-muted-foreground hover:text-destructive" aria-label="Remover">×</Button>
    </form>
  )
}
