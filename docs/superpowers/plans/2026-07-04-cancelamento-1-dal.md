# Cancelamento 1 — Migração + DAL (cancelCheckIn / cancelCheckOut) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Undo a check-in (cancel entrada) or the most recent check-out (cancel saída), reversing the cash by opposite movements (never deletion), gated by `stay:cancel` with an open-shift window for reception, with a mandatory reason and audit events.

**Architecture:** Prisma migration adds `canceled*` columns to `Stay`. Two functions and helpers in `src/server/data/stays.ts`, each authz-checked (`stay:cancel` + shift window for non-managers), wrapping reversal + status change in a transaction and emitting `logEvent`. Slice 1 of 2 (spec `docs/superpowers/specs/2026-07-03-cancelamento-design.md`); slice 2 = board flag + actions + modal UI.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, TypeScript.

## Global Constraints

- **Prisma imports** from `@/generated/prisma/client`; **DB singleton** `@/server/db`; **server-only**.
- **Reversal, not deletion:** reverse money with a `cash_movement` of the **same `type`, opposite sign**, `description = "estorno · cancelamento · <motivo>"`, linked to the same `stay` and the current shift. Nothing is deleted.
- **Window rule:** manager cancels always; reception only while the current shift/caixa is open (checked in the DAL).
- **Reason mandatory** (short text) → into the reversal `description` and the audit event.
- **Audit:** `logEvent('stay.cancel_checkin' | 'stay.cancel_checkout', …)`.
- **Tests:** `pnpm test` (vitest.config → test DB). Mock `server-only` + `@/server/session`. After the migration: `DATABASE_URL="$DATABASE_URL_TEST" pnpm prisma migrate deploy`, then `pnpm prisma generate`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.

---

### Task 1: Migration (`canceledAt`/`canceledReason`/`canceledById`) + `stay:cancel` RBAC

**Files:**
- Modify: `prisma/schema.prisma` (`Stay` model + `Employee` back-relation)
- Modify: `src/lib/rbac.ts`
- Create: `prisma/migrations/<ts>_stay_cancel/migration.sql` (generated)
- Test: `tests/lib/rbac-cancel.test.ts`

**Interfaces:**
- Produces: `Stay.canceledAt DateTime?`, `Stay.canceledReason String?`, `Stay.canceledById Int?` + relation `canceledBy Employee? @relation("canceled")`; `Action` union includes `'stay:cancel'` (reception + manager).

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, add to the `Stay` model (after `paymentEmployeeId`):

```prisma
  canceledAt        DateTime?     @map("canceled_at") @db.Timestamptz
  canceledReason    String?       @map("canceled_reason")
  canceledById      Int?          @map("canceled_by_id")
```

And in the `Stay` relations block add:

```prisma
  canceledBy        Employee?     @relation("canceled", fields: [canceledById], references: [id])
```

In the `Employee` model add a back-relation (next to `staysPaid`):

```prisma
  staysCanceled Stay[]         @relation("canceled")
```

- [ ] **Step 2: Generate + apply the migration**

Run: `pnpm prisma migrate dev --name stay_cancel`
Expected SQL (all new columns nullable → no backfill):

```sql
-- AlterTable
ALTER TABLE "stay" ADD COLUMN "canceled_at" TIMESTAMPTZ,
ADD COLUMN "canceled_reason" TEXT,
ADD COLUMN "canceled_by_id" INTEGER;
-- AddForeignKey
ALTER TABLE "stay" ADD CONSTRAINT "stay_canceled_by_id_fkey" FOREIGN KEY ("canceled_by_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Then apply to the test DB + regenerate:
`DATABASE_URL="$DATABASE_URL_TEST" pnpm prisma migrate deploy && pnpm prisma generate`

- [ ] **Step 3: Add `stay:cancel` + failing test**

Create `tests/lib/rbac-cancel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('stay:cancel', () => {
  it('is granted to reception and manager, not housekeeper', () => {
    expect(can('manager', 'stay:cancel')).toBe(true)
    expect(can('reception', 'stay:cancel')).toBe(true)
    expect(can('housekeeper', 'stay:cancel')).toBe(false)
  })
})
```

Run: `pnpm test tests/lib/rbac-cancel.test.ts` → FAIL.

In `src/lib/rbac.ts` add `'stay:cancel'` to the `Action` union, to the `manager` array, and to the `reception` array.

- [ ] **Step 4: Verify + build**

Run: `pnpm test tests/lib/rbac-cancel.test.ts` → PASS. Then `pnpm build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/rbac.ts tests/lib/rbac-cancel.test.ts
git commit -m "feat(cancel): Stay canceled* migration + stay:cancel RBAC"
```

---

### Task 2: `cancelCheckIn(roomNumber, reason)`

**Files:**
- Modify: `src/server/data/stays.ts`
- Test: `tests/server/cancel-checkin.test.ts`

**Interfaces:**
- Consumes: `db`, `getCurrentUser`, `can`, `getOpenShiftFor`, `logEvent`.
- Produces:
  ```ts
  export async function cancelCheckIn(roomNumber: string, reason: string): Promise<void>
  ```
  Also an internal `requireCancelWindow()` helper (returns the user; throws `Forbidden` without `stay:cancel`; throws `shift closed` for a non-manager when no shift is open).

- [ ] **Step 1: Write the failing test**

Create `tests/server/cancel-checkin.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkIn, cancelCheckIn } from '@/server/data/stays'
import { openShift } from '@/server/data/shifts'

let categoryId: number
beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.shift.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  categoryId = cat.id
  await db.rate.create({ data: { categoryId: cat.id, day: 'normal', basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
  await openShift({ openingBalance: 0 }) // shift open so reception passes the window
})

describe('cancelCheckIn', () => {
  it('cancels the stay, frees the room, and reverses the prepaid (net 0)', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 50 })
    await cancelCheckIn('01', 'cliente desistiu')
    const canceled = await db.stay.findUniqueOrThrow({ where: { id: stay.id } })
    expect(canceled.status).toBe('canceled')
    expect(canceled.canceledReason).toBe('cliente desistiu')
    expect(canceled.canceledById).toBe(1)
    const room = await db.room.findUniqueOrThrow({ where: { number: '01' } })
    expect(room.status).toBe('free')
    expect(room.currentStayId).toBeNull()
    const movs = await db.cashMovement.findMany({ where: { stayId: stay.id, type: 'stay' } })
    expect(movs.reduce((a, m) => a + Number(m.amount), 0)).toBe(0) // 50 + (−50)
  })

  it('rejects when the room has no open stay', async () => {
    await expect(cancelCheckIn('01', 'x')).rejects.toThrow(/not occupied/i)
  })

  it('emits a stay.cancel_checkin audit event with the reason', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await cancelCheckIn('01', 'engano')
    const ev = await db.eventLog.findMany({ where: { type: 'stay.cancel_checkin' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(stay.id))
    expect(ev[0].description).toMatch(/engano/)
  })

  it('reception with a closed shift is forbidden; manager passes', async () => {
    await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const openShift = await db.shift.findFirstOrThrow()
    await db.shift.update({ where: { id: openShift.id }, data: { closedAt: new Date() } })
    await expect(cancelCheckIn('01', 'x')).rejects.toThrow(/shift closed/i)
    session.current = { id: 1, name: 'Boss', role: 'manager' }
    await cancelCheckIn('01', 'ok')
    expect((await db.room.findUniqueOrThrow({ where: { number: '01' } })).status).toBe('free')
  })
})
```

Run: `pnpm test tests/server/cancel-checkin.test.ts` → FAIL (function missing).

- [ ] **Step 2: Implement the helper + `cancelCheckIn`**

In `src/server/data/stays.ts`, `getOpenShiftFor` is already imported. Add after the existing `requireOps` helper:

```ts
async function requireCancelWindow() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:cancel')) throw new Error('Forbidden')
  if (me.role !== 'manager') {
    const open = await getOpenShiftFor(new Date())
    if (!open) throw new Error('shift closed')
  }
  return me
}
```

Append `cancelCheckIn`:

```ts
export async function cancelCheckIn(roomNumber: string, reason: string): Promise<void> {
  const me = await requireCancelWindow()
  if (!reason.trim()) throw new Error('reason required')
  const room = await db.room.findUniqueOrThrow({ where: { number: roomNumber }, include: { currentStay: true } })
  if (room.status !== 'occupied' || !room.currentStay || room.currentStay.status !== 'open') throw new Error('not occupied')
  const stay = room.currentStay
  const shiftId = (await getOpenShiftFor(new Date()))?.id ?? null
  const movs = await db.cashMovement.findMany({ where: { stayId: stay.id, type: 'stay' } })
  await db.$transaction(async (tx) => {
    for (const m of movs) {
      await tx.cashMovement.create({
        data: { type: 'stay', stayId: stay.id, amount: -Number(m.amount), employeeId: me.id, shiftId, occurredAt: new Date(), description: `estorno · cancelamento · ${reason}` },
      })
    }
    await tx.stay.update({ where: { id: stay.id }, data: { status: 'canceled', canceledAt: new Date(), canceledReason: reason, canceledById: me.id } })
    await tx.room.update({ where: { number: roomNumber }, data: { status: 'free', currentStayId: null } })
  })
  await logEvent({ type: 'stay.cancel_checkin', description: `Cancelou entrada quarto ${roomNumber} · ${reason}`, entity: 'stay', entityId: String(stay.id), roomNumber })
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/server/cancel-checkin.test.ts` → PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add src/server/data/stays.ts tests/server/cancel-checkin.test.ts
git commit -m "feat(cancel): cancelCheckIn — reverse prepaid, free room, audit"
```

---

### Task 3: `cancelCheckOut(roomNumber, reason)`

**Files:**
- Modify: `src/server/data/stays.ts`
- Test: `tests/server/cancel-checkout.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function cancelCheckOut(roomNumber: string, reason: string): Promise<void>
  ```
  Reopens the most recent `closed` room stay whose room is still free/cleaning: `status='open'`, `checkOut=null`, `stayAmount=null`; reverses the checkout balance movement(s) (stay-type, `occurredAt >= checkOut`); sets room `occupied` + `currentStayId`. Errors: `no closed stay`, `room reoccupied`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/cancel-checkout.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { checkIn, checkOut, cancelCheckOut } from '@/server/data/stays'
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
  await openShift({ openingBalance: 0 })
})

async function closedStay() {
  const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 30 })
  await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
  await checkOut('01') // stayAmount 75, balance 45
  return stay
}

describe('cancelCheckOut', () => {
  it('reopens the stay, re-occupies the room, reverses the checkout balance (prepaid kept)', async () => {
    const stay = await closedStay()
    await cancelCheckOut('01', 'saiu por engano')
    const reopened = await db.stay.findUniqueOrThrow({ where: { id: stay.id } })
    expect(reopened.status).toBe('open')
    expect(reopened.checkOut).toBeNull()
    expect(reopened.stayAmount).toBeNull()
    const room = await db.room.findUniqueOrThrow({ where: { number: '01' } })
    expect(room.status).toBe('occupied')
    expect(room.currentStayId).toBe(stay.id)
    // prepaid 30 stays; checkout balance 45 and its −45 reversal net 0 → sum of stay movements = 30
    const movs = await db.cashMovement.findMany({ where: { stayId: stay.id, type: 'stay' } })
    expect(movs.reduce((a, m) => a + Number(m.amount), 0)).toBe(30)
  })

  it('emits a stay.cancel_checkout audit event', async () => {
    const stay = await closedStay()
    await cancelCheckOut('01', 'engano')
    const ev = await db.eventLog.findMany({ where: { type: 'stay.cancel_checkout' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(stay.id))
  })

  it('rejects when the room was reoccupied', async () => {
    await closedStay()
    await db.room.update({ where: { number: '01' }, data: { status: 'occupied' } })
    await expect(cancelCheckOut('01', 'x')).rejects.toThrow(/reoccupied/i)
  })

  it('rejects when there is no closed stay', async () => {
    await expect(cancelCheckOut('01', 'x')).rejects.toThrow(/no closed stay/i)
  })
})
```

Run: `pnpm test tests/server/cancel-checkout.test.ts` → FAIL.

- [ ] **Step 2: Implement `cancelCheckOut`**

Append to `src/server/data/stays.ts`:

```ts
export async function cancelCheckOut(roomNumber: string, reason: string): Promise<void> {
  const me = await requireCancelWindow()
  if (!reason.trim()) throw new Error('reason required')
  const room = await db.room.findUniqueOrThrow({ where: { number: roomNumber } })
  if (room.status !== 'free' && room.status !== 'cleaning') throw new Error('room reoccupied')
  const stay = await db.stay.findFirst({ where: { roomNumber, status: 'closed', type: 'room' }, orderBy: { checkOut: 'desc' } })
  if (!stay || !stay.checkOut) throw new Error('no closed stay')
  const shiftId = (await getOpenShiftFor(new Date()))?.id ?? null
  // the checkout balance movement(s): stay-type, at or after the checkout time (the prepaid was created at check-in, earlier)
  const movs = await db.cashMovement.findMany({ where: { stayId: stay.id, type: 'stay', occurredAt: { gte: stay.checkOut } } })
  await db.$transaction(async (tx) => {
    for (const m of movs) {
      await tx.cashMovement.create({
        data: { type: 'stay', stayId: stay.id, amount: -Number(m.amount), employeeId: me.id, shiftId, occurredAt: new Date(), description: `estorno · cancelamento · ${reason}` },
      })
    }
    await tx.stay.update({ where: { id: stay.id }, data: { status: 'open', checkOut: null, stayAmount: null, paymentEmployeeId: null } })
    await tx.room.update({ where: { number: roomNumber }, data: { status: 'occupied', currentStayId: stay.id } })
  })
  await logEvent({ type: 'stay.cancel_checkout', description: `Cancelou saída quarto ${roomNumber} · ${reason}`, entity: 'stay', entityId: String(stay.id), roomNumber })
}
```

- [ ] **Step 3: Run to verify it passes + full suite**

Run: `pnpm test tests/server/cancel-checkout.test.ts` → PASS. Then `pnpm test` → all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/data/stays.ts tests/server/cancel-checkout.test.ts
git commit -m "feat(cancel): cancelCheckOut — reopen stay, reverse balance, audit"
```
