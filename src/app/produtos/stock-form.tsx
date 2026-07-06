'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { stockMovementAction } from './actions'
import type { ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

function Submit() { const { pending } = useFormStatus(); return <Button size="sm" disabled={pending}>{pending ? '…' : 'Registrar'}</Button> }

export function StockForm({ products }: { products: { code: string; description: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(stockMovementAction, { ok: false })
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <Label htmlFor="productCode" className="text-xs">Produto</Label>
        <NativeSelect id="productCode" name="productCode" className="w-44" required defaultValue="">
          <NativeSelectOption value="" disabled>Selecione…</NativeSelectOption>
          {products.map((p) => <NativeSelectOption key={p.code} value={p.code}>{p.code} · {p.description}</NativeSelectOption>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1"><Label htmlFor="qty" className="text-xs">Qtd (+ entra / − ajusta)</Label><Input id="qty" name="qty" type="number" step="1" className="w-32" required /></div>
      <div className="grid gap-1">
        <Label htmlFor="reason" className="text-xs">Motivo</Label>
        <NativeSelect id="reason" name="reason" className="w-36" defaultValue="restock">
          <NativeSelectOption value="restock">Reposição</NativeSelectOption>
          <NativeSelectOption value="loss">Perda</NativeSelectOption>
          <NativeSelectOption value="inventory">Inventário</NativeSelectOption>
          <NativeSelectOption value="correction">Correção</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid gap-1"><Label htmlFor="unitCost" className="text-xs">Custo un. (opc.)</Label><Input id="unitCost" name="unitCost" type="number" step="0.01" min="0" className="w-28" /></div>
      <div className="grid gap-1 flex-1 min-w-40"><Label htmlFor="note" className="text-xs">Obs. (opc.)</Label><Input id="note" name="note" /></div>
      <Submit />
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">✓ registrado</span>}
    </form>
  )
}
