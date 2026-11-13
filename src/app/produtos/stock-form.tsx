'use client'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { stockMovementAction } from './actions'
import type { ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MoneyInput } from '@/components/money-input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

function Submit() { const { pending } = useFormStatus(); return <Button size="sm" disabled={pending}>{pending ? '…' : 'Registrar'}</Button> }

type StockProduct = { code: string; description: string; stockQty: number; minStock: number; trackStock: boolean }
type FormState = ActionState & { n: number }

// Counts submissions so the form remounts after each one: React's automatic
// reset after an action puts the controlled product <select> back on its first
// option while the state (and the quantity shown) stays on the picked product.
async function submit(prev: FormState, fd: FormData): Promise<FormState> {
  return { ...(await stockMovementAction(prev, fd)), n: prev.n + 1 }
}

// Picking the product shows its current quantity first; what enters or leaves
// goes on the line below. The quantity comes from the page, so it refreshes
// after each registration (the action revalidates /produtos).
export function StockForm({ products }: { products: StockProduct[] }) {
  const [state, action] = useActionState<FormState, FormData>(submit, { ok: false, n: 0 })
  const [code, setCode] = useState('')
  const selected = products.find((p) => p.code === code)
  return (
    <form key={state.n} action={action} className="grid gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <Label htmlFor="productCode" className="text-xs">Produto</Label>
          <NativeSelect id="productCode" name="productCode" className="w-56" required value={code} onChange={(e) => setCode(e.target.value)}>
            <NativeSelectOption value="" disabled>Selecione…</NativeSelectOption>
            {products.map((p) => <NativeSelectOption key={p.code} value={p.code}>{p.code} · {p.description}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Quantidade atual</span>
          <div className="flex h-8 items-center gap-2">
            {!selected ? <span className="text-sm text-muted-foreground">—</span>
              : !selected.trackStock ? <span className="text-sm text-muted-foreground">não controla estoque</span>
              : <>
                  <span className="tnum font-display text-2xl font-bold">{selected.stockQty}</span>
                  {selected.stockQty <= selected.minStock && <Badge variant="destructive">baixo</Badge>}
                </>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
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
        <div className="grid gap-1"><Label htmlFor="unitCost" className="text-xs">Custo un. (opc.)</Label><MoneyInput id="unitCost" name="unitCost" optional className="w-32" /></div>
        <div className="grid gap-1 flex-1 min-w-40"><Label htmlFor="note" className="text-xs">Obs. (opc.)</Label><Input id="note" name="note" /></div>
        <Submit />
        {state.error && <span className="text-destructive text-xs">{state.error}</span>}
        {state.ok && <span className="text-xs text-[var(--room-free)]">✓ registrado</span>}
      </div>
    </form>
  )
}
