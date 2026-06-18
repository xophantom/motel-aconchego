# Núcleo Operacional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurable tariff, a color-coded room board at `/quartos`, and modal check-in/check-out with duration-based billing (motel + hotel).

**Architecture:** Pure billing engine (client+server importable) → `server-only` DAL with authz inside → Server Actions + Zod → server components (Suspense + `connection()`) with shadcn client modals. Mutations revalidate via `revalidatePath`.

**Tech Stack:** Next 16, React 19, Prisma 7 (`@/generated/prisma/client`, adapter-pg), Auth.js v5, Zod, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-18-nucleo-operacional-design.md`

**Conventions:**
- Repo `/Users/leosperandio/Git/MotelAconchego`, branch from `main` (create `feat/operacional`).
- Prisma imports from `@/generated/prisma/client`. **No** `Co-Authored-By` trailers.
- DB-backed tests: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test <file>`. The test DB is EMPTY — tests must create their own fixtures (category/rate/room). Mock `server-only` and `@/server/session` as the base tests do.
- Start: `git checkout -b feat/operacional`.

---

## File Structure
```
src/lib/billing.ts                      # pure billing engine
src/lib/rbac.ts                         # +'tariff:manage' +'stay:manage' (modify)
src/lib/validation/tariff.ts            # zod
src/lib/validation/stay.ts             # zod
src/server/data/tariff.ts               # tariff DAL (manager)
src/server/data/rooms.ts                # room board read + setRoomStatus
src/server/data/stays.ts                # checkIn / checkOut
src/app/tarifas/actions.ts              # tariff server actions
src/app/tarifas/page.tsx                # tariff config (manager)
src/app/tarifas/rate-form.tsx           # client form
src/app/quartos/actions.ts              # checkIn/checkOut/setStatus actions
src/app/quartos/page.tsx                # board (server)
src/app/quartos/room-grid.tsx           # client grid + modals
src/app/page.tsx                        # +nav (modify)
tests/lib/billing.test.ts
tests/lib/rbac-ops.test.ts
tests/server/tariff.test.ts
tests/server/rooms.test.ts
tests/server/stays.test.ts
tests/app/quartos-actions.test.ts
```

---

## Task 1: Billing engine (pure, TDD)

**Files:** Create `src/lib/billing.ts`, `tests/lib/billing.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/billing.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeStayAmount, durationMinutes } from '@/lib/billing'

const baseCat = { minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 }
const rate = { basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 }
const at = (min: number) => new Date(2026, 0, 1, 0, min, 0)

describe('durationMinutes', () => {
  it('is elapsed minutes, never negative', () => {
    expect(durationMinutes(at(0), at(90))).toBe(90)
    expect(durationMinutes(at(90), at(0))).toBe(0)
  })
})

describe('computeStayAmount motel', () => {
  const motel = (checkInMin: number, checkOutMin: number, guests = 2) =>
    computeStayAmount({ billing: 'motel', ...baseCat, rate, checkIn: at(checkInMin), checkOut: at(checkOutMin), guests })

  it('within minimum period charges base', () => {
    expect(motel(0, 180)).toBe(75)
    expect(motel(0, 60)).toBe(75)
  })
  it('one started 30-min block over minimum adds one excess', () => {
    expect(motel(0, 181)).toBe(90)   // 75 + 1*15
    expect(motel(0, 210)).toBe(90)   // exactly +30 min
    expect(motel(0, 211)).toBe(105)  // 75 + 2*15
  })
  it('caps at the overnight price', () => {
    expect(motel(0, 600)).toBe(160)  // would be 75 + 14*15=285 -> capped 160
  })
  it('adds extra-guest price per guest beyond included', () => {
    expect(motel(0, 180, 3)).toBe(100) // 75 + 1*25
    expect(motel(0, 180, 4)).toBe(125)
  })
})

describe('computeStayAmount hotel', () => {
  const hotel = (checkInMin: number, checkOutMin: number, guests = 2) =>
    computeStayAmount({ billing: 'hotel', ...baseCat, rate, checkIn: at(checkInMin), checkOut: at(checkOutMin), guests })

  it('charges one daily for up to 24h', () => {
    expect(hotel(0, 60)).toBe(160)
    expect(hotel(0, 1440)).toBe(160)
  })
  it('charges another daily past 24h', () => {
    expect(hotel(0, 1441)).toBe(320)
    expect(hotel(0, 2880)).toBe(320)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/lib/billing.test.ts`
Expected: FAIL — cannot find `@/lib/billing`.

- [ ] **Step 3: Implement**

`src/lib/billing.ts`:
```ts
export type BillingMode = 'motel' | 'hotel'

export type BillingInput = {
  billing: BillingMode
  minPeriodMin: number
  maxPeriodMin: number
  includedGuests: number
  rate: {
    basePrice: number
    excessPrice30m: number
    overnightPrice: number
    extraGuestPrice: number
  }
  checkIn: Date
  checkOut: Date
  guests: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function durationMinutes(checkIn: Date, checkOut: Date): number {
  return Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 60000)
}

export function computeStayAmount(i: BillingInput): number {
  const dur = durationMinutes(i.checkIn, i.checkOut)
  let stay: number
  if (i.billing === 'hotel') {
    const days = Math.max(1, Math.ceil(dur / 1440))
    stay = days * i.rate.overnightPrice
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

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/lib/billing.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing.ts tests/lib/billing.test.ts
git commit -m "feat(billing): duration-based stay engine (motel + hotel)"
```

---

## Task 2: RBAC extension (TDD)

**Files:** Modify `src/lib/rbac.ts`; Create `tests/lib/rbac-ops.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/rbac-ops.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('operational permissions', () => {
  it('manager manages tariff and stays', () => {
    expect(can('manager', 'tariff:manage')).toBe(true)
    expect(can('manager', 'stay:manage')).toBe(true)
  })
  it('reception manages stays but not tariff', () => {
    expect(can('reception', 'stay:manage')).toBe(true)
    expect(can('reception', 'tariff:manage')).toBe(false)
  })
  it('housekeeper does neither', () => {
    expect(can('housekeeper', 'stay:manage')).toBe(false)
    expect(can('housekeeper', 'tariff:manage')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/lib/rbac-ops.test.ts`
Expected: FAIL — `'tariff:manage'` not assignable to `Action`.

- [ ] **Step 3: Implement** — replace the contents of `src/lib/rbac.ts`:
```ts
import type { EmployeeRole } from '@/generated/prisma/client'

export type Action = 'users:manage' | 'cash:withdraw' | 'room:status' | 'tariff:manage' | 'stay:manage'

const MATRIX: Record<EmployeeRole, Action[]> = {
  manager:     ['users:manage', 'cash:withdraw', 'room:status', 'tariff:manage', 'stay:manage'],
  reception:   ['cash:withdraw', 'room:status', 'stay:manage'],
  housekeeper: ['room:status'],
}

export function can(role: EmployeeRole, action: Action): boolean {
  return MATRIX[role]?.includes(action) ?? false
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/lib/rbac-ops.test.ts tests/lib/rbac.test.ts`
Expected: PASS (new + original rbac tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rbac.ts tests/lib/rbac-ops.test.ts
git commit -m "feat(rbac): tariff:manage and stay:manage actions"
```

---

## Task 3: Tariff DAL (TDD)

**Files:** Create `src/lib/validation/tariff.ts`, `src/server/data/tariff.ts`, `tests/server/tariff.test.ts`

- [ ] **Step 1: Write validation** `src/lib/validation/tariff.ts`:
```ts
import { z } from 'zod'

export const updateCategorySchema = z.object({
  billing: z.enum(['motel', 'hotel']),
  minPeriodMin: z.coerce.number().int().min(0),
  maxPeriodMin: z.coerce.number().int().min(0),
  includedGuests: z.coerce.number().int().min(1),
})

export const updateRateSchema = z.object({
  day: z.enum(['normal', 'special']),
  basePrice: z.coerce.number().min(0),
  excessPrice30m: z.coerce.number().min(0),
  overnightPrice: z.coerce.number().min(0),
  extraGuestPrice: z.coerce.number().min(0),
})

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
export type UpdateRateInput = z.infer<typeof updateRateSchema>
```

- [ ] **Step 2: Write the failing test** `tests/server/tariff.test.ts`:
```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listCategoriesWithRates, updateCategory, updateRate } from '@/server/data/tariff'

async function fixture() {
  const cat = await db.roomCategory.create({
    data: { code: 'A', description: 'Suíte', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 },
  })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'special', basePrice: 85, excessPrice30m: 15, overnightPrice: 180, extraGuestPrice: 25 } })
  return cat
}

beforeEach(async () => {
  await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('tariff DAL', () => {
  it('manager lists categories with both rates', async () => {
    await fixture()
    const cats = await listCategoriesWithRates()
    expect(cats).toHaveLength(1)
    expect(cats[0].rates).toHaveLength(2)
  })
  it('non-manager is forbidden', async () => {
    await fixture()
    session.current = { id: 2, name: 'R', role: 'reception' }
    await expect(listCategoriesWithRates()).rejects.toThrow(/forbidden/i)
  })
  it('updates a category and a rate', async () => {
    const cat = await fixture()
    await updateCategory(cat.id, { billing: 'hotel', minPeriodMin: 0, maxPeriodMin: 1440, includedGuests: 2 })
    await updateRate(cat.id, { day: 'normal', basePrice: 80, excessPrice30m: 20, overnightPrice: 200, extraGuestPrice: 30 })
    const fresh = await db.roomCategory.findUniqueOrThrow({ where: { id: cat.id }, include: { rates: true } })
    expect(fresh.billing).toBe('hotel')
    const normal = fresh.rates.find((r) => r.day === 'normal')!
    expect(Number(normal.basePrice)).toBe(80)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/tariff.test.ts`
Expected: FAIL — module `@/server/data/tariff` not found.

- [ ] **Step 4: Implement** `src/server/data/tariff.ts`:
```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import type { UpdateCategoryInput, UpdateRateInput } from '@/lib/validation/tariff'

async function requireTariffManager() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'tariff:manage')) throw new Error('Forbidden')
  return me
}

export async function listCategoriesWithRates() {
  await requireTariffManager()
  return db.roomCategory.findMany({ orderBy: { code: 'asc' }, include: { rates: { orderBy: { day: 'asc' } } } })
}

export async function updateCategory(id: number, input: UpdateCategoryInput) {
  await requireTariffManager()
  return db.roomCategory.update({ where: { id }, data: input })
}

export async function updateRate(categoryId: number, input: UpdateRateInput) {
  await requireTariffManager()
  const { day, ...prices } = input
  return db.rate.update({ where: { categoryId_day: { categoryId, day } }, data: prices })
}

// Internal read (no separate authz) — used by the stays DAL at checkout.
export async function getCategoryWithRate(categoryId: number, day: 'normal' | 'special') {
  const category = await db.roomCategory.findUniqueOrThrow({ where: { id: categoryId } })
  const rate = await db.rate.findUniqueOrThrow({ where: { categoryId_day: { categoryId, day } } })
  return { category, rate }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/tariff.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/tariff.ts src/server/data/tariff.ts tests/server/tariff.test.ts
git commit -m "feat(tariff): DAL for categories + rates (manager)"
```

---

## Task 4: Tariff actions + `/tarifas` page (UI)

**Files:** Create `src/app/tarifas/actions.ts`, `src/app/tarifas/page.tsx`, `src/app/tarifas/rate-form.tsx`

- [ ] **Step 1: Server actions** `src/app/tarifas/actions.ts`:
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { updateCategorySchema, updateRateSchema } from '@/lib/validation/tariff'
import * as tariff from '@/server/data/tariff'

export type ActionState = { ok: boolean; error?: string }

export async function updateCategoryAction(categoryId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = updateCategorySchema.safeParse({
    billing: fd.get('billing'), minPeriodMin: fd.get('minPeriodMin'),
    maxPeriodMin: fd.get('maxPeriodMin'), includedGuests: fd.get('includedGuests'),
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await tariff.updateCategory(categoryId, parsed.data) }
  catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/tarifas')
  return { ok: true }
}

export async function updateRateAction(categoryId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = updateRateSchema.safeParse({
    day: fd.get('day'), basePrice: fd.get('basePrice'), excessPrice30m: fd.get('excessPrice30m'),
    overnightPrice: fd.get('overnightPrice'), extraGuestPrice: fd.get('extraGuestPrice'),
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await tariff.updateRate(categoryId, parsed.data) }
  catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/tarifas')
  return { ok: true }
}
```

- [ ] **Step 2: Client rate form** `src/app/tarifas/rate-form.tsx`:
```tsx
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { updateRateAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

type Rate = { day: 'normal' | 'special'; basePrice: string; excessPrice30m: string; overnightPrice: string; extraGuestPrice: string }

function Save() {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>
}

export function RateForm({ categoryId, rate }: { categoryId: number; rate: Rate }) {
  const action = updateRateAction.bind(null, categoryId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  const label = rate.day === 'normal' ? 'Semana' : 'Fim de semana'
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="day" value={rate.day} />
      <div className="text-sm font-medium w-28">{label}</div>
      <Field name="basePrice" label="Base" defaultValue={rate.basePrice} />
      <Field name="excessPrice30m" label="Exc./30m" defaultValue={rate.excessPrice30m} />
      <Field name="overnightPrice" label="Pernoite" defaultValue={rate.overnightPrice} />
      <Field name="extraGuestPrice" label="Pessoa+" defaultValue={rate.extraGuestPrice} />
      <Save />
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-emerald-600">ok</span>}
    </form>
  )
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type="number" step="0.01" defaultValue={defaultValue} className="w-24 h-8" />
    </div>
  )
}
```

- [ ] **Step 3: Page** `src/app/tarifas/page.tsx`:
```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listCategoriesWithRates } from '@/server/data/tariff'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RateForm } from './rate-form'

async function TariffList() {
  await connection()
  let cats
  try { cats = await listCategoriesWithRates() } catch { redirect('/') }
  return (
    <div className="grid gap-4">
      {cats.map((c) => (
        <Card key={c.id}>
          <CardHeader><CardTitle>{c.code} — {c.description} <span className="text-muted-foreground text-sm">({c.billing})</span></CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {c.rates.map((r) => (
              <RateForm key={r.day} categoryId={c.id} rate={{
                day: r.day, basePrice: String(r.basePrice), excessPrice30m: String(r.excessPrice30m),
                overnightPrice: String(r.overnightPrice), extraGuestPrice: String(r.extraGuestPrice),
              }} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function TarifasPage() {
  return (
    <main className="mx-auto mt-10 max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Tarifas</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <TariffList />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit` (zero errors) then `pnpm build` (succeeds).

- [ ] **Step 5: Commit**

```bash
git add src/app/tarifas
git commit -m "feat(tariff): /tarifas config page (manager)"
```

---

## Task 5: Rooms DAL (TDD)

**Files:** Create `src/server/data/rooms.ts`, `tests/server/rooms.test.ts`

- [ ] **Step 1: Write the failing test** `tests/server/rooms.test.ts`:
```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listRoomsWithCurrentStay, setRoomStatus } from '@/server/data/rooms'

beforeEach(async () => {
  await db.stay.deleteMany(); await db.room.deleteMany(); await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  await db.room.create({ data: { number: '01', status: 'free' } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('rooms DAL', () => {
  it('lists rooms for any logged-in user', async () => {
    const rooms = await listRoomsWithCurrentStay()
    expect(rooms).toHaveLength(1)
    expect(rooms[0].number).toBe('01')
  })
  it('reception can set maintenance with a reason', async () => {
    const r = await setRoomStatus('01', 'maintenance', 'chuveiro')
    expect(r.status).toBe('maintenance')
    expect(r.maintenanceReason).toBe('chuveiro')
  })
  it('maintenance without reason is rejected', async () => {
    await expect(setRoomStatus('01', 'maintenance')).rejects.toThrow(/reason/i)
  })
  it('housekeeper can only set cleaning/free', async () => {
    session.current = { id: 2, name: 'Cam', role: 'housekeeper' }
    await db.room.update({ where: { number: '01' }, data: { status: 'cleaning' } })
    const freed = await setRoomStatus('01', 'free')
    expect(freed.status).toBe('free')
    await expect(setRoomStatus('01', 'maintenance', 'x')).rejects.toThrow(/forbidden/i)
  })
  it('cannot set occupied directly', async () => {
    await expect(setRoomStatus('01', 'occupied')).rejects.toThrow(/check-in/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/rooms.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `src/server/data/rooms.ts`:
```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import type { RoomStatus } from '@/generated/prisma/client'

export async function listRoomsWithCurrentStay() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  return db.room.findMany({
    where: { active: true },
    orderBy: { number: 'asc' },
    select: {
      number: true,
      status: true,
      maintenanceReason: true,
      category: { select: { code: true, description: true } },
      currentStay: { select: { id: true, checkIn: true, guests: true, day: true } },
    },
  })
}

export async function setRoomStatus(number: string, status: RoomStatus, reason?: string) {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  if (status === 'occupied') throw new Error('Use check-in to occupy a room')
  if (me.role === 'housekeeper' && status !== 'free' && status !== 'cleaning') {
    throw new Error('Forbidden')
  }
  if (status === 'maintenance' && !reason) throw new Error('Maintenance requires a reason')
  return db.room.update({
    where: { number },
    data: { status, maintenanceReason: status === 'maintenance' ? reason : null },
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/rooms.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/data/rooms.ts tests/server/rooms.test.ts
git commit -m "feat(rooms): board read + setRoomStatus with role transitions"
```

---

## Task 6: Stays DAL — check-in / check-out (TDD)

**Files:** Create `src/lib/validation/stay.ts`, `src/server/data/stays.ts`, `tests/server/stays.test.ts`

- [ ] **Step 1: Validation** `src/lib/validation/stay.ts`:
```ts
import { z } from 'zod'

export const checkInSchema = z.object({
  roomNumber: z.string().min(1),
  day: z.enum(['normal', 'special']),
  guests: z.coerce.number().int().min(1),
  prepaidAmount: z.coerce.number().min(0).default(0),
})
export type CheckInInput = z.infer<typeof checkInSchema>
```

- [ ] **Step 2: Write the failing test** `tests/server/stays.test.ts`:
```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkIn, checkOut } from '@/server/data/stays'

let categoryId: number
beforeEach(async () => {
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  categoryId = cat.id
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('check-in', () => {
  it('opens a stay and marks the room occupied', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    expect(stay.status).toBe('open')
    const room = await db.room.findUniqueOrThrow({ where: { number: '01' } })
    expect(room.status).toBe('occupied')
    expect(room.currentStayId).toBe(stay.id)
  })
  it('rejects check-in on a non-free room', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await expect(checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })).rejects.toThrow(/not free/i)
  })
  it('records a cash movement for the prepaid amount', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 50 })
    const movs = await db.cashMovement.findMany()
    expect(movs).toHaveLength(1)
    expect(Number(movs[0].amount)).toBe(50)
  })
  it('housekeeper cannot check in', async () => {
    session.current = { id: 1, name: 'Cam', role: 'housekeeper' }
    await expect(checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })).rejects.toThrow(/forbidden/i)
  })
})

describe('check-out', () => {
  it('closes the stay, computes amount, frees the room to cleaning, records balance', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 30 })
    // backdate check-in by 30 min so duration <= minPeriod -> base 75
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
    const { stayAmount } = await checkOut('01')
    expect(stayAmount).toBe(75)
    const room = await db.room.findUniqueOrThrow({ where: { number: '01' } })
    expect(room.status).toBe('cleaning')
    expect(room.currentStayId).toBeNull()
    const closed = await db.stay.findUniqueOrThrow({ where: { id: stay.id } })
    expect(closed.status).toBe('closed')
    expect(Number(closed.stayAmount)).toBe(75)
    // balance movement = stay 75 - prepaid 30 = 45 (plus the 30 prepaid movement)
    const movs = await db.cashMovement.findMany({ orderBy: { id: 'asc' } })
    expect(movs.map((m) => Number(m.amount))).toEqual([30, 45])
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/stays.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement** `src/server/data/stays.ts`:
```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { computeStayAmount } from '@/lib/billing'
import type { CheckInInput } from '@/lib/validation/stay'

async function requireOps() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:manage')) throw new Error('Forbidden')
  return me
}

export async function checkIn(input: CheckInInput) {
  const me = await requireOps()
  const room = await db.room.findUniqueOrThrow({ where: { number: input.roomNumber } })
  if (room.status !== 'free') throw new Error('Room is not free')
  if (!room.categoryId) throw new Error('Room has no category')
  return db.$transaction(async (tx) => {
    const stay = await tx.stay.create({
      data: {
        type: 'room',
        roomNumber: input.roomNumber,
        categoryId: room.categoryId,
        checkIn: new Date(),
        day: input.day,
        guests: input.guests,
        prepaidAmount: input.prepaidAmount,
        status: 'open',
        entryEmployeeId: me.id,
      },
    })
    await tx.room.update({ where: { number: input.roomNumber }, data: { status: 'occupied', currentStayId: stay.id } })
    if (input.prepaidAmount > 0) {
      await tx.cashMovement.create({
        data: { type: 'stay', stayId: stay.id, amount: input.prepaidAmount, employeeId: me.id, occurredAt: new Date(), description: `Antecipado quarto ${input.roomNumber}` },
      })
    }
    return stay
  })
}

export async function checkOut(roomNumber: string) {
  const me = await requireOps()
  const room = await db.room.findUniqueOrThrow({ where: { number: roomNumber }, include: { currentStay: true, category: true } })
  if (room.status !== 'occupied' || !room.currentStay || !room.category) throw new Error('Room is not occupied')
  const stay = room.currentStay
  const cat = room.category
  const rate = await db.rate.findUniqueOrThrow({ where: { categoryId_day: { categoryId: cat.id, day: stay.day } } })
  const checkOutAt = new Date()
  const stayAmount = computeStayAmount({
    billing: cat.billing,
    minPeriodMin: cat.minPeriodMin,
    maxPeriodMin: cat.maxPeriodMin,
    includedGuests: cat.includedGuests,
    rate: {
      basePrice: Number(rate.basePrice),
      excessPrice30m: Number(rate.excessPrice30m),
      overnightPrice: Number(rate.overnightPrice),
      extraGuestPrice: Number(rate.extraGuestPrice),
    },
    checkIn: stay.checkIn,
    checkOut: checkOutAt,
    guests: stay.guests,
  })
  const balance = stayAmount + Number(stay.consumptionAmount) - Number(stay.prepaidAmount)
  await db.$transaction(async (tx) => {
    await tx.stay.update({ where: { id: stay.id }, data: { checkOut: checkOutAt, stayAmount, status: 'closed', paymentEmployeeId: me.id } })
    await tx.cashMovement.create({
      data: { type: 'stay', stayId: stay.id, amount: balance, employeeId: me.id, occurredAt: checkOutAt, description: `Saída quarto ${roomNumber}` },
    })
    await tx.room.update({ where: { number: roomNumber }, data: { status: 'cleaning', currentStayId: null } })
  })
  return { stayAmount, balance }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/stays.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/stay.ts src/server/data/stays.ts tests/server/stays.test.ts
git commit -m "feat(stays): check-in/check-out with duration billing + cash movements"
```

---

## Task 7: Quartos server actions (TDD)

**Files:** Create `src/app/quartos/actions.ts`, `tests/app/quartos-actions.test.ts`

- [ ] **Step 1: Write the failing test** `tests/app/quartos-actions.test.ts`:
```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkInAction, setRoomStatusAction } from '@/app/quartos/actions'

beforeEach(async () => {
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

function form(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('quartos actions', () => {
  it('checkInAction occupies the room', async () => {
    const res = await checkInAction({ ok: false }, form({ roomNumber: '01', day: 'normal', guests: '2', prepaidAmount: '0' }))
    expect(res.ok).toBe(true)
    expect((await db.room.findUniqueOrThrow({ where: { number: '01' } })).status).toBe('occupied')
  })
  it('setRoomStatusAction maintenance requires reason', async () => {
    const res = await setRoomStatusAction({ ok: false }, form({ number: '01', status: 'maintenance' }))
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/app/quartos-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `src/app/quartos/actions.ts`:
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { checkInSchema } from '@/lib/validation/stay'
import { z } from 'zod'
import * as stays from '@/server/data/stays'
import { setRoomStatus } from '@/server/data/rooms'
import type { RoomStatus } from '@/generated/prisma/client'

export type ActionState = { ok: boolean; error?: string }

function mapErr(e: unknown): string {
  if (e instanceof Error) {
    if (/forbidden/i.test(e.message)) return 'Sem permissão.'
    if (/not free/i.test(e.message)) return 'Quarto não está livre.'
    if (/not occupied/i.test(e.message)) return 'Quarto não está ocupado.'
    if (/reason/i.test(e.message)) return 'Manutenção exige um motivo.'
  }
  return 'Erro ao processar.'
}

export async function checkInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = checkInSchema.safeParse({
    roomNumber: fd.get('roomNumber'), day: fd.get('day'), guests: fd.get('guests'), prepaidAmount: fd.get('prepaidAmount') ?? 0,
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await stays.checkIn(parsed.data) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function checkOutAction(roomNumber: string): Promise<ActionState> {
  try { await stays.checkOut(roomNumber) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

const statusSchema = z.object({ number: z.string().min(1), status: z.enum(['free', 'cleaning', 'maintenance']), reason: z.string().optional() })

export async function setRoomStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = statusSchema.safeParse({ number: fd.get('number'), status: fd.get('status'), reason: fd.get('reason') ?? undefined })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await setRoomStatus(parsed.data.number, parsed.data.status as RoomStatus, parsed.data.reason) }
  catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/app/quartos-actions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/quartos/actions.ts tests/app/quartos-actions.test.ts
git commit -m "feat(quartos): check-in/out + room-status server actions"
```

---

## Task 8: `/quartos` board + grid + modals (UI)

**Files:** Create `src/app/quartos/page.tsx`, `src/app/quartos/room-grid.tsx`

- [ ] **Step 1: Board page** `src/app/quartos/page.tsx`:
```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listRoomsWithCurrentStay } from '@/server/data/rooms'
import { RoomGrid } from './room-grid'

async function Board() {
  await connection()
  let rooms
  try { rooms = await listRoomsWithCurrentStay() } catch { redirect('/login') }
  const data = rooms.map((r) => ({
    number: r.number,
    status: r.status,
    maintenanceReason: r.maintenanceReason,
    category: r.category ? { code: r.category.code, description: r.category.description } : null,
    currentStay: r.currentStay ? { checkIn: r.currentStay.checkIn.toISOString(), guests: r.currentStay.guests, day: r.currentStay.day } : null,
  }))
  return <RoomGrid rooms={data} />
}

export default function QuartosPage() {
  return (
    <main className="mx-auto mt-8 max-w-5xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Quartos</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Board />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 2: Grid + modals** `src/app/quartos/room-grid.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { computeStayAmount } from '@/lib/billing'
import { checkInAction, checkOutAction, setRoomStatusAction, type ActionState } from './actions'

type Room = {
  number: string
  status: 'free' | 'occupied' | 'cleaning' | 'maintenance'
  maintenanceReason: string | null
  category: { code: string; description: string } | null
  currentStay: { checkIn: string; guests: number; day: 'normal' | 'special' } | null
}

const STATUS_LABEL: Record<Room['status'], string> = { free: 'LIVRE', occupied: 'OCUPADO', cleaning: 'LIMPEZA', maintenance: 'MANUT.' }
const STATUS_CLASS: Record<Room['status'], string> = {
  free: 'bg-emerald-600 text-white',
  occupied: 'bg-red-600 text-white',
  cleaning: 'bg-amber-500 text-black',
  maintenance: 'bg-stone-500 text-white',
}

export function RoomGrid({ rooms }: { rooms: Room[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {rooms.map((r) => <RoomCard key={r.number} room={r} />)}
    </div>
  )
}

function RoomCard({ room }: { room: Room }) {
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
        {room.status === 'occupied' && <CheckOutPanel room={room} onDone={() => setOpen(false)} />}
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

function CheckOutPanel({ room, onDone }: { room: Room; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])
  const [state, formAction] = useActionState<ActionState, FormData>(
    async () => checkOutAction(room.number), { ok: false },
  )
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  const stay = room.currentStay!
  const elapsedMin = Math.max(0, Math.round((now - new Date(stay.checkIn).getTime()) / 60000))
  return (
    <div className="grid gap-3">
      <p className="text-sm">Decorrido: <strong>{Math.floor(elapsedMin / 60)}h{String(elapsedMin % 60).padStart(2, '0')}m</strong> · {stay.guests} hósp. · {stay.day === 'special' ? 'fim de semana' : 'semana'}</p>
      <p className="text-xs text-muted-foreground">O valor final é calculado no servidor ao confirmar a saída.</p>
      <form action={formAction}>
        <Submit>Confirmar saída</Submit>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      </form>
    </div>
  )
}

function SimpleStatus({ number, status, label, onDone }: { number: string; status: 'free' | 'cleaning'; label: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(setRoomStatusAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <form action={action}>
      <input type="hidden" name="number" value={number} />
      <input type="hidden" name="status" value={status} />
      <Submit>{label}</Submit>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}

function MaintenanceForm({ number, onDone }: { number: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(setRoomStatusAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <form action={action} className="grid gap-2 border-t pt-3">
      <input type="hidden" name="number" value={number} />
      <input type="hidden" name="status" value="maintenance" />
      <Label htmlFor="reason" className="text-xs">Pôr em manutenção (motivo)</Label>
      <div className="flex gap-2">
        <Input id="reason" name="reason" placeholder="motivo" />
        <Button variant="outline" type="submit">Manutenção</Button>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}
```
> The live elapsed time updates each minute; the authoritative amount is computed server-side at checkout (avoids client/server drift). `computeStayAmount` is imported to keep the door open for an on-screen estimate later; if `tsc` flags it as unused, remove the import.

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit` (zero errors) then `pnpm build` (succeeds).

- [ ] **Step 4: Commit**

```bash
git add src/app/quartos/page.tsx src/app/quartos/room-grid.tsx
git commit -m "feat(quartos): color board + check-in/out/status modals"
```

---

## Task 9: Home navigation

**Files:** Modify `src/app/page.tsx`

- [ ] **Step 1: Add nav links** to the existing `HomeContent` nav (keep `connection()`+Suspense structure and sign-out). The nav should include, in order: a `Button asChild variant="link"` link to `/quartos` ("Painel"); for managers only, links to `/tarifas` ("Tarifas") and `/users` ("Funcionários"); the existing sign-out; and `<ModeToggle />`. Example nav block:
```tsx
<nav className="mt-4 flex flex-wrap items-center gap-3">
  <Button asChild variant="link"><a href="/quartos">Painel</a></Button>
  {me?.role === 'manager' && <Button asChild variant="link"><a href="/tarifas">Tarifas</a></Button>}
  {me?.role === 'manager' && <Button asChild variant="link"><a href="/users">Funcionários</a></Button>}
  <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
    <Button variant="ghost">Sair</Button>
  </form>
  <ModeToggle />
</nav>
```
(Keep existing imports; ensure `Button` and `ModeToggle` are imported.)

- [ ] **Step 2: Verify full suite + build**

Run:
```bash
pnpm exec tsc --noEmit
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test
pnpm build
```
Expected: tsc zero errors; all tests pass (base 22 + billing + rbac-ops + tariff + rooms + stays + quartos-actions); build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): nav to painel, tarifas, funcionários"
```

---

## Self-Review (done)

- **Spec coverage:** billing engine (T1), RBAC tariff/stay (T2), tariff DAL+page (T3/T4), rooms DAL incl. housekeeper limits (T5), check-in/out duration billing + cash movements + payment operator (T6), quartos actions (T7), `/quartos` color grid + modals + live elapsed (T8), home nav (T9). day_type manual (check-in form), hotel mode (engine + category.billing), modal flow (T8), tariff CRUD (T4). All spec sections mapped.
- **Placeholder scan:** none — every step has real code/commands.
- **Type consistency:** `computeStayAmount`/`BillingInput` consistent (T1, T6, T8); `Action` union extended once (T2) and used in DAL (T3/T5/T6); `ActionState` shared per route; `checkInSchema`/`CheckInInput` consistent (T6 used by T7); Prisma compound key `categoryId_day` used consistently (T3, T6); `setRoomStatus(number, status, reason?)` signature consistent (T5, T7).
- **Test DB note:** every DB-backed test seeds its own fixtures (test DB is empty) and cleans up in `beforeEach`. Run order independent via `fileParallelism: false` (already configured).
