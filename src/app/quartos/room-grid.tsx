'use client'
import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { computeStayAmount } from '@/lib/billing'
import { checkInAction, checkOutAction, setRoomStatusAction, addConsumptionAction, removeConsumptionAction, walkinSaleAction, type ActionState } from './actions'

type Product = { code: string; description: string; price: number }
type ConsItem = { id: string; description: string; qty: number; unitPrice: number }
type Pricing = { billing: 'motel' | 'hotel'; minPeriodMin: number; maxPeriodMin: number; includedGuests: number; basePrice: number; excessPrice30m: number; overnightPrice: number; extraGuestPrice: number }
type Stay = { id: string; checkIn: string; guests: number; day: 'normal' | 'special'; chargeMode: 'period' | 'overnight'; prepaid: number; consumptionAmount: number }
type Room = {
  number: string
  status: 'free' | 'occupied' | 'cleaning' | 'maintenance'
  maintenanceReason: string | null
  category: { code: string; description: string } | null
  currentStay: Stay | null
  pricing: Pricing | null
  consumption: ConsItem[]
}

const STATUS_LABEL: Record<Room['status'], string> = { free: 'Livre', occupied: 'Ocupado', cleaning: 'Limpeza', maintenance: 'Manutenção' }
const STATUS_BG: Record<Room['status'], string> = {
  free: 'bg-emerald-600 text-white', occupied: 'bg-red-600 text-white', cleaning: 'bg-amber-500 text-black', maintenance: 'bg-stone-500 text-white',
}
const money = (n: number) => `R$ ${n.toFixed(2)}`
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [active])
  return now
}
function elapsedLabel(checkIn: string, now: number) {
  const min = Math.max(0, Math.round((now - new Date(checkIn).getTime()) / 60000))
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}
function estimateStay(stay: Stay, pricing: Pricing, now: number): number {
  return computeStayAmount({
    billing: pricing.billing, chargeMode: stay.chargeMode, minPeriodMin: pricing.minPeriodMin, maxPeriodMin: pricing.maxPeriodMin,
    includedGuests: pricing.includedGuests, rate: { basePrice: pricing.basePrice, excessPrice30m: pricing.excessPrice30m, overnightPrice: pricing.overnightPrice, extraGuestPrice: pricing.extraGuestPrice },
    checkIn: new Date(stay.checkIn), checkOut: new Date(now), guests: stay.guests,
  })
}

export function RoomGrid({ rooms, products }: { rooms: Room[]; products: Product[] }) {
  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><VendaAvulsa products={products} /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {rooms.map((r) => <RoomCard key={r.number} room={r} products={products} />)}
      </div>
    </div>
  )
}

function RoomCard({ room, products }: { room: Room; products: Product[] }) {
  const [open, setOpen] = useState(false)
  const occupied = room.status === 'occupied' && room.currentStay
  const now = useNow(!!occupied)
  let total: number | null = null
  if (occupied && room.pricing && room.currentStay) total = estimateStay(room.currentStay, room.pricing, now) + room.currentStay.consumptionAmount
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className={`group rounded-xl p-3 text-left shadow-sm ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:shadow-md ${STATUS_BG[room.status]}`}>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold leading-none">{room.number}</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">{STATUS_LABEL[room.status]}</span>
          </div>
          <div className="mt-1 truncate text-xs opacity-90">{room.category?.description ?? '—'}</div>
          {occupied && room.currentStay && (
            <div className="mt-2 border-t border-white/25 pt-1.5 text-[11px] opacity-95">
              ⏱ {elapsedLabel(room.currentStay.checkIn, now)} · 👤 {room.currentStay.guests}
              {total != null && <> · <span className="font-semibold">{money(total)}</span></>}
            </div>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Quarto {room.number}
            {room.category && <span className="text-sm font-normal text-muted-foreground">· {room.category.description}</span>}
            <Badge variant="secondary" className="ml-auto">{STATUS_LABEL[room.status]}</Badge>
          </DialogTitle>
        </DialogHeader>
        {room.status === 'free' && <FreeActions room={room} onDone={() => setOpen(false)} />}
        {occupied && room.currentStay && <OccupiedPanel room={room} products={products} onDone={() => setOpen(false)} />}
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

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Button disabled={pending}>{pending ? '…' : children}</Button>
}

function FreeActions({ room, onDone }: { room: Room; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(checkInAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-3">
        <input type="hidden" name="roomNumber" value={room.number} />
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label htmlFor="chargeMode">Modo</Label>
            <NativeSelect id="chargeMode" name="chargeMode" defaultValue="period">
              <NativeSelectOption value="period">Período (por tempo)</NativeSelectOption>
              <NativeSelectOption value="overnight">Pernoite (valor fixo)</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="day">Tabela</Label>
            <NativeSelect id="day" name="day" defaultValue="normal">
              <NativeSelectOption value="normal">Semana</NativeSelectOption>
              <NativeSelectOption value="special">Fim de semana</NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1"><Label htmlFor="guests">Hóspedes</Label><Input id="guests" name="guests" type="number" min="1" defaultValue="2" /></div>
          <div className="grid gap-1"><Label htmlFor="prepaidAmount">Antecipado (R$)</Label><Input id="prepaidAmount" name="prepaidAmount" type="number" step="0.01" defaultValue="0" /></div>
        </div>
        <Submit>Fazer entrada</Submit>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      </form>
      <MaintenanceForm number={room.number} onDone={onDone} />
    </div>
  )
}

function OccupiedPanel({ room, products, onDone }: { room: Room; products: Product[]; onDone: () => void }) {
  const stay = room.currentStay!
  const now = useNow(true)
  const consumoTotal = room.consumption.reduce((a, c) => a + c.unitPrice * c.qty, 0)
  const estadia = room.pricing ? estimateStay(stay, room.pricing, now) : null
  const total = estadia != null ? estadia + consumoTotal - stay.prepaid : null
  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Consumo ({money(consumoTotal)})</h3>
        {room.consumption.map((c) => (
          <div key={c.id} className="flex items-center justify-between text-sm">
            <span>{c.qty}× {c.description} — {money(c.unitPrice * c.qty)}</span>
            <RemoveItem id={c.id} />
          </div>
        ))}
        <AddConsumption stayId={stay.id} products={products} />
      </section>
      <section className="rounded-lg border p-3 text-sm">
        <div className="mb-1 font-medium">Fechamento — {stay.chargeMode === 'overnight' ? 'Pernoite' : 'Período'} · ⏱ {elapsedLabel(stay.checkIn, now)}</div>
        <Row label="Estadia (estimada)" value={estadia != null ? money(estadia) : '—'} />
        <Row label="Consumo" value={money(consumoTotal)} />
        <Row label="Antecipado" value={`- ${money(stay.prepaid)}`} />
        <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>{total != null ? money(total) : '—'}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">Valor final confirmado no servidor.</p>
      </section>
      <CheckOut roomNumber={room.number} onDone={onDone} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>
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

function CheckOut({ roomNumber, onDone }: { roomNumber: string; onDone: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(async () => checkOutAction(roomNumber), { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return <form action={formAction}><Submit>Confirmar saída</Submit>{state.error && <p className="text-destructive text-sm">{state.error}</p>}</form>
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
        <ul className="text-sm">{cart.map((i, idx) => <li key={idx}>{i.qty}× {products.find((p) => p.code === i.productCode)?.description}</li>)}</ul>
        <p className="text-sm font-medium">Total: {money(total)}</p>
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
