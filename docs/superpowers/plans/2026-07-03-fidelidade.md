# Fidelidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plate-based customer identification, manager-configurable loyalty tiers (visits → discount %), and one-time-per-customer redemption applying a stay-only discount at checkout.

**Architecture:** New `LoyaltyTier`/`LoyaltyRedemption` models + `Customer.plate` + `Stay.discountPercent`; a `server-only` loyalty DAL (tiers CRUD, plate find-or-create, visit count, available/redeem); check-in captures the plate, and check-out applies the stored discount to the stay value only.

**Tech Stack:** Next 16, React 19, Prisma 7 (`@/generated/prisma/client`, adapter-pg), Zod, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-fidelidade-design.md`

## Global Constraints
- Repo `/Users/leosperandio/Git/MotelAconchego`; branch `feat/fidelidade` from `main`.
- Prisma imports from `@/generated/prisma/client` — NOT `@prisma/client`.
- **No** `Co-Authored-By` trailers. Conventional Commits.
- DB tests: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test <file>` (empty test DB → seed fixtures; mock `server-only` + `@/server/session`).
- Discount applies to the STAY value only (consumption unaffected). Plate normalized UPPER + no spaces.
- Start: `git checkout -b feat/fidelidade`.

---

## Task 1: Schema + loyalty DAL + checkout discount (TDD)

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/rbac.ts`, `src/server/data/stays.ts`
- Create: `src/server/data/loyalty.ts`, `tests/lib/rbac-loyalty.test.ts`, `tests/server/loyalty.test.ts`
- Modify (tests): `tests/server/stays.test.ts`

**Interfaces:**
- Produces: `listTiers()`, `upsertTier({minVisits, discountPercent})`, `deleteTier(id)`, `customerByPlate(plate) → Customer`, `customerVisits(customerId, excludeStayId?) → number`, `availableTiers(customerId, excludeStayId?) → { visits: number; tiers: LoyaltyTier[] }`, `redeemTier({customerId, tierId, stayId}) → number` (the discountPercent). RBAC `'loyalty:manage'` (manager). `stay.discountPercent` applied in `checkOut`.

- [ ] **Step 1: Schema** — in `prisma/schema.prisma`:
  - On `model Customer`, add: `plate String? @unique` and `redemptions LoyaltyRedemption[]`.
  - On `model Stay`, add (next to `chargeMode`): `discountPercent Int @default(0) @map("discount_percent")` and `redemptions LoyaltyRedemption[]`.
  - Add two models:
```prisma
model LoyaltyTier {
  id              Int    @id @default(autoincrement())
  minVisits       Int    @unique @map("min_visits")
  discountPercent Int    @map("discount_percent")
  redemptions     LoyaltyRedemption[]

  @@map("loyalty_tier")
}

model LoyaltyRedemption {
  id         BigInt   @id @default(autoincrement())
  customerId BigInt   @map("customer_id")
  tierId     Int      @map("tier_id")
  stayId     BigInt   @map("stay_id")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz
  customer   Customer    @relation(fields: [customerId], references: [id])
  tier       LoyaltyTier @relation(fields: [tierId], references: [id])
  stay       Stay        @relation(fields: [stayId], references: [id])

  @@unique([customerId, tierId])
  @@map("loyalty_redemption")
}
```

- [ ] **Step 2: Migrate both DBs**

Run:
```bash
cd /Users/leosperandio/Git/MotelAconchego
pnpm prisma migrate dev --name loyalty
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm prisma migrate deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm prisma generate
```
Expected: migration adds `loyalty_tier`, `loyalty_redemption`, `customer.plate` (unique), `stay.discount_percent` (default 0).

- [ ] **Step 3: RBAC test** `tests/lib/rbac-loyalty.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'
describe('loyalty:manage', () => {
  it('only manager manages loyalty', () => {
    expect(can('manager', 'loyalty:manage')).toBe(true)
    expect(can('reception', 'loyalty:manage')).toBe(false)
    expect(can('housekeeper', 'loyalty:manage')).toBe(false)
  })
})
```

- [ ] **Step 4: RBAC** — replace `src/lib/rbac.ts` contents (keeps all prior actions, adds `loyalty:manage`):
```ts
import type { EmployeeRole } from '@/generated/prisma/client'

export type Action = 'users:manage' | 'cash:withdraw' | 'room:status' | 'tariff:manage' | 'stay:manage' | 'cash:manage' | 'product:manage' | 'report:view' | 'loyalty:manage'

const MATRIX: Record<EmployeeRole, Action[]> = {
  manager:     ['users:manage', 'cash:withdraw', 'room:status', 'tariff:manage', 'stay:manage', 'cash:manage', 'product:manage', 'report:view', 'loyalty:manage'],
  reception:   ['cash:withdraw', 'room:status', 'stay:manage', 'cash:manage'],
  housekeeper: ['room:status'],
}

export function can(role: EmployeeRole, action: Action): boolean {
  return MATRIX[role]?.includes(action) ?? false
}
```

- [ ] **Step 5: loyalty DAL test** `tests/server/loyalty.test.ts`:
```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { upsertTier, listTiers, customerByPlate, customerVisits, availableTiers, redeemTier } from '@/server/data/loyalty'

beforeEach(async () => {
  await db.loyaltyRedemption.deleteMany(); await db.loyaltyTier.deleteMany()
  await db.stay.deleteMany(); await db.customer.deleteMany(); await db.room.deleteMany()
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('tiers', () => {
  it('manager upserts and lists tiers ordered', async () => {
    await upsertTier({ minVisits: 10, discountPercent: 100 })
    await upsertTier({ minVisits: 5, discountPercent: 50 })
    const tiers = await listTiers()
    expect(tiers.map((t) => t.minVisits)).toEqual([5, 10])
  })
  it('reception cannot upsert', async () => {
    session.current = { id: 2, name: 'R', role: 'reception' }
    await expect(upsertTier({ minVisits: 3, discountPercent: 30 })).rejects.toThrow(/forbidden/i)
  })
})

describe('plate + visits + redemption', () => {
  beforeEach(() => { session.current = { id: 1, name: 'R', role: 'reception' } })
  it('customerByPlate normalizes and reuses', async () => {
    const a = await customerByPlate(' abc1d23 ')
    const b = await customerByPlate('ABC1D23')
    expect(a.id).toBe(b.id)
    expect(a.plate).toBe('ABC1D23')
  })
  it('counts closed room stays, excluding the current one', async () => {
    const c = await customerByPlate('AAA0000')
    await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), checkOut: new Date(), status: 'closed', day: 'normal', guests: 2 } })
    const current = await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
    expect(await customerVisits(c.id)).toBe(1)
    expect(await customerVisits(c.id, current.id)).toBe(1)
  })
  it('availableTiers = earned minus redeemed; redeem is once per tier', async () => {
    session.current = { id: 1, name: 'M', role: 'manager' }
    const t5 = await upsertTier({ minVisits: 1, discountPercent: 50 })
    session.current = { id: 1, name: 'R', role: 'reception' }
    const c = await customerByPlate('BBB1111')
    await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), checkOut: new Date(), status: 'closed', day: 'normal', guests: 2 } })
    let av = await availableTiers(c.id)
    expect(av.visits).toBe(1)
    expect(av.tiers).toHaveLength(1)
    const stay = await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
    const pct = await redeemTier({ customerId: c.id, tierId: t5.id, stayId: stay.id })
    expect(pct).toBe(50)
    av = await availableTiers(c.id)
    expect(av.tiers).toHaveLength(0)
    await expect(redeemTier({ customerId: c.id, tierId: t5.id, stayId: stay.id })).rejects.toThrow()
  })
})
```

- [ ] **Step 6: Run → fail**

Run: `pnpm test tests/lib/rbac-loyalty.test.ts` and `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/loyalty.test.ts`
Expected: FAIL — module `@/server/data/loyalty` not found.

- [ ] **Step 7: Implement** `src/server/data/loyalty.ts`:
```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'

async function requireLoyaltyManager() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'loyalty:manage')) throw new Error('Forbidden')
}
async function requireOps() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:manage')) throw new Error('Forbidden')
}
function normalizePlate(p: string) { return p.toUpperCase().replace(/\s+/g, '') }

export async function listTiers() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  return db.loyaltyTier.findMany({ orderBy: { minVisits: 'asc' } })
}
export async function upsertTier(input: { minVisits: number; discountPercent: number }) {
  await requireLoyaltyManager()
  return db.loyaltyTier.upsert({ where: { minVisits: input.minVisits }, create: input, update: { discountPercent: input.discountPercent } })
}
export async function deleteTier(id: number) {
  await requireLoyaltyManager()
  return db.loyaltyTier.delete({ where: { id } })
}
export async function customerByPlate(plate: string) {
  await requireOps()
  const norm = normalizePlate(plate)
  return db.customer.upsert({ where: { plate: norm }, create: { plate: norm }, update: {} })
}
export async function customerVisits(customerId: bigint, excludeStayId?: bigint) {
  return db.stay.count({ where: { customerId, type: 'room', status: 'closed', ...(excludeStayId ? { id: { not: excludeStayId } } : {}) } })
}
export async function availableTiers(customerId: bigint, excludeStayId?: bigint) {
  const visits = await customerVisits(customerId, excludeStayId)
  const [tiers, redeemed] = await Promise.all([
    db.loyaltyTier.findMany({ where: { minVisits: { lte: visits } }, orderBy: { minVisits: 'asc' } }),
    db.loyaltyRedemption.findMany({ where: { customerId }, select: { tierId: true } }),
  ])
  const redeemedIds = new Set(redeemed.map((r) => r.tierId))
  return { visits, tiers: tiers.filter((t) => !redeemedIds.has(t.id)) }
}
export async function redeemTier(input: { customerId: bigint; tierId: number; stayId: bigint }) {
  await requireOps()
  const tier = await db.loyaltyTier.findUniqueOrThrow({ where: { id: input.tierId } })
  await db.loyaltyRedemption.create({ data: { customerId: input.customerId, tierId: tier.id, stayId: input.stayId } })
  return tier.discountPercent
}
```

- [ ] **Step 8: Run → pass**

Run: `pnpm test tests/lib/rbac-loyalty.test.ts` and `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/loyalty.test.ts`
Expected: PASS.

- [ ] **Step 9: Checkout discount** — in `src/server/data/stays.ts` `checkOut`, after `stayAmount` is computed from `computeStayAmount({...})`, apply the stay's discount:
```ts
  const discount = stay.discountPercent ?? 0
  const stayAmount = discount > 0 ? Math.round(rawStayAmount * (1 - discount / 100) * 100) / 100 : rawStayAmount
```
(Rename the existing `const stayAmount = computeStayAmount({...})` to `const rawStayAmount = computeStayAmount({...})`, then add the two lines above. `stay.discountPercent` is available because `checkOut` includes `currentStay` fully.)

- [ ] **Step 10: Stays discount test** — add to `tests/server/stays.test.ts` inside `describe('check-out', ...)`:
```ts
  it('applies the loyalty discount to the stay value only', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', chargeMode: 'overnight', guests: 2, prepaidAmount: 0 })
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000), discountPercent: 50 } })
    const { stayAmount } = await checkOut('01')
    expect(stayAmount).toBe(80) // 160 overnight * 50% off
  })
```

- [ ] **Step 11: Run → pass**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/stays.test.ts`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/rbac.ts src/server/data/loyalty.ts src/server/data/stays.ts tests/lib/rbac-loyalty.test.ts tests/server/loyalty.test.ts tests/server/stays.test.ts
git commit -m "feat(fidelidade): loyalty tiers/redemption DAL + plate customer + checkout discount"
```

---

## Task 2: Plate on check-in + apply-benefit at checkout (DAL wire + UI)

**Files:**
- Modify: `src/lib/validation/stay.ts`, `src/server/data/stays.ts`, `src/server/data/rooms.ts`, `src/app/quartos/page.tsx`, `src/app/quartos/room-grid.tsx`, `src/app/quartos/actions.ts`

**Interfaces:**
- Consumes: `customerByPlate`, `availableTiers`, `redeemTier` (Task 1).
- Produces: `checkIn` accepts `plate?`; `applyBenefitAction(roomNumber, tierId, prev, fd)`.

- [ ] **Step 1: Validation** — in `src/lib/validation/stay.ts`, add `plate` to `checkInSchema`:
```ts
  plate: z.string().trim().optional(),
```

- [ ] **Step 2: check-in stores customer** — in `src/server/data/stays.ts` `checkIn`, before the `db.$transaction`, resolve the customer from the plate; pass `customerId` into `tx.stay.create`. Add near the top of `checkIn` (after the `requireOps()`/room checks):
```ts
  const customer = input.plate ? await customerByPlate(input.plate) : null
```
and in the `tx.stay.create({ data: { ... } })`, add `customerId: customer?.id ?? null`. Add the import at top: `import { customerByPlate, getOpenShiftFor } from ...` — actually `customerByPlate` is in `@/server/data/loyalty`; add `import { customerByPlate } from '@/server/data/loyalty'`. Widen the `checkIn` param type to also allow `plate?: string` (it already spreads `CheckInInput`).

- [ ] **Step 3: applyBenefitAction** — append to `src/app/quartos/actions.ts`:
```ts
import { redeemTier, availableTiers } from '@/server/data/loyalty'

export async function applyBenefitAction(roomNumber: string, tierId: number): Promise<ActionState> {
  try {
    const room = await (await import('@/server/db')).db.room.findUniqueOrThrow({ where: { number: roomNumber }, include: { currentStay: true } })
    const stay = room.currentStay
    if (!stay || stay.status !== 'open' || !stay.customerId) return { ok: false, error: 'Sem cliente na estadia.' }
    const av = await availableTiers(stay.customerId, stay.id)
    if (!av.tiers.some((t) => t.id === tierId)) return { ok: false, error: 'Benefício indisponível.' }
    const pct = await redeemTier({ customerId: stay.customerId, tierId, stayId: stay.id })
    await (await import('@/server/db')).db.stay.update({ where: { id: stay.id }, data: { discountPercent: pct } })
  } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}
```
> The dynamic `import('@/server/db')` keeps this action file from importing the Prisma client at module scope where it isn't already; if `db` is already imported in `actions.ts`, use it directly instead.

- [ ] **Step 4: check-in action passes plate** — in `checkInAction` (`src/app/quartos/actions.ts`), add `plate: fd.get('plate') ?? undefined` to the `checkInSchema.safeParse({...})`.

- [ ] **Step 5: Extend room read** — in `src/server/data/rooms.ts` `listRoomsWithCurrentStay`, widen the `currentStay` select to include `customerId: true, discountPercent: true, customer: { select: { plate: true } }`.

- [ ] **Step 6: Page threads loyalty** — in `src/app/quartos/page.tsx` `Board()`, after building `data`, enrich occupied rooms that have a customer with their `availableTiers`. Import `availableTiers` from `@/server/data/loyalty`. For each occupied room whose `currentStay.customerId` is set, compute `const av = await availableTiers(customerId, stayId)` and attach `loyalty: { plate, visits: av.visits, tiers: av.tiers.map(t => ({ id: t.id, minVisits: t.minVisits, discountPercent: t.discountPercent })), appliedDiscount: stay.discountPercent }` onto that room's serialized object; non-occupied or no-customer rooms get `loyalty: null`. Also add `discountPercent` to the serialized `currentStay` (already partly present). Concretely, replace the `.map` with an `await Promise.all(rooms.map(async (r) => {...}))` and inside, when building the object, add:
```tsx
      let loyalty = null
      if (s?.customerId && s.customer?.plate) {
        const av = await availableTiers(s.customerId, s.id)
        loyalty = { plate: s.customer.plate, visits: av.visits, tiers: av.tiers.map((t) => ({ id: t.id, minVisits: t.minVisits, discountPercent: t.discountPercent })), appliedDiscount: s.discountPercent }
      }
```
and add `loyalty` + `discountPercent: s?.discountPercent ?? 0` to the returned object; put the `currentStay` `discountPercent` into the `currentStay` sub-object too. (Keep the existing `pricing`/`consumption` logic.)

- [ ] **Step 7: Room-grid — plate field, loyalty section, discounted breakdown** — edit `src/app/quartos/room-grid.tsx`:
  1. Extend the `Stay` type with `discountPercent: number` and add to `Room`: `loyalty: { plate: string; visits: number; tiers: { id: number; minVisits: number; discountPercent: number }[]; appliedDiscount: number } | null`.
  2. In `FreeActions`' form, add a plate input above "Hóspedes":
```tsx
        <div className="grid gap-1"><Label htmlFor="plate">Placa (opcional)</Label><Input id="plate" name="plate" placeholder="ABC1D23" className="uppercase" /></div>
```
  3. In `estimateStay`, apply the discount: after computing `base` from `computeStayAmount(...)`, `return base * (1 - stay.discountPercent / 100)` (add `discountPercent` to the `Stay` param usage). So the card/breakdown estimates reflect the discount.
  4. In `OccupiedPanel`, add a loyalty section ABOVE the "Fechamento" box, shown when `room.loyalty`:
```tsx
      {room.loyalty && (
        <section className="rounded-lg border p-3 text-sm">
          <div className="font-medium">Fidelidade — {room.loyalty.plate} · {room.loyalty.visits} visitas</div>
          {room.loyalty.appliedDiscount > 0 && <p className="text-emerald-600">Desconto aplicado: {room.loyalty.appliedDiscount}%</p>}
          {room.loyalty.appliedDiscount === 0 && room.loyalty.tiers.map((t) => <ApplyBenefit key={t.id} roomNumber={room.number} tier={t} />)}
        </section>
      )}
```
  5. Add the `ApplyBenefit` client component:
```tsx
function ApplyBenefit({ roomNumber, tier }: { roomNumber: string; tier: { id: number; discountPercent: number } }) {
  const [state, action] = useActionState<ActionState, FormData>(async () => applyBenefitAction(roomNumber, tier.id), { ok: false })
  return (
    <form action={action} className="mt-1">
      <Button size="sm" variant="secondary" type="submit">Aplicar {tier.discountPercent}%</Button>
      {state.error && <span className="ml-2 text-destructive text-xs">{state.error}</span>}
    </form>
  )
}
```
  6. Import `applyBenefitAction` from `./actions`.

- [ ] **Step 8: Verify**

Run:
```bash
pnpm exec tsc --noEmit
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test
pnpm build
```
Expected: tsc zero errors; all tests pass; build succeeds with `/quartos`. If a BigInt crosses to client, stringify at the page boundary (customerId stays server-side; only plate/visits/tier numbers reach the client).

- [ ] **Step 9: Commit**

```bash
git add src/lib/validation/stay.ts src/server/data/stays.ts src/server/data/rooms.ts src/app/quartos
git commit -m "feat(fidelidade): plate at check-in + apply-benefit at checkout"
```

---

## Task 3: `/fidelidade` tier config + nav (UI)

**Files:**
- Create: `src/app/fidelidade/actions.ts`, `src/app/fidelidade/page.tsx`, `src/app/fidelidade/tier-form.tsx`
- Modify: `src/components/app-nav.tsx`

**Interfaces:**
- Consumes: `listTiers`, `upsertTier`, `deleteTier` (Task 1).

- [ ] **Step 1: Actions** `src/app/fidelidade/actions.ts`:
```ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { upsertTier, deleteTier } from '@/server/data/loyalty'

export type ActionState = { ok: boolean; error?: string }
const tierSchema = z.object({ minVisits: z.coerce.number().int().min(1), discountPercent: z.coerce.number().int().min(1).max(100) })

export async function saveTierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = tierSchema.safeParse({ minVisits: fd.get('minVisits'), discountPercent: fd.get('discountPercent') })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await upsertTier(parsed.data) } catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/fidelidade')
  return { ok: true }
}
export async function deleteTierAction(id: number): Promise<ActionState> {
  try { await deleteTier(id) } catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro.' } }
  revalidatePath('/fidelidade')
  return { ok: true }
}
```

- [ ] **Step 2: Form** `src/app/fidelidade/tier-form.tsx`:
```tsx
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveTierAction, deleteTierAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

function Save() { const { pending } = useFormStatus(); return <Button size="sm" disabled={pending}>{pending ? '…' : 'Salvar'}</Button> }

export function TierForm() {
  const [state, action] = useActionState<ActionState, FormData>(saveTierAction, { ok: false })
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="minVisits" className="text-xs">Visitas</Label><Input id="minVisits" name="minVisits" type="number" min="1" className="w-24" required /></div>
      <div className="grid gap-1"><Label htmlFor="discountPercent" className="text-xs">Desconto %</Label><Input id="discountPercent" name="discountPercent" type="number" min="1" max="100" className="w-24" required /></div>
      <Save />
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-emerald-600">salvo</span>}
    </form>
  )
}

export function DeleteTier({ id }: { id: number }) {
  const [, action] = useActionState<ActionState, FormData>(async () => deleteTierAction(id), { ok: false })
  return <form action={action}><Button size="sm" variant="ghost" type="submit">remover</Button></form>
}
```

- [ ] **Step 3: Page** `src/app/fidelidade/page.tsx`:
```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listTiers } from '@/server/data/loyalty'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TierForm, DeleteTier } from './tier-form'

async function Loyalty() {
  await connection()
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'loyalty:manage')) redirect('/')
  const tiers = await listTiers()
  return (
    <div className="grid gap-6">
      <Card><CardHeader><CardTitle>Nova faixa</CardTitle></CardHeader><CardContent><TierForm /><p className="mt-2 text-xs text-muted-foreground">Ex.: 5 visitas → 50%, 10 visitas → 100%. Salvar de novo com as mesmas visitas atualiza o desconto.</p></CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Faixas de fidelidade</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Visitas</TableHead><TableHead>Desconto</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {tiers.map((t) => (
                <TableRow key={t.id}><TableCell>{t.minVisits}</TableCell><TableCell>{t.discountPercent}%</TableCell><TableCell><DeleteTier id={t.id} /></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function FidelidadePage() {
  return (
    <main className="mx-auto mt-8 max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Fidelidade</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}><Loyalty /></Suspense>
    </main>
  )
}
```

- [ ] **Step 4: Nav** — in `src/components/app-nav.tsx`, add a Fidelidade link for managers (in the manager block, next to Relatórios):
```tsx
        {isManager && <NavLink href="/fidelidade">Fidelidade</NavLink>}
```

- [ ] **Step 5: Verify**

Run:
```bash
pnpm exec tsc --noEmit
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test
pnpm build
```
Expected: tsc zero errors; all tests pass; build succeeds with `/fidelidade` in the route table.

- [ ] **Step 6: Commit**

```bash
git add src/app/fidelidade src/components/app-nav.tsx
git commit -m "feat(fidelidade): /fidelidade tier config page + nav"
```

---

## Self-Review (done)

- **Spec coverage:** `Customer.plate` + models + `stay.discountPercent` (T1); loyalty DAL tiers/plate/visits(exclude current)/available(earned−redeemed)/redeem(once) (T1); checkout applies discount to stay only (T1 Step 9 + test); plate at check-in + apply-benefit at checkout UI (T2); `/fidelidade` config + nav (T3); RBAC `loyalty:manage` (T1). Per-quarto / physical card / points / consumption-discount correctly out of scope. All spec sections mapped.
- **Placeholder scan:** none — real code/commands in every step.
- **Type consistency:** `customerByPlate/customerVisits/availableTiers/redeemTier` signatures consistent across DAL (T1), stays check-in (T2), actions (T2), page (T2). `availableTiers` returns `{ visits, tiers }` used consistently. `stay.discountPercent` (T1 schema) read in checkOut (T1) + rooms select (T2) + client `Stay` type (T2) + estimate. `loyalty:manage` added once (T1) used by DAL + page (T3). `applyBenefitAction(roomNumber, tierId)` consistent between actions (T2 Step 3) and `ApplyBenefit` (T2 Step 7).
- **Test DB note:** DB tests seed fixtures + clean in `beforeEach`; migration applied to `motelac_test` in T1 Step 2. Existing `stays.test.ts` check-in calls omit `plate` (optional) — stay green.
