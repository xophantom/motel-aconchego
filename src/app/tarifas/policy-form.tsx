'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { updateTariffPolicyAction, type ActionState } from './actions'
import { Button } from '@/components/ui/button'

const WEEKDAYS: [number, string][] = [[0, 'Dom'], [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb']]

function Save() {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>
}

export function TariffPolicyForm({ specialWeekdays, year, holidays }: { specialWeekdays: number[]; year: number; holidays: { date: string; name: string }[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateTariffPolicyAction, { ok: false })
  const set = new Set(specialWeekdays)
  return (
    <div className="grid gap-3">
      <form action={formAction} className="grid gap-2">
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map(([n, label]) => (
            <label key={n} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="weekday" value={n} defaultChecked={set.has(n)} className="size-4" />
              {label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Save />
          {state.error && <span className="text-destructive text-xs">{state.error}</span>}
          {state.ok && <span className="text-xs text-[var(--room-free)]">✓ ok</span>}
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">Feriados nacionais {year}:</span>{' '}
        {holidays.map((h) => `${h.date.split('-').reverse().join('/')} ${h.name}`).join(' · ')}
      </p>
    </div>
  )
}
