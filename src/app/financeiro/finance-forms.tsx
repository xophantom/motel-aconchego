'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createEntryAction, deleteEntryAction, saveCostCenterAction, deleteCostCenterAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? '…' : children}</Button>
}

export function EntryForm({ centers }: { centers: { code: string; description: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createEntryAction, { ok: false })
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="entryDate" className="text-xs">Data</Label><Input id="entryDate" name="entryDate" type="date" required /></div>
      <div className="grid gap-1">
        <Label htmlFor="kind" className="text-xs">Tipo</Label>
        <NativeSelect id="kind" name="kind" defaultValue="expense" className="w-32">
          <NativeSelectOption value="expense">Despesa</NativeSelectOption>
          <NativeSelectOption value="income">Receita</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid gap-1"><Label htmlFor="amount" className="text-xs">Valor</Label><Input id="amount" name="amount" type="number" step="0.01" min="0.01" className="w-28" required /></div>
      <div className="grid gap-1">
        <Label htmlFor="costCenter" className="text-xs">Centro</Label>
        <NativeSelect id="costCenter" name="costCenter" defaultValue="" className="w-40">
          <NativeSelectOption value="">— sem centro —</NativeSelectOption>
          {centers.map((c) => <NativeSelectOption key={c.code} value={c.code}>{c.code} · {c.description}</NativeSelectOption>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1 flex-1 min-w-40"><Label htmlFor="description" className="text-xs">Descrição</Label><Input id="description" name="description" required /></div>
      <Submit>Lançar</Submit>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">✓ lançado</span>}
    </form>
  )
}

export function EntryRowActions({ id }: { id: string }) {
  const [, action] = useActionState<ActionState, FormData>(async () => deleteEntryAction(id), { ok: false })
  return <form action={action}><Button size="sm" variant="ghost" type="submit">excluir</Button></form>
}

export function CostCenterForm() {
  const [state, action] = useActionState<ActionState, FormData>(saveCostCenterAction, { ok: false })
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="cc-code" className="text-xs">Código</Label><Input id="cc-code" name="code" maxLength={20} className="w-28" required /></div>
      <div className="grid gap-1 flex-1"><Label htmlFor="cc-desc" className="text-xs">Descrição</Label><Input id="cc-desc" name="description" required /></div>
      <Submit>Salvar</Submit>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">✓ salvo</span>}
    </form>
  )
}

export function DeleteCostCenter({ code }: { code: string }) {
  const [state, action] = useActionState<ActionState, FormData>(async () => deleteCostCenterAction(code), { ok: false })
  return (
    <form action={action} className="flex items-center gap-2">
      <Button size="sm" variant="ghost" type="submit">remover</Button>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
    </form>
  )
}
