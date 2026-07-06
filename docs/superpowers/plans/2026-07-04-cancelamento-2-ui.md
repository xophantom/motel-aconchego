# Cancelamento 2 — Board flag + Actions + Modal UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface cancel entrada / cancel última saída in the room modal — an occupied room gets "Cancelar entrada"; a free/cleaning room that has a reopenable closed stay gets "Cancelar última saída" — each behind a mandatory-reason mini-form, visible only when the operator may cancel now.

**Architecture:** `listRoomsWithCurrentStay` gains a `lastClosedStayId` per non-occupied room; a `canCancelNow()` DAL helper tells the board whether the operator may cancel. Two server actions wrap the slice-1 DAL. `room-grid.tsx` renders the mini-forms. Slice 2 of 2 (spec `docs/superpowers/specs/2026-07-03-cancelamento-design.md`); depends on slice 1.

**Tech Stack:** Next.js 16 (server + client components, server actions), Prisma 7, Zod, Vitest.

## Global Constraints

- **Reads via DAL**; **mutations via server actions + Zod** (reason required); server re-validates the window regardless of UI.
- **`canCancelNow()`**: `true` iff the user has `stay:cancel` AND (is manager OR a shift is currently open).
- **`lastClosedStayId`**: for a non-occupied room (`free`/`cleaning`), the id of the most recent `closed` room stay (reopenable); `null` otherwise.
- **Tests:** `pnpm test`. Mock `server-only` + `@/server/session`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.

---

### Task 1: Board data — `lastClosedStayId` + `canCancelNow()`

**Files:**
- Modify: `src/server/data/rooms.ts` (`listRoomsWithCurrentStay`)
- Modify: `src/server/data/stays.ts` (add `canCancelNow`)
- Test: `tests/server/cancel-board.test.ts`

**Interfaces:**
- Produces: each room from `listRoomsWithCurrentStay` gains `lastClosedStayId: bigint | null`; new `export async function canCancelNow(): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/cancel-board.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listRoomsWithCurrentStay } from '@/server/data/rooms'
import { canCancelNow, checkIn, checkOut } from '@/server/data/stays'
import { openShift } from '@/server/data/shifts'

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.shift.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('board cancel data', () => {
  it('lastClosedStayId points at the most recent closed stay of a freed room', async () => {
    await openShift({ openingBalance: 0 })
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
    await checkOut('01') // room now 'cleaning'
    const rooms = await listRoomsWithCurrentStay()
    const r01 = rooms.find((r) => r.number === '01')!
    expect(r01.lastClosedStayId).toBe(stay.id)
  })

  it('lastClosedStayId is null for an occupied room and for a never-used room', async () => {
    await openShift({ openingBalance: 0 })
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const rooms = await listRoomsWithCurrentStay()
    expect(rooms.find((r) => r.number === '01')!.lastClosedStayId).toBeNull()
  })

  it('canCancelNow: reception needs an open shift; manager always; housekeeper never', async () => {
    expect(await canCancelNow()).toBe(false) // reception, no shift
    await openShift({ openingBalance: 0 })
    expect(await canCancelNow()).toBe(true)  // reception, shift open
    session.current = { id: 1, name: 'M', role: 'manager' }
    await db.shift.updateMany({ data: { closedAt: new Date() } })
    expect(await canCancelNow()).toBe(true)  // manager, shift closed
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    expect(await canCancelNow()).toBe(false)
  })
})
```

Run: `pnpm test tests/server/cancel-board.test.ts` → FAIL.

- [ ] **Step 2: Add `lastClosedStayId` to `listRoomsWithCurrentStay`**

In `src/server/data/rooms.ts`, replace the `return db.room.findMany({...})` in `listRoomsWithCurrentStay` with a captured result + enrichment:

```ts
  const rooms = await db.room.findMany({
    where: { active: true },
    orderBy: { number: 'asc' },
    select: {
      number: true,
      status: true,
      maintenanceReason: true,
      category: { select: { code: true, description: true } },
      currentStay: { select: { id: true, checkIn: true, guests: true, day: true, chargeMode: true, categoryId: true, prepaidAmount: true, consumptionAmount: true, customerId: true, discountPercent: true, customer: { select: { plate: true } } } },
    },
  })
  const reopenNumbers = rooms.filter((r) => r.status === 'free' || r.status === 'cleaning').map((r) => r.number)
  const lastClosed = reopenNumbers.length
    ? await db.stay.findMany({
        where: { status: 'closed', type: 'room', roomNumber: { in: reopenNumbers } },
        orderBy: [{ roomNumber: 'asc' }, { checkOut: 'desc' }],
        distinct: ['roomNumber'],
        select: { id: true, roomNumber: true },
      })
    : []
  const lastByRoom = new Map(lastClosed.map((s) => [s.roomNumber!, s.id]))
  return rooms.map((r) => ({
    ...r,
    lastClosedStayId: (r.status === 'free' || r.status === 'cleaning') ? (lastByRoom.get(r.number) ?? null) : null,
  }))
```

- [ ] **Step 3: Add `canCancelNow` to `stays.ts`**

Append to `src/server/data/stays.ts`:

```ts
export async function canCancelNow(): Promise<boolean> {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:cancel')) return false
  if (me.role === 'manager') return true
  return !!(await getOpenShiftFor(new Date()))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/server/cancel-board.test.ts` → PASS. Then `pnpm test tests/server/rooms.test.ts` → still PASS (the added field doesn't break existing assertions).

- [ ] **Step 5: Commit**

```bash
git add src/server/data/rooms.ts src/server/data/stays.ts tests/server/cancel-board.test.ts
git commit -m "feat(cancel): board lastClosedStayId + canCancelNow"
```

---

### Task 2: Server actions

**Files:**
- Modify: `src/app/quartos/actions.ts`
- Test: `tests/app/cancel-actions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function cancelCheckInAction(roomNumber: string, _prev: ActionState, fd: FormData): Promise<ActionState>
  export async function cancelCheckOutAction(roomNumber: string, _prev: ActionState, fd: FormData): Promise<ActionState>
  ```
  `mapErr` gains: `shift closed` → "Caixa fechado — só o gerente cancela.", `room reoccupied` → "Quarto já foi reocupado.", `no closed stay` → "Nada a cancelar.", `reason required` → "Informe o motivo.".

- [ ] **Step 1: Write the failing test**

Create `tests/app/cancel-actions.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkIn } from '@/server/data/stays'
import { openShift } from '@/server/data/shifts'
import { cancelCheckInAction, cancelCheckOutAction } from '@/app/quartos/actions'

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const k in o) f.set(k, o[k]); return f }

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.shift.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
  await openShift({ openingBalance: 0 })
})

describe('cancel actions', () => {
  it('requires a reason', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const r = await cancelCheckInAction('01', { ok: false }, fd({ reason: '' }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/motivo/i)
  })

  it('cancelCheckInAction cancels with a reason', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const r = await cancelCheckInAction('01', { ok: false }, fd({ reason: 'engano' }))
    expect(r.ok).toBe(true)
    expect((await db.room.findUniqueOrThrow({ where: { number: '01' } })).status).toBe('free')
  })

  it('maps "no closed stay" to a friendly message', async () => {
    const r = await cancelCheckOutAction('01', { ok: false }, fd({ reason: 'x' }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/nada a cancelar/i)
  })
})
```

Run: `pnpm test tests/app/cancel-actions.test.ts` → FAIL.

- [ ] **Step 2: Add the actions + mapErr cases**

In `src/app/quartos/actions.ts`, extend `mapErr` (inside the `if (e instanceof Error)` block, before the final `return`):

```ts
    if (/shift closed/i.test(e.message)) return 'Caixa fechado — só o gerente cancela.'
    if (/room reoccupied/i.test(e.message)) return 'Quarto já foi reocupado.'
    if (/no closed stay/i.test(e.message)) return 'Nada a cancelar.'
    if (/reason required/i.test(e.message)) return 'Informe o motivo.'
```

Add the actions (and `import { z } from 'zod'` already present):

```ts
const cancelSchema = z.object({ reason: z.string().trim().min(1) })

export async function cancelCheckInAction(roomNumber: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = cancelSchema.safeParse({ reason: fd.get('reason') })
  if (!parsed.success) return { ok: false, error: 'Informe o motivo.' }
  try { await stays.cancelCheckIn(roomNumber, parsed.data.reason) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function cancelCheckOutAction(roomNumber: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = cancelSchema.safeParse({ reason: fd.get('reason') })
  if (!parsed.success) return { ok: false, error: 'Informe o motivo.' }
  try { await stays.cancelCheckOut(roomNumber, parsed.data.reason) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/app/cancel-actions.test.ts` → PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add src/app/quartos/actions.ts tests/app/cancel-actions.test.ts
git commit -m "feat(cancel): cancelCheckIn/Out server actions + error mapping"
```

---

### Task 3: Modal UI + board wiring

**Files:**
- Modify: `src/app/quartos/room-grid.tsx`
- Modify: `src/app/quartos/page.tsx`

**Interfaces:**
- Consumes: `cancelCheckInAction`, `cancelCheckOutAction`, `canCancelNow`.
- Produces: `RoomGrid` accepts a `canCancel: boolean` prop; the `Room` type gains `lastClosedStayId: string | null`; occupied rooms show "Cancelar entrada", free/cleaning rooms with a reopenable stay show "Cancelar última saída" — both mini-forms with a required reason, only when `canCancel`.

- [ ] **Step 1: Wire the page**

In `src/app/quartos/page.tsx`:

Add the import:
```ts
import { canCancelNow } from '@/server/data/stays'
```

In `Board`, after `const products = await listProducts()`, add:
```ts
  const canCancel = await canCancelNow()
```

In the `data` map's returned object, add the field (next to `loyalty`):
```ts
      lastClosedStayId: r.lastClosedStayId != null ? String(r.lastClosedStayId) : null,
```

Change the final render to pass the prop:
```tsx
  return <RoomGrid rooms={data} products={products.map((p) => ({ code: p.code, description: p.description, price: Number(p.price) }))} canCancel={canCancel} />
```

- [ ] **Step 2: Extend the `Room` type + thread `canCancel`**

In `src/app/quartos/room-grid.tsx`:

Add to the `Room` type (after `loyalty: Loyalty | null`):
```ts
  lastClosedStayId: string | null
```

Change `RoomGrid` to accept and thread `canCancel`:
```tsx
export function RoomGrid({ rooms, products, canCancel }: { rooms: Room[]; products: Product[]; canCancel: boolean }) {
```
Find where it maps rooms to `<RoomCard room={r} products={products} />` and add the prop:
```tsx
          <RoomCard key={r.number} room={r} products={products} canCancel={canCancel} />
```
(Keep the existing `key`/wrapping; only add `canCancel={canCancel}`.)

Update `RoomCard` signature and thread down:
```tsx
function RoomCard({ room, products, canCancel }: { room: Room; products: Product[]; canCancel: boolean }) {
```
In its `DialogContent`, pass `canCancel` to the occupied panel and add the cancel-exit action for freed rooms. Replace the four status blocks (lines rendering `FreeActions`/`OccupiedPanel`/cleaning/maintenance) with:

```tsx
        {room.status === 'free' && <FreeActions room={room} onDone={() => setOpen(false)} />}
        {occupied && room.currentStay && <OccupiedPanel room={room} products={products} canCancel={canCancel} onDone={() => setOpen(false)} />}
        {room.status === 'cleaning' && <SimpleStatus number={room.number} status="free" label="Liberar (limpo)" onDone={() => setOpen(false)} />}
        {room.status === 'maintenance' && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">Motivo: {room.maintenanceReason}</p>
            <SimpleStatus number={room.number} status="free" label="Voltar de manutenção" onDone={() => setOpen(false)} />
          </div>
        )}
        {canCancel && (room.status === 'free' || room.status === 'cleaning') && room.lastClosedStayId && (
          <CancelExit roomNumber={room.number} onDone={() => setOpen(false)} />
        )}
```

- [ ] **Step 3: Add `canCancel` to `OccupiedPanel` and the cancel components**

Change `OccupiedPanel` signature:
```tsx
function OccupiedPanel({ room, products, canCancel, onDone }: { room: Room; products: Product[]; canCancel: boolean; onDone: () => void }) {
```
At the very end of its returned JSX (just before the closing `</div>` of the outer `grid gap-3`), add:
```tsx
      {canCancel && <CancelEntry roomNumber={room.number} onDone={onDone} />}
```

Add the two client components (near `MaintenanceForm`):
```tsx
function CancelEntry({ roomNumber, onDone }: { roomNumber: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(
    (prev, fd) => cancelCheckInAction(roomNumber, prev, fd), { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <details className="rounded-xl border border-destructive/40 p-3">
      <summary className="cursor-pointer text-sm font-medium text-destructive">Cancelar entrada</summary>
      <p className="mt-1 text-xs text-muted-foreground">Isto desfaz o check-in e estorna o antecipado.</p>
      <form action={action} className="mt-2 flex gap-2">
        <Input name="reason" placeholder="motivo" required />
        <Button variant="outline" type="submit" className="border-destructive/50 text-destructive">Confirmar</Button>
      </form>
      {state.error && <p className="mt-1 text-destructive text-xs">{state.error}</p>}
    </details>
  )
}

function CancelExit({ roomNumber, onDone }: { roomNumber: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(
    (prev, fd) => cancelCheckOutAction(roomNumber, prev, fd), { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <details className="rounded-xl border border-destructive/40 p-3">
      <summary className="cursor-pointer text-sm font-medium text-destructive">Cancelar última saída</summary>
      <p className="mt-1 text-xs text-muted-foreground">Reabre a estadia e estorna o saldo cobrado na saída.</p>
      <form action={action} className="mt-2 flex gap-2">
        <Input name="reason" placeholder="motivo" required />
        <Button variant="outline" type="submit" className="border-destructive/50 text-destructive">Confirmar</Button>
      </form>
      {state.error && <p className="mt-1 text-destructive text-xs">{state.error}</p>}
    </details>
  )
}
```

Add the imports at the top of `room-grid.tsx` (extend the existing `./actions` import):
```ts
import { checkInAction, checkOutAction, setRoomStatusAction, addConsumptionAction, removeConsumptionAction, walkinSaleAction, applyBenefitAction, cancelCheckInAction, cancelCheckOutAction, type ActionState } from './actions'
```

- [ ] **Step 4: Build + full suite**

Run: `pnpm build` → succeeds.
Run: `pnpm test` → all PASS.

- [ ] **Step 5: Manual smoke (recommended)**

`pnpm dev`, login as reception with an open caixa: open an occupied room → "Cancelar entrada" → reason → room goes free. Check out a room, then open it (cleaning) → "Cancelar última saída" → reason → room re-occupied. Close the caixa → the cancel controls disappear for reception (and the server rejects if forced). Login as manager → controls always present.

- [ ] **Step 6: Commit**

```bash
git add src/app/quartos/room-grid.tsx src/app/quartos/page.tsx
git commit -m "feat(cancel): room modal — cancel entrada / última saída (reason gated)"
```
