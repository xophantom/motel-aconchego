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
import { checkInAction, checkOutAction, setRoomStatusAction, addConsumptionAction, removeConsumptionAction, walkinSaleAction, applyBenefitAction, type ActionState } from './actions'

type Product = { code: string; description: string; price: number }
type ConsItem = { id: string; description: string; qty: number; unitPrice: number }
type Pricing = { billing: 'motel' | 'hotel'; minPeriodMin: number; maxPeriodMin: number; includedGuests: number; basePrice: number; excessPrice30m: number; overnightPrice: number; extraGuestPrice: number }
type Stay = { id: string; checkIn: string; guests: number; day: 'normal' | 'special'; chargeMode: 'period' | 'overnight'; prepaid: number; consumptionAmount: number; discountPercent: number }
type Loyalty = { plate: string; visits: number; tiers: { id: number; minVisits: number; discountPercent: number }[]; appliedDiscount: number }
type Room = {
  number: string
  status: 'free' | 'occupied' | 'cleaning' | 'maintenance'
  maintenanceReason: string | null
  category: { code: string; description: string } | null
  currentStay: Stay | null
  pricing: Pricing | null
  consumption: ConsItem[]
  loyalty: Loyalty | null
}

const STATUS_LABEL: Record<Room['status'], string> = { free: 'Livre', occupied: 'Ocupado', cleaning: 'Limpeza', maintenance: 'Manutenção' }
const STATUS_TILE: Record<Room['status'], string> = {
  free: 'var(--room-free)', occupied: 'var(--room-occupied)', cleaning: 'var(--room-cleaning)', maintenance: 'var(--room-maintenance)',
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
  const base = computeStayAmount({
    billing: pricing.billing, chargeMode: stay.chargeMode, minPeriodMin: pricing.minPeriodMin, maxPeriodMin: pricing.maxPeriodMin,
    includedGuests: pricing.includedGuests, rate: { basePrice: pricing.basePrice, excessPrice30m: pricing.excessPrice30m, overnightPrice: pricing.overnightPrice, extraGuestPrice: pricing.extraGuestPrice },
    checkIn: new Date(stay.checkIn), checkOut: new Date(now), guests: stay.guests,
  })
  return base * (1 - stay.discountPercent / 100)
}

export function RoomGrid({ rooms, products }: { rooms: Room[]; products: Product[] }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <VendaAvulsa products={products} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {rooms.map((r) => <RoomCard key={r.number} room={r} products={products} />)}
      </div>
    </div>
  )
}

function Legend() {
  const items: [Room['status'], string][] = [['free', 'Livre'], ['occupied', 'Ocupado'], ['cleaning', 'Limpeza'], ['maintenance', 'Manutenção']]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map(([s, label]) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: STATUS_TILE[s], boxShadow: `0 0 8px ${STATUS_TILE[s]}` }} />
          {label}
        </span>
      ))}
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
        <button
          style={{ '--tile': STATUS_TILE[room.status] } as React.CSSProperties}
          className="group relative overflow-hidden rounded-2xl border bg-card p-3.5 text-left transition duration-200 border-[color-mix(in_oklab,var(--tile)_28%,var(--border))] hover:-translate-y-1 hover:border-[color-mix(in_oklab,var(--tile)_55%,transparent)] hover:shadow-[0_12px_36px_-16px_var(--tile)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tile)]"
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-[var(--tile)] opacity-80" aria-hidden />
          <div className="flex items-start justify-between gap-2">
            <span className="tnum font-display text-3xl font-extrabold leading-none tracking-tight text-[var(--tile)] [text-shadow:0_0_22px_color-mix(in_oklab,var(--tile)_45%,transparent)]">{room.number}</span>
            <span className="flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--tile)_16%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--tile)]">
              <span className={`size-1.5 rounded-full bg-[var(--tile)] ${occupied ? 'animate-pulse' : ''}`} aria-hidden />
              {STATUS_LABEL[room.status]}
            </span>
          </div>
          <div className="mt-1.5 truncate text-xs text-muted-foreground">{room.category?.description ?? '—'}</div>
          {occupied && room.currentStay && (
            <div className="tnum mt-2.5 flex items-center gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
              <span>⏱ {elapsedLabel(room.currentStay.checkIn, now)}</span>
              <span>👤 {room.currentStay.guests}</span>
              {total != null && <span className="ml-auto font-semibold text-foreground">{money(total)}</span>}
            </div>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 font-display">
            Quarto {room.number}
            {room.category && <span className="text-sm font-normal text-muted-foreground">· {room.category.description}</span>}
            <Badge variant="secondary" className="ml-auto mr-2">{STATUS_LABEL[room.status]}</Badge>
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

function Submit({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus()
  return <Button disabled={pending} className={className}>{pending ? '…' : children}</Button>
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
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
        <div className="grid gap-1"><Label htmlFor="plate">Placa (opcional)</Label><Input id="plate" name="plate" placeholder="ABC1D23" className="uppercase" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1"><Label htmlFor="guests">Hóspedes</Label><Input id="guests" name="guests" type="number" min="1" defaultValue="2" /></div>
          <div className="grid gap-1"><Label htmlFor="prepaidAmount">Antecipado (R$)</Label><Input id="prepaidAmount" name="prepaidAmount" type="number" step="0.01" defaultValue="0" /></div>
        </div>
        <Submit className="w-full">Fazer entrada</Submit>
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
    <div className="grid gap-3">
      <Section title="Consumo" right={<span className="tnum text-sm font-medium">{money(consumoTotal)}</span>}>
        <div className="grid gap-1.5">
          {room.consumption.length === 0 && <p className="text-xs text-muted-foreground">Nenhum item lançado.</p>}
          {room.consumption.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="tnum rounded-md bg-secondary px-1.5 py-0.5 text-xs font-semibold">{c.qty}×</span>
                {c.description}
              </span>
              <span className="flex items-center gap-1">
                <span className="tnum text-muted-foreground">{money(c.unitPrice * c.qty)}</span>
                <RemoveItem id={c.id} />
              </span>
            </div>
          ))}
        </div>
        <AddConsumption stayId={stay.id} products={products} />
      </Section>
      {room.loyalty && (
        <Section title={`Fidelidade · ${room.loyalty.plate}`} right={<span className="text-xs text-muted-foreground">{room.loyalty.visits} visitas</span>}>
          {room.loyalty.appliedDiscount > 0 ? (
            <p className="text-sm font-medium text-[var(--room-free)]">Desconto aplicado: {room.loyalty.appliedDiscount}%</p>
          ) : room.loyalty.tiers.length ? (
            <div className="flex flex-wrap gap-2">{room.loyalty.tiers.map((t) => <ApplyBenefit key={t.id} roomNumber={room.number} tier={t} />)}</div>
          ) : (
            <p className="text-xs text-muted-foreground">Sem benefício disponível ainda.</p>
          )}
        </Section>
      )}
      <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3.5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fechamento · {stay.chargeMode === 'overnight' ? 'Pernoite' : 'Período'} · ⏱ {elapsedLabel(stay.checkIn, now)}
        </div>
        <Row label="Estadia (estimada)" value={estadia != null ? money(estadia) : '—'} />
        <Row label="Consumo" value={money(consumoTotal)} />
        <Row label="Antecipado" value={`− ${money(stay.prepaid)}`} />
        <div className="mt-2 flex items-baseline justify-between border-t pt-2">
          <span className="text-sm font-semibold">Total a receber</span>
          <span className="tnum font-display text-2xl font-bold text-primary">{total != null ? money(total) : '—'}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Valor final confirmado no servidor.</p>
      </div>
      <CheckOut roomNumber={room.number} onDone={onDone} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="tnum">{value}</span></div>
}

function AddConsumption({ stayId, products }: { stayId: string; products: Product[] }) {
  const action = addConsumptionAction.bind(null, stayId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  return (
    <form action={formAction} className="flex items-end gap-2 border-t pt-2">
      <div className="grid gap-1">
        <Label htmlFor="productCode" className="text-xs">Produto</Label>
        <NativeSelect id="productCode" name="productCode" className="h-8 w-40" defaultValue="" required>
          <NativeSelectOption value="" disabled>Selecione…</NativeSelectOption>
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
  return <form action={action}><Button size="icon" variant="ghost" type="submit" className="size-6 text-muted-foreground hover:text-destructive" aria-label="Remover item">×</Button></form>
}

function CheckOut({ roomNumber, onDone }: { roomNumber: string; onDone: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(async () => checkOutAction(roomNumber), { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return <form action={formAction}><Submit className="w-full">Confirmar saída</Submit>{state.error && <p className="mt-1 text-destructive text-sm">{state.error}</p>}</form>
}

function ApplyBenefit({ roomNumber, tier }: { roomNumber: string; tier: { id: number; discountPercent: number } }) {
  const [state, action] = useActionState<ActionState, FormData>(async () => applyBenefitAction(roomNumber, tier.id), { ok: false })
  return (
    <form action={action} className="mt-1">
      <Button size="sm" variant="secondary" type="submit">Aplicar {tier.discountPercent}%</Button>
      {state.error && <span className="ml-2 text-destructive text-xs">{state.error}</span>}
    </form>
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
        <DialogHeader><DialogTitle className="font-display">Venda avulsa (Pedido Casa)</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <AddToCart products={products} onAdd={(productCode, qty) => setCart((c) => [...c, { productCode, qty }])} />
          <ul className="grid gap-1.5 text-sm">
            {cart.length === 0 && <li className="text-xs text-muted-foreground">Carrinho vazio. Adicione itens acima.</li>}
            {cart.map((i, idx) => {
              const p = products.find((pp) => pp.code === i.productCode)
              return (
                <li key={idx} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="tnum rounded-md bg-secondary px-1.5 py-0.5 text-xs font-semibold">{i.qty}×</span>
                    {p?.description}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="tnum text-muted-foreground">{money((p?.price ?? 0) * i.qty)}</span>
                    <Button type="button" size="icon" variant="ghost" className="size-6 text-muted-foreground hover:text-destructive" aria-label="Remover" onClick={() => setCart((c) => c.filter((_, x) => x !== idx))}>×</Button>
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex items-baseline justify-between border-t pt-2">
            <span className="text-sm font-semibold">Total</span>
            <span className="tnum font-display text-xl font-bold">{money(total)}</span>
          </div>
          <form action={action}>
            <input type="hidden" name="items" value={JSON.stringify(cart)} />
            <Submit className="w-full">Registrar venda</Submit>
            {state.error && <p className="mt-1 text-destructive text-sm">{state.error}</p>}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AddToCart({ products, onAdd }: { products: Product[]; onAdd: (code: string, qty: number) => void }) {
  const [code, setCode] = useState('')
  const [qty, setQty] = useState(1)
  return (
    <div className="flex items-end gap-2">
      <NativeSelect value={code} onChange={(e) => setCode(e.target.value)} className="h-8 w-40">
        <NativeSelectOption value="">Selecione…</NativeSelectOption>
        {products.map((p) => <NativeSelectOption key={p.code} value={p.code}>{p.description}</NativeSelectOption>)}
      </NativeSelect>
      <Input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-8 w-16" />
      <Button type="button" size="sm" variant="outline" onClick={() => code && onAdd(code, qty)}>Adicionar</Button>
    </div>
  )
}
