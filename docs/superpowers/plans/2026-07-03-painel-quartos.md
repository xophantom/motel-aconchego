# Painel de Quartos (modo de cobrança + redesenho) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-stay charge mode (overnight-flat vs period-by-duration) and redesign the room card + modal to be prettier and show live stats/value breakdown.

**Architecture:** Schema gains `stay.chargeMode`; the pure billing engine honors it; the check-in DAL stores it and check-out uses it. The `/quartos` board passes each occupied room its category pricing so the client renders live estimates on the card and a value breakdown in the (larger) modal.

**Tech Stack:** Next 16, React 19, Prisma 7 (`@/generated/prisma/client`, adapter-pg), Zod, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-painel-quartos-design.md`

## Global Constraints
- Repo `/Users/leosperandio/Git/MotelAconchego`; branch `feat/painel` from `main`.
- Prisma imports from `@/generated/prisma/client` — NOT `@prisma/client`.
- **No** `Co-Authored-By` trailers. Conventional Commits.
- DB-backed tests: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test <file>` (empty test DB → seed fixtures; mock `server-only` + `@/server/session`).
- `src/lib/billing.ts` must stay pure (client-importable — no `server-only`).
- Start: `git checkout -b feat/painel`.

---

## Task 1: chargeMode — schema + engine + DAL (TDD)

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/billing.ts`, `src/lib/validation/stay.ts`, `src/server/data/stays.ts`
- Modify (tests): `tests/lib/billing.test.ts`, `tests/server/stays.test.ts`

**Interfaces:**
- Produces: `computeStayAmount(i)` where `BillingInput` now includes optional `chargeMode?: 'period' | 'overnight'` (default `'period'`). `checkInSchema` now includes `chargeMode` (default `'period'`); `CheckInInput` type gains `chargeMode: 'period' | 'overnight'`. `stays.checkIn(input)` stores it; `stays.checkOut(roomNumber)` reads `stay.chargeMode`.

- [ ] **Step 1: Schema** — in `prisma/schema.prisma` add the enum (multi-line form; Prisma 7 rejects single-line) and the column on `Stay`:
```prisma
enum ChargeMode {
  period
  overnight

  @@map("charge_mode")
}
```
On `model Stay`, add (next to `day`):
```prisma
  chargeMode ChargeMode @default(period) @map("charge_mode")
```

- [ ] **Step 2: Migrate both DBs**

Run:
```bash
cd /Users/leosperandio/Git/MotelAconchego
pnpm prisma migrate dev --name add_charge_mode
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm prisma migrate deploy
```
Expected: migration adds `charge_mode` enum + column with default `period`.

- [ ] **Step 3: Billing test** — add to `tests/lib/billing.test.ts` (new describe block):
```ts
describe('computeStayAmount charge mode', () => {
  const overnight = (checkInMin: number, checkOutMin: number, guests = 2) =>
    computeStayAmount({ billing: 'motel', chargeMode: 'overnight', ...baseCat, rate, checkIn: at(checkInMin), checkOut: at(checkOutMin), guests })
  it('overnight charges the flat overnight price regardless of duration', () => {
    expect(overnight(0, 30)).toBe(160)     // short stay, still overnight price
    expect(overnight(0, 600)).toBe(160)
  })
  it('overnight still adds extra-guest price', () => {
    expect(overnight(0, 30, 3)).toBe(185)  // 160 + 1*25
  })
  it('period mode (default) is unchanged', () => {
    expect(computeStayAmount({ billing: 'motel', ...baseCat, rate, checkIn: at(0), checkOut: at(181), guests: 2 })).toBe(90)
  })
})
```
(`baseCat`, `rate`, `at` already exist at the top of this test file.)

- [ ] **Step 4: Run → fail**

Run: `pnpm test tests/lib/billing.test.ts`
Expected: FAIL — `chargeMode` not on `BillingInput`.

- [ ] **Step 5: Engine** — edit `src/lib/billing.ts`. Add to `BillingInput`:
```ts
  chargeMode?: 'period' | 'overnight'
```
Replace the motel branch of `computeStayAmount` so overnight short-circuits:
```ts
export function computeStayAmount(i: BillingInput): number {
  const dur = durationMinutes(i.checkIn, i.checkOut)
  let stay: number
  if (i.billing === 'hotel') {
    stay = Math.max(1, Math.ceil(dur / 1440)) * i.rate.overnightPrice
  } else if (i.chargeMode === 'overnight') {
    stay = i.rate.overnightPrice
  } else if (dur <= i.minPeriodMin) {
    stay = i.rate.basePrice
  } else {
    const extra30 = Math.ceil((dur - i.minPeriodMin) / 30)
    stay = Math.min(i.rate.basePrice + extra30 * i.rate.excessPrice30m, i.rate.overnightPrice)
  }
  stay += Math.max(0, i.guests - i.includedGuests) * i.rate.extraGuestPrice
  return round2(stay)
}
```

- [ ] **Step 6: Run → pass**

Run: `pnpm test tests/lib/billing.test.ts`
Expected: PASS (new + existing billing tests).

- [ ] **Step 7: Validation** — in `src/lib/validation/stay.ts`, add `chargeMode` to `checkInSchema`:
```ts
export const checkInSchema = z.object({
  roomNumber: z.string().min(1),
  day: z.enum(['normal', 'special']),
  chargeMode: z.enum(['period', 'overnight']).default('period'),
  guests: z.coerce.number().int().min(1),
  prepaidAmount: z.coerce.number().min(0).default(0),
})
```

- [ ] **Step 8: Stays test** — add to `tests/server/stays.test.ts` inside `describe('check-out', ...)`:
```ts
  it('overnight stay is charged the flat overnight price', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', chargeMode: 'overnight', guests: 2, prepaidAmount: 0 })
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
    const { stayAmount } = await checkOut('01')
    expect(stayAmount).toBe(160) // overnightPrice, not the 30-min base
  })
```
And update the existing `checkIn(...)` calls in this file to include `chargeMode: 'period'` where they pass an object literal (TypeScript now requires it via `CheckInInput`, since the DAL input type is derived from the schema — OR keep them working by leaving `chargeMode` optional in the DAL input; see Step 9).

- [ ] **Step 9: DAL** — edit `src/server/data/stays.ts`:
  - `checkIn`: on `tx.stay.create({ data: { ... } })`, add `chargeMode: input.chargeMode ?? 'period'`.
  - Ensure the `CheckInInput` used by `checkIn` includes `chargeMode` — it comes from `@/lib/validation/stay` `CheckInInput` (inferred from the schema, so `chargeMode: 'period' | 'overnight'` with a default; callers passing an object without it are fine at runtime because of the `?? 'period'`, but TS may require it. To keep existing internal callers/tests simple, type the `checkIn` parameter as `Omit<CheckInInput, 'chargeMode'> & { chargeMode?: 'period' | 'overnight' }`).
  - `checkOut`: in the `computeStayAmount({ ... })` call, add `chargeMode: stay.chargeMode`.

- [ ] **Step 10: Run → pass**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/stays.test.ts tests/lib/billing.test.ts`
Expected: PASS (new overnight test + all existing).

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/billing.ts src/lib/validation/stay.ts src/server/data/stays.ts tests/lib/billing.test.ts tests/server/stays.test.ts
git commit -m "feat(quartos): per-stay charge mode (overnight flat vs period)"
```

---

## Task 2: Board pricing read + redesigned card & modal (UI)

**Files:**
- Modify: `src/server/data/tariff.ts` (add `listCategoriesForBoard`), `src/server/data/rooms.ts` (extend select), `src/app/quartos/page.tsx`, `src/app/quartos/room-grid.tsx`, `src/app/quartos/actions.ts` (checkInAction passes chargeMode)
- Test: `tests/server/tariff-board.test.ts`

**Interfaces:**
- Consumes: `computeStayAmount` (Task 1, now with `chargeMode`), `checkInSchema` (with `chargeMode`).
- Produces: `listCategoriesForBoard()` → `Array<{ id: number; code: string; description: string; billing: 'motel'|'hotel'; minPeriodMin: number; maxPeriodMin: number; includedGuests: number; rates: Array<{ day: 'normal'|'special'; basePrice: number; excessPrice30m: number; overnightPrice: number; extraGuestPrice: number }> }>` — a logged-in read (no manager gate).

- [ ] **Step 1: Board pricing DAL test** `tests/server/tariff-board.test.ts`:
```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { listCategoriesForBoard } from '@/server/data/tariff'

beforeEach(async () => {
  await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  const c = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: c.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  session.current = { id: 1, name: 'R', role: 'reception' }
})

describe('listCategoriesForBoard', () => {
  it('any logged-in user gets categories with numeric rates', async () => {
    const cats = await listCategoriesForBoard()
    expect(cats).toHaveLength(1)
    expect(cats[0].rates[0].basePrice).toBe(75)
    expect(typeof cats[0].rates[0].basePrice).toBe('number')
  })
  it('rejects a logged-out user', async () => {
    session.current = null
    await expect(listCategoriesForBoard()).rejects.toThrow(/forbidden/i)
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/tariff-board.test.ts`
Expected: FAIL — `listCategoriesForBoard` not exported.

- [ ] **Step 3: Implement `listCategoriesForBoard`** — append to `src/server/data/tariff.ts`:
```ts
export async function listCategoriesForBoard() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  const cats = await db.roomCategory.findMany({ orderBy: { code: 'asc' }, include: { rates: true } })
  return cats.map((c) => ({
    id: c.id, code: c.code, description: c.description, billing: c.billing,
    minPeriodMin: c.minPeriodMin, maxPeriodMin: c.maxPeriodMin, includedGuests: c.includedGuests,
    rates: c.rates.map((r) => ({
      day: r.day,
      basePrice: Number(r.basePrice), excessPrice30m: Number(r.excessPrice30m),
      overnightPrice: Number(r.overnightPrice), extraGuestPrice: Number(r.extraGuestPrice),
    })),
  }))
}
```

- [ ] **Step 4: Run → pass**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/tariff-board.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Extend the room read** — in `src/server/data/rooms.ts`, widen the `currentStay` select in `listRoomsWithCurrentStay`:
```ts
      currentStay: { select: { id: true, checkIn: true, guests: true, day: true, chargeMode: true, categoryId: true, prepaidAmount: true, consumptionAmount: true } },
```

- [ ] **Step 6: Page — thread pricing to the grid** `src/app/quartos/page.tsx`. Replace `Board()` body (keep the `connection()`+`redirect` guard and the `listConsumption` batching) so it also loads `listCategoriesForBoard()` and attaches, per occupied room, its category config + the rate for the stay's `day`, plus the extra stay fields. Full `Board()`:
```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listRoomsWithCurrentStay } from '@/server/data/rooms'
import { listProducts } from '@/server/data/products'
import { listConsumptionForStays } from '@/server/data/consumption'
import { listCategoriesForBoard } from '@/server/data/tariff'
import { RoomGrid } from './room-grid'

async function Board() {
  await connection()
  let rooms, cats
  try {
    rooms = await listRoomsWithCurrentStay()
    cats = await listCategoriesForBoard()
  } catch { redirect('/login') }
  const products = await listProducts()
  const openStayIds = rooms.filter((r) => r.currentStay).map((r) => r.currentStay!.id)
  const allCons = await listConsumptionForStays(openStayIds)
  const byStay = new Map<string, { id: string; description: string; qty: number; unitPrice: number }[]>()
  for (const c of allCons) {
    const key = String(c.stayId)
    const arr = byStay.get(key) ?? []
    arr.push({ id: String(c.id), description: c.product?.description ?? c.productCode ?? '?', qty: c.qty, unitPrice: Number(c.unitPrice) })
    byStay.set(key, arr)
  }
  const catById = new Map(cats.map((c) => [c.id, c]))
  const data = rooms.map((r) => {
    const s = r.currentStay
    let pricing = null
    if (s?.categoryId != null) {
      const cat = catById.get(s.categoryId)
      const rate = cat?.rates.find((rr) => rr.day === s.day)
      if (cat && rate) pricing = { billing: cat.billing, minPeriodMin: cat.minPeriodMin, maxPeriodMin: cat.maxPeriodMin, includedGuests: cat.includedGuests, ...rate }
    }
    return {
      number: r.number,
      status: r.status,
      maintenanceReason: r.maintenanceReason,
      category: r.category ? { code: r.category.code, description: r.category.description } : null,
      currentStay: s ? { id: String(s.id), checkIn: s.checkIn.toISOString(), guests: s.guests, day: s.day, chargeMode: s.chargeMode, prepaid: Number(s.prepaidAmount), consumptionAmount: Number(s.consumptionAmount) } : null,
      pricing,
      consumption: s ? (byStay.get(String(s.id)) ?? []) : [],
    }
  })
  return <RoomGrid rooms={data} products={products.map((p) => ({ code: p.code, description: p.description, price: Number(p.price) }))} />
}

export default function QuartosPage() {
  return (
    <main className="mx-auto mt-8 max-w-6xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Quartos</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Board />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 7: Redesign the grid** — replace `src/app/quartos/room-grid.tsx` with the version below. Changes vs current: richer color card with room number + status Badge + category name + occupied stats footer (⏱ tempo · 👤 hóspedes · R$ total, live); a **Modo** select on check-in (`chargeMode`); a bigger modal (`sm:max-w-lg`); and a live **breakdown** at checkout (Estadia + Consumo − Antecipado = Total). The billing estimate uses the pure `computeStayAmount` with the room's `pricing`.
```tsx
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
```

- [ ] **Step 8: Ensure `checkInAction` forwards `chargeMode`** — in `src/app/quartos/actions.ts`, the `checkInSchema.safeParse({...})` must include `chargeMode: fd.get('chargeMode') ?? 'period'`. Add that key to the parsed object in `checkInAction`.

- [ ] **Step 9: Verify**

Run:
```bash
pnpm exec tsc --noEmit
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test
pnpm build
```
Expected: tsc zero errors; all tests pass (billing charge-mode, stays overnight, tariff-board, plus prior suites); build succeeds with `/quartos` in the route table. The `Badge` component exists under `@/components/ui/badge` (from `shadcn add --all`); if not, `pnpm dlx shadcn@latest add badge -y`.

- [ ] **Step 10: Commit**

```bash
git add src/server/data/tariff.ts src/server/data/rooms.ts src/app/quartos tests/server/tariff-board.test.ts
git commit -m "feat(quartos): richer room cards + bigger modal with live value breakdown + charge-mode select"
```

---

## Self-Review (done)

- **Spec coverage:** chargeMode schema+migration+engine+DAL+validation (T1); overnight=flat/period=duration (T1 engine + tests); board pricing read (T2 `listCategoriesForBoard`); card redesign with category name + occupied stats (T2 RoomCard); bigger modal `sm:max-w-lg` + checkout breakdown (T2 OccupiedPanel); charge-mode select at check-in (T2 FreeActions + action). Drawer / admin-delete-turno / fidelidade correctly out of scope. All spec sections mapped.
- **Placeholder scan:** none — real code/commands in every step.
- **Type consistency:** `chargeMode: 'period'|'overnight'` consistent across `BillingInput` (T1), `checkInSchema`/`CheckInInput` (T1), `stays.checkIn`/`checkOut` (T1), the board `Stay` type + `estimateStay` + `FreeActions` select (T2). `Pricing`/`Stay`/`Room` client types (T2) match the page's serialized shape (T2 Step 6). `computeStayAmount` optional `chargeMode` keeps existing billing tests valid. `listCategoriesForBoard` return shape matches its consumer in the page.
- **Test DB note:** DB tests seed fixtures + clean in `beforeEach`; migration applied to `motelac_test` in T1 Step 2. Existing `stays.test.ts` check-in calls get `chargeMode: 'period'` (or rely on the DAL param being optional) — T1 Step 8/9 keep them green.
