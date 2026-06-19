'use client'
import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { checkInAction, checkOutAction, setRoomStatusAction, addConsumptionAction, removeConsumptionAction, walkinSaleAction, type ActionState } from './actions'

type Product = { code: string; description: string; price: number }
type ConsItem = { id: string; description: string; qty: number; unitPrice: number }
type Room = {
  number: string
  status: 'free' | 'occupied' | 'cleaning' | 'maintenance'
  maintenanceReason: string | null
  category: { code: string; description: string } | null
  currentStay: { id: string; checkIn: string; guests: number; day: 'normal' | 'special' } | null
  consumption: ConsItem[]
}

const STATUS_LABEL: Record<Room['status'], string> = { free: 'LIVRE', occupied: 'OCUPADO', cleaning: 'LIMPEZA', maintenance: 'MANUT.' }
const STATUS_CLASS: Record<Room['status'], string> = {
  free: 'bg-emerald-600 text-white', occupied: 'bg-red-600 text-white', cleaning: 'bg-amber-500 text-black', maintenance: 'bg-stone-500 text-white',
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Button disabled={pending}>{pending ? '…' : children}</Button>
}

export function RoomGrid({ rooms, products }: { rooms: Room[]; products: Product[] }) {
  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><VendaAvulsa products={products} /></div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {rooms.map((r) => <RoomCard key={r.number} room={r} products={products} />)}
      </div>
    </div>
  )
}

function RoomCard({ room, products }: { room: Room; products: Product[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className={`rounded-lg p-3 text-left ${STATUS_CLASS[room.status]}`}>
          <div className="text-lg font-bold">{room.number}</div>
          <div className="text-xs">{STATUS_LABEL[room.status]}</div>
          {room.category && <div className="text-[10px] opacity-90">{room.category.code}</div>}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Quarto {room.number} — {STATUS_LABEL[room.status]}</DialogTitle></DialogHeader>
        {room.status === 'free' && <FreeActions room={room} onDone={() => setOpen(false)} />}
        {room.status === 'occupied' && <OccupiedPanel room={room} products={products} onDone={() => setOpen(false)} />}
        {room.status === 'cleaning' && <SimpleStatus number={room.number} status="free" label="Liberar (limpo)" onDone={() => setOpen(false)} />}
        {room.status === 'maintenance' && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">Motivo: {room.maintenanceReason}</p>
            <SimpleStatus number={room.number} status="free" label="Voltar de manutenção" onDone={() => setOpen(false)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FreeActions({ room, onDone }: { room: Room; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(checkInAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-3">
        <input type="hidden" name="roomNumber" value={room.number} />
        <div className="grid gap-1">
          <Label htmlFor="day">Tabela</Label>
          <NativeSelect id="day" name="day" defaultValue="normal">
            <NativeSelectOption value="normal">Semana (normal)</NativeSelectOption>
            <NativeSelectOption value="special">Fim de semana (especial)</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="grid gap-1"><Label htmlFor="guests">Hóspedes</Label><Input id="guests" name="guests" type="number" min="1" defaultValue="2" /></div>
        <div className="grid gap-1"><Label htmlFor="prepaidAmount">Antecipado (R$)</Label><Input id="prepaidAmount" name="prepaidAmount" type="number" step="0.01" defaultValue="0" /></div>
        <Submit>Fazer entrada</Submit>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      </form>
      <MaintenanceForm number={room.number} onDone={onDone} />
    </div>
  )
}

function OccupiedPanel({ room, products, onDone }: { room: Room; products: Product[]; onDone: () => void }) {
  const stay = room.currentStay!
  const consumoTotal = room.consumption.reduce((a, c) => a + c.unitPrice * c.qty, 0)
  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Consumo (R$ {consumoTotal.toFixed(2)})</h3>
        {room.consumption.map((c) => (
          <div key={c.id} className="flex items-center justify-between text-sm">
            <span>{c.qty}× {c.description} — R$ {(c.unitPrice * c.qty).toFixed(2)}</span>
            <RemoveItem id={c.id} />
          </div>
        ))}
        <AddConsumption stayId={stay.id} products={products} />
      </section>
      <CheckOut roomNumber={room.number} stay={stay} onDone={onDone} />
    </div>
  )
}

function AddConsumption({ stayId, products }: { stayId: string; products: Product[] }) {
  const action = addConsumptionAction.bind(null, stayId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  return (
    <form action={formAction} className="flex items-end gap-2 border-t pt-2">
      <div className="grid gap-1">
        <Label htmlFor="productCode" className="text-xs">Produto</Label>
        <NativeSelect id="productCode" name="productCode" className="h-8 w-40" defaultValue={products[0]?.code}>
          {products.map((p) => <NativeSelectOption key={p.code} value={p.code}>{p.description}</NativeSelectOption>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1"><Label htmlFor="qty" className="text-xs">Qtd</Label><Input id="qty" name="qty" type="number" min="1" defaultValue="1" className="h-8 w-16" /></div>
      <Button size="sm" variant="outline" type="submit">Lançar</Button>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
    </form>
  )
}

function RemoveItem({ id }: { id: string }) {
  const [, action] = useActionState<ActionState, FormData>(async () => removeConsumptionAction(id), { ok: false })
  return <form action={action}><Button size="sm" variant="ghost" type="submit">remover</Button></form>
}

function CheckOut({ roomNumber, stay, onDone }: { roomNumber: string; stay: NonNullable<Room['currentStay']>; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])
  const [state, formAction] = useActionState<ActionState, FormData>(async () => checkOutAction(roomNumber), { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  const elapsedMin = Math.max(0, Math.round((now - new Date(stay.checkIn).getTime()) / 60000))
  return (
    <div className="grid gap-2 border-t pt-3">
      <p className="text-sm">Decorrido: <strong>{Math.floor(elapsedMin / 60)}h{String(elapsedMin % 60).padStart(2, '0')}m</strong></p>
      <form action={formAction}><Submit>Confirmar saída</Submit>{state.error && <p className="text-destructive text-sm">{state.error}</p>}</form>
    </div>
  )
}

function SimpleStatus({ number, status, label, onDone }: { number: string; status: 'free' | 'cleaning'; label: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(setRoomStatusAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <form action={action}>
      <input type="hidden" name="number" value={number} /><input type="hidden" name="status" value={status} />
      <Submit>{label}</Submit>{state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}

function MaintenanceForm({ number, onDone }: { number: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(setRoomStatusAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <form action={action} className="grid gap-2 border-t pt-3">
      <input type="hidden" name="number" value={number} /><input type="hidden" name="status" value="maintenance" />
      <Label htmlFor="reason" className="text-xs">Pôr em manutenção (motivo)</Label>
      <div className="flex gap-2"><Input id="reason" name="reason" placeholder="motivo" /><Button variant="outline" type="submit">Manutenção</Button></div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}

function VendaAvulsa({ products }: { products: Product[] }) {
  const [open, setOpen] = useState(false)
  const [cart, setCart] = useState<{ productCode: string; qty: number }[]>([])
  const [state, action] = useActionState<ActionState, FormData>(walkinSaleAction, { ok: false })
  useEffect(() => { if (state.ok) { setCart([]); setOpen(false) } }, [state.ok])
  const total = cart.reduce((a, i) => a + (products.find((p) => p.code === i.productCode)?.price ?? 0) * i.qty, 0)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Venda avulsa</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Venda avulsa (Pedido Casa)</DialogTitle></DialogHeader>
        <AddToCart products={products} onAdd={(productCode, qty) => setCart((c) => [...c, { productCode, qty }])} />
        <ul className="text-sm">
          {cart.map((i, idx) => <li key={idx}>{i.qty}× {products.find((p) => p.code === i.productCode)?.description}</li>)}
        </ul>
        <p className="text-sm font-medium">Total: R$ {total.toFixed(2)}</p>
        <form action={action}>
          <input type="hidden" name="items" value={JSON.stringify(cart)} />
          <Submit>Registrar venda</Submit>
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddToCart({ products, onAdd }: { products: Product[]; onAdd: (code: string, qty: number) => void }) {
  const [code, setCode] = useState(products[0]?.code ?? '')
  const [qty, setQty] = useState(1)
  return (
    <div className="flex items-end gap-2">
      <NativeSelect value={code} onChange={(e) => setCode(e.target.value)} className="h-8 w-40">
        {products.map((p) => <NativeSelectOption key={p.code} value={p.code}>{p.description}</NativeSelectOption>)}
      </NativeSelect>
      <Input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-8 w-16" />
      <Button type="button" size="sm" variant="outline" onClick={() => code && onAdd(code, qty)}>Adicionar</Button>
    </div>
  )
}
