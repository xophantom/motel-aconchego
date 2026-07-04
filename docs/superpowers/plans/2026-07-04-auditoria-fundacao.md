# Auditoria — Fundação (logEvent + retrofit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `EventLog` audit trail written best-effort from every key mutation (check-in/out, room status, shift/cash, consumption, config edits), carrying the acting operator.

**Architecture:** One `server-only` helper `logEvent()` reads the current user and inserts an `EventLog` row via the DB singleton, wrapped in `try/catch` so a logging failure never breaks the observed operation. Existing DAL mutations call it at the end of their happy path, outside any transaction. This plan is slice 1 of 2 (spec `docs/superpowers/specs/2026-07-03-auditoria-design.md`); slice 2 (read DAL + `/auditoria` screen + `audit:view`) is a separate plan.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, TypeScript.

## Global Constraints

- **Prisma imports:** client, model types, enums, and `Prisma` namespace come from `@/generated/prisma/client` — never `@prisma/client`.
- **DB singleton:** `import { db } from '@/server/db'`. `logEvent` uses this singleton, never a `tx` passed from outside.
- **server-only:** every DAL/helper file starts with `import 'server-only'`.
- **Tests:** Vitest, DB-backed against the test DB. Run with `DATABASE_URL="$DATABASE_URL_TEST" pnpm test`. Mock `server-only` (`vi.mock('server-only', () => ({}))`) and mock `@/server/session` for the acting user.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.
- **Best-effort logging:** `logEvent` must never throw. The audit write is observability — it cannot roll back or fail a check-out.
- **FK ordering in tests:** `event_log.employee_id` references `employee`. Any `beforeEach` that clears `employee` MUST call `db.eventLog.deleteMany()` first.

---

### Task 1: Schema + migration (`entity`, `entityId`, default `occurredAt`)

**Files:**
- Modify: `prisma/schema.prisma` (model `EventLog`, around lines 280-291)
- Create: `prisma/migrations/<timestamp>_audit_entity/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: `EventLog` fields `entity String?`, `entityId String? @map("entity_id")`, and `occurredAt` now defaults to `now()`. Prisma delegate `db.eventLog` accepts `{ type, description, entity, entityId, roomNumber, employeeId }` without an explicit `occurredAt`.

- [ ] **Step 1: Edit the `EventLog` model**

In `prisma/schema.prisma`, replace the `EventLog` model with:

```prisma
model EventLog {
  id          BigInt    @id @default(autoincrement())
  occurredAt  DateTime  @default(now()) @map("occurred_at") @db.Timestamptz
  type        String?
  description String?
  entity      String?
  entityId    String?   @map("entity_id")
  employeeId  Int?      @map("employee_id")
  roomNumber  String?   @map("room_number")
  legacySeq   BigInt?   @map("legacy_seq")
  employee    Employee? @relation(fields: [employeeId], references: [id])

  @@map("event_log")
}
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm prisma migrate dev --name audit_entity`
Expected: a new folder `prisma/migrations/<timestamp>_audit_entity/` whose `migration.sql` is:

```sql
-- AlterTable
ALTER TABLE "event_log" ADD COLUMN     "entity" TEXT,
ADD COLUMN     "entity_id" TEXT,
ALTER COLUMN "occurred_at" SET DEFAULT CURRENT_TIMESTAMP;
```

If the generated SQL includes anything else (e.g. a table rename), stop and inspect — only these two new columns + the default change are expected.

- [ ] **Step 3: Verify the client regenerated and build stays green**

Run: `pnpm prisma generate && pnpm build`
Expected: build succeeds; no type errors referencing `EventLog`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(audit): add entity/entityId columns + default occurredAt to EventLog"
```

---

### Task 2: `logEvent` helper

**Files:**
- Create: `src/server/audit.ts`
- Test: `tests/server/audit.test.ts`

**Interfaces:**
- Consumes: `db` from `@/server/db`, `getCurrentUser` from `@/server/session`.
- Produces:
  ```ts
  export type LogInput = {
    type: string
    description: string
    entity?: string
    entityId?: string
    roomNumber?: string | null
  }
  export async function logEvent(input: LogInput): Promise<void>
  ```
  Writes one `EventLog` row stamped with the session user's id (or `null` if unauthenticated). Never throws.

- [ ] **Step 1: Write the failing test**

Create `tests/server/audit.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { logEvent } from '@/server/audit'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('logEvent', () => {
  it('writes an event stamped with the session operator', async () => {
    await logEvent({ type: 'stay.checkin', description: 'Entrada quarto 07', entity: 'stay', entityId: '42', roomNumber: '07' })
    const rows = await db.eventLog.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('stay.checkin')
    expect(rows[0].description).toBe('Entrada quarto 07')
    expect(rows[0].entity).toBe('stay')
    expect(rows[0].entityId).toBe('42')
    expect(rows[0].roomNumber).toBe('07')
    expect(rows[0].employeeId).toBe(1)
    expect(rows[0].occurredAt).toBeInstanceOf(Date)
  })

  it('writes employeeId=null when there is no session (e.g. a job)', async () => {
    session.current = null
    await logEvent({ type: 'room.status', description: 'Quarto 03 → limpeza' })
    const rows = await db.eventLog.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].employeeId).toBeNull()
    expect(rows[0].entity).toBeNull()
  })

  it('never throws — a DB error is swallowed', async () => {
    const spy = vi.spyOn(db.eventLog, 'create').mockRejectedValueOnce(new Error('boom'))
    await expect(logEvent({ type: 'x', description: 'y' })).resolves.toBeUndefined()
    const rows = await db.eventLog.findMany()
    expect(rows).toHaveLength(0)
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/audit.test.ts`
Expected: FAIL — `Cannot find module '@/server/audit'`.

- [ ] **Step 3: Write the helper**

Create `src/server/audit.ts`:

```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'

export type LogInput = {
  type: string
  description: string
  entity?: string
  entityId?: string
  roomNumber?: string | null
}

// Best-effort audit trail. Called at the end of a mutation's happy path,
// OUTSIDE any transaction, so a logging failure can never roll back or break
// the operation it observes. Reads the operator from the session itself.
export async function logEvent(input: LogInput): Promise<void> {
  try {
    const me = await getCurrentUser()
    await db.eventLog.create({
      data: {
        type: input.type,
        description: input.description,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        roomNumber: input.roomNumber ?? null,
        employeeId: me?.id ?? null,
      },
    })
  } catch {
    // swallow: the audit log is observability, not a hard dependency.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/audit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/audit.ts tests/server/audit.test.ts
git commit -m "feat(audit): add best-effort logEvent helper"
```

---

### Task 3: Retrofit stays (`checkIn`, `checkOut`)

**Files:**
- Modify: `src/server/data/stays.ts` (`checkIn` 16-47, `checkOut` 49-85)
- Test: `tests/server/stays.test.ts` (add cleanup + assertions)

**Interfaces:**
- Consumes: `logEvent` from `@/server/audit`.
- Produces: after a successful check-in, one `EventLog` `{ type: 'stay.checkin', entity: 'stay', entityId: String(stay.id), roomNumber }`; after check-out, `{ type: 'stay.checkout', entity: 'stay', entityId: String(stay.id), roomNumber }`.

- [ ] **Step 1: Add the failing assertions**

In `tests/server/stays.test.ts`, add `await db.eventLog.deleteMany()` as the FIRST line of the `beforeEach` cleanup (before `loyaltyRedemption.deleteMany`). The test reads events straight off `db.eventLog` (no new import needed). Then add this block after the existing `describe('check-out', …)`:

```ts
describe('audit trail', () => {
  it('check-in writes a stay.checkin event', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    const ev = await db.eventLog.findMany({ where: { type: 'stay.checkin' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entity).toBe('stay')
    expect(ev[0].entityId).toBe(String(stay.id))
    expect(ev[0].roomNumber).toBe('01')
    expect(ev[0].employeeId).toBe(1)
  })

  it('check-out writes a stay.checkout event', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await db.stay.update({ where: { id: stay.id }, data: { checkIn: new Date(Date.now() - 30 * 60000) } })
    await checkOut('01')
    const ev = await db.eventLog.findMany({ where: { type: 'stay.checkout' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(stay.id))
    expect(ev[0].roomNumber).toBe('01')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/stays.test.ts`
Expected: FAIL — the two new tests find `0` events.

- [ ] **Step 3: Instrument `checkIn` and `checkOut`**

In `src/server/data/stays.ts`, add the import near the top (after line 8):

```ts
import { logEvent } from '@/server/audit'
```

In `checkIn`, change the transaction from `return db.$transaction(...)` to capture, log, then return. Replace lines 23-46 (the `return db.$transaction(async (tx) => { … })`) so the function ends:

```ts
  const stay = await db.$transaction(async (tx) => {
    const stay = await tx.stay.create({
      data: {
        type: 'room',
        roomNumber: input.roomNumber,
        categoryId: room.categoryId,
        checkIn: new Date(),
        day: input.day,
        chargeMode: input.chargeMode ?? 'period',
        guests: input.guests,
        prepaidAmount: input.prepaidAmount,
        status: 'open',
        entryEmployeeId: me.id,
        customerId: customer?.id ?? null,
      },
    })
    await tx.room.update({ where: { number: input.roomNumber }, data: { status: 'occupied', currentStayId: stay.id } })
    if (input.prepaidAmount > 0) {
      await tx.cashMovement.create({
        data: { type: 'stay', stayId: stay.id, amount: input.prepaidAmount, employeeId: me.id, shiftId: openShiftId, occurredAt: new Date(), description: `Antecipado quarto ${input.roomNumber}` },
      })
    }
    return stay
  })
  await logEvent({
    type: 'stay.checkin',
    description: `Entrada quarto ${input.roomNumber}${input.plate ? ` · placa ${input.plate}` : ''}`,
    entity: 'stay',
    entityId: String(stay.id),
    roomNumber: input.roomNumber,
  })
  return stay
```

In `checkOut`, after the closing `})` of the `await db.$transaction(...)` (line 83) and before `return { stayAmount, balance }` (line 84), insert:

```ts
  await logEvent({
    type: 'stay.checkout',
    description: `Saída quarto ${roomNumber} · R$ ${balance.toFixed(2)}`,
    entity: 'stay',
    entityId: String(stay.id),
    roomNumber,
  })
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/stays.test.ts`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/server/data/stays.ts tests/server/stays.test.ts
git commit -m "feat(audit): emit stay.checkin/checkout events"
```

---

### Task 4: Retrofit `rooms.setRoomStatus`

**Files:**
- Modify: `src/server/data/rooms.ts` (`setRoomStatus` 22-35)
- Test: `tests/server/rooms.test.ts` (add cleanup + assertion)

**Interfaces:**
- Consumes: `logEvent` from `@/server/audit`.
- Produces: after a status change, one `EventLog` `{ type: 'room.status', entity: 'room', entityId: number, roomNumber: number }` whose `description` names the new status in PT.

- [ ] **Step 1: Add the failing assertion**

In `tests/server/rooms.test.ts`, add `await db.eventLog.deleteMany()` as the first cleanup line in `beforeEach` (before whichever `deleteMany` clears `employee`). Add:

```ts
describe('audit trail', () => {
  it('setRoomStatus writes a room.status event with the new status', async () => {
    await setRoomStatus('01', 'cleaning')
    const ev = await db.eventLog.findMany({ where: { type: 'room.status' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entity).toBe('room')
    expect(ev[0].entityId).toBe('01')
    expect(ev[0].roomNumber).toBe('01')
    expect(ev[0].description).toContain('limpeza')
  })
})
```

If the existing test file does not already import `setRoomStatus`, add it to the import from `@/server/data/rooms`. Ensure a room `'01'` exists in that file's `beforeEach` (mirror the setup already used by its other tests).

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/rooms.test.ts`
Expected: FAIL — new test finds `0` events.

- [ ] **Step 3: Instrument `setRoomStatus`**

In `src/server/data/rooms.ts`, add after line 3:

```ts
import { logEvent } from '@/server/audit'
```

Add a PT status label map below the imports (after the `type RoomStatus` import line):

```ts
const STATUS_PT: Record<RoomStatus, string> = {
  free: 'livre',
  occupied: 'ocupado',
  cleaning: 'limpeza',
  maintenance: 'manutenção',
}
```

Replace the final `return db.room.update({...})` of `setRoomStatus` with:

```ts
  const room = await db.room.update({
    where: { number },
    data: { status, maintenanceReason: status === 'maintenance' ? reason : null },
  })
  await logEvent({
    type: 'room.status',
    description: `Quarto ${number} → ${STATUS_PT[status]}${status === 'maintenance' && reason ? ` (${reason})` : ''}`,
    entity: 'room',
    entityId: number,
    roomNumber: number,
  })
  return room
```

> Note: `RoomStatus` currently has these four values in the schema. If `pnpm build` reports the `STATUS_PT` record is missing a key, add the missing enum member(s) — the map must be exhaustive.

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/rooms.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/data/rooms.ts tests/server/rooms.test.ts
git commit -m "feat(audit): emit room.status events"
```

---

### Task 5: Retrofit shifts (`openShift`, `closeShift`, `addCashMovement`)

**Files:**
- Modify: `src/server/data/shifts.ts` (`openShift` 18-26, `closeShift` 28-36, `addCashMovement` 38-49)
- Test: `tests/server/shifts.test.ts` (add cleanup + assertions)

**Interfaces:**
- Consumes: `logEvent` from `@/server/audit`.
- Produces: `shift.open` / `shift.close` events (`entity: 'shift'`, `entityId: String(shift.id)`), and per cash movement a `cash.<type>` event (`type` ∈ `cash.withdrawal | cash.supply | cash.correction`, `entity: 'cash'`, `entityId: String(mov.id)`).

- [ ] **Step 1: Add the failing assertions**

In `tests/server/shifts.test.ts`, add `await db.eventLog.deleteMany()` as the first cleanup line in `beforeEach`. Add:

```ts
describe('audit trail', () => {
  it('openShift writes shift.open', async () => {
    const shift = await openShift({ openingBalance: 100 })
    const ev = await db.eventLog.findMany({ where: { type: 'shift.open' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(shift.id))
  })

  it('addCashMovement writes cash.<type>', async () => {
    await openShift({ openingBalance: 100 })
    await addCashMovement({ type: 'withdrawal', amount: 20, description: 'Troco' })
    const ev = await db.eventLog.findMany({ where: { type: 'cash.withdrawal' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entity).toBe('cash')
  })

  it('closeShift writes shift.close', async () => {
    const shift = await openShift({ openingBalance: 100 })
    await closeShift(shift.id, { closingBalance: 100 })
    const ev = await db.eventLog.findMany({ where: { type: 'shift.close' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(shift.id))
  })
})
```

Ensure the test's acting user has the `cash:manage` action (role `manager` or `reception`) in that file's `beforeEach` session setup.

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/shifts.test.ts`
Expected: FAIL — new tests find `0` events.

- [ ] **Step 3: Instrument the three functions**

In `src/server/data/shifts.ts`, add after line 6:

```ts
import { logEvent } from '@/server/audit'
```

`openShift` — replace the final `return db.shift.create({...})` with:

```ts
  const shift = await db.shift.create({ data: { businessDate, period, employeeId: me.id, openedAt: now, openingBalance: input.openingBalance } })
  await logEvent({ type: 'shift.open', description: `Caixa aberto · saldo inicial R$ ${input.openingBalance.toFixed(2)}`, entity: 'shift', entityId: String(shift.id) })
  return shift
```

`closeShift` — after `await db.shift.update({...})` (line 34) and before `return metrics`, insert:

```ts
  await logEvent({ type: 'shift.close', description: `Caixa fechado · saldo R$ ${metrics.saldo.toFixed(2)}`, entity: 'shift', entityId: String(shiftId) })
```

`addCashMovement` — replace the final `return db.cashMovement.create({...})` with:

```ts
  const mov = await db.cashMovement.create({
    data: { type: input.type, amount, employeeId: me.id, shiftId: open?.id ?? null, occurredAt: now, description: input.description },
  })
  const label = input.type === 'withdrawal' ? 'Sangria' : input.type === 'supply' ? 'Suprimento' : 'Correção'
  await logEvent({ type: `cash.${input.type}`, description: `${label} R$ ${Math.abs(amount).toFixed(2)}${input.description ? ` · ${input.description}` : ''}`, entity: 'cash', entityId: String(mov.id) })
  return mov
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/shifts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/data/shifts.ts tests/server/shifts.test.ts
git commit -m "feat(audit): emit shift.open/close and cash.<type> events"
```

---

### Task 6: Retrofit consumption (`addConsumption`, `removeConsumption`, `walkinSale`)

**Files:**
- Modify: `src/server/data/consumption.ts` (`addConsumption` 13-26, `removeConsumption` 39-52, `walkinSale` 54-79)
- Test: `tests/server/consumption.test.ts` (create if absent, else extend)

**Interfaces:**
- Consumes: `logEvent` from `@/server/audit`.
- Produces: `consumption.add` (`entity: 'stay'`, `entityId: String(stayId)`), `consumption.remove` (`entity: 'stay'`, `entityId: String(item.stayId)`), `consumption.walkin` (`entity: 'stay'`, `entityId: String(stay.id)`).

- [ ] **Step 1: Add the failing assertions**

If `tests/server/consumption.test.ts` does not exist, create it modeled on `tests/server/stays.test.ts` (same `vi.mock` header, same `beforeEach` cleanup with `db.eventLog.deleteMany()` FIRST, a `manager`/`reception` session, a category + rate + room + one product with `trackStock: false`). Add:

```ts
describe('audit trail', () => {
  it('addConsumption writes consumption.add', async () => {
    const stay = await checkIn({ roomNumber: '01', day: 'normal', guests: 2, prepaidAmount: 0 })
    await addConsumption({ stayId: stay.id, productCode: 'P1', qty: 2 })
    const ev = await db.eventLog.findMany({ where: { type: 'consumption.add' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(stay.id))
  })

  it('walkinSale writes consumption.walkin', async () => {
    await walkinSale({ items: [{ productCode: 'P1', qty: 1 }] })
    const ev = await db.eventLog.findMany({ where: { type: 'consumption.walkin' } })
    expect(ev).toHaveLength(1)
  })
})
```

(Import `checkIn` from `@/server/data/stays` and `addConsumption`, `walkinSale` from `@/server/data/consumption`.)

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/consumption.test.ts`
Expected: FAIL — new tests find `0` events.

- [ ] **Step 3: Instrument the three functions**

In `src/server/data/consumption.ts`, add after line 5:

```ts
import { logEvent } from '@/server/audit'
```

`addConsumption` — replace the final `return db.$transaction(...)` with a captured result + log:

```ts
  const item = await db.$transaction(async (tx) => {
    const item = await tx.consumption.create({ data: { stayId: input.stayId, productCode: input.productCode, qty: input.qty, unitPrice } })
    await tx.stay.update({ where: { id: input.stayId }, data: { consumptionAmount: { increment: lineTotal } } })
    if (product.trackStock) await tx.product.update({ where: { code: input.productCode }, data: { stockQty: { decrement: input.qty } } })
    return item
  })
  await logEvent({ type: 'consumption.add', description: `Consumo +${input.qty}× ${product.description} · quarto ${stay.roomNumber ?? '—'}`, entity: 'stay', entityId: String(input.stayId), roomNumber: stay.roomNumber })
  return item
```

`removeConsumption` — after the closing `})` of its `await db.$transaction(...)` (line 51), insert (the function currently returns nothing, keep it that way):

```ts
  await logEvent({ type: 'consumption.remove', description: `Consumo removido · ${item.qty}× (${item.productCode ?? '—'})`, entity: 'stay', entityId: String(item.stayId), roomNumber: item.stay.roomNumber })
```

`walkinSale` — replace the final `return db.$transaction(...)` (67-78) so the transaction result is captured, then log, then return:

```ts
  const result = await db.$transaction(async (tx) => {
    const stay = await tx.stay.create({
      data: { type: 'walkin', roomNumber: '99', checkIn: now, checkOut: now, status: 'closed', stayAmount: 0, consumptionAmount: total, paymentEmployeeId: me.id },
    })
    for (const i of input.items) {
      await tx.consumption.create({ data: { stayId: stay.id, productCode: i.productCode, qty: i.qty, unitPrice: priceOf(i.productCode) } })
      const product = products.find((p) => p.code === i.productCode)
      if (product?.trackStock) await tx.product.update({ where: { code: i.productCode }, data: { stockQty: { decrement: i.qty } } })
    }
    await tx.cashMovement.create({ data: { type: 'consumption', stayId: stay.id, amount: total, employeeId: me.id, shiftId: openShiftId, occurredAt: now, description: 'Venda avulsa' } })
    return { stay, total }
  })
  await logEvent({ type: 'consumption.walkin', description: `Venda avulsa · R$ ${total.toFixed(2)}`, entity: 'stay', entityId: String(result.stay.id) })
  return result
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/consumption.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/data/consumption.ts tests/server/consumption.test.ts
git commit -m "feat(audit): emit consumption.add/remove/walkin events"
```

---

### Task 7: Retrofit config mutations (tariff, products, employees, loyalty)

**Files:**
- Modify: `src/server/data/tariff.ts` (`updateCategory` 18-21, `updateRate` 23-27)
- Modify: `src/server/data/products.ts` (`upsertProduct` 13-18)
- Modify: `src/server/data/employees.ts` (`createEmployee`, `updateEmployee`, `deactivateEmployee`, `resetPassword` 22-50)
- Modify: `src/server/data/loyalty.ts` (`upsertTier` 21-23, `deleteTier` 25-27)
- Test: `tests/server/audit-config.test.ts` (create)

**Interfaces:**
- Consumes: `logEvent` from `@/server/audit`.
- Produces: `tariff.update`, `product.update`, `user.create` / `user.update` / `user.deactivate` / `user.reset`, `loyalty.tier.upsert` / `loyalty.tier.delete`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/audit-config.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { upsertProduct } from '@/server/data/products'
import { upsertTier, deleteTier } from '@/server/data/loyalty'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.loyaltyTier.deleteMany()
  await db.product.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('config audit trail', () => {
  it('upsertProduct writes product.update', async () => {
    await upsertProduct({ code: 'P1', description: 'Água', price: 5, category: 'drink', trackStock: false, stockQty: 0 })
    const ev = await db.eventLog.findMany({ where: { type: 'product.update' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe('P1')
  })

  it('loyalty tier upsert + delete write loyalty.tier.* events', async () => {
    const tier = await upsertTier({ minVisits: 5, discountPercent: 10 })
    await deleteTier(tier.id)
    const up = await db.eventLog.findMany({ where: { type: 'loyalty.tier.upsert' } })
    const del = await db.eventLog.findMany({ where: { type: 'loyalty.tier.delete' } })
    expect(up).toHaveLength(1)
    expect(del).toHaveLength(1)
  })
})
```

> Adjust the `upsertProduct` argument object to match the real `ProductInput` shape if it differs (check `@/lib/validation/product`). The assertion on `type`/`entityId` is what matters.

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/audit-config.test.ts`
Expected: FAIL — events not found.

- [ ] **Step 3: Instrument the config mutations**

Add `import { logEvent } from '@/server/audit'` to each of the four files, then:

`tariff.ts` — end of `updateCategory`:
```ts
  const cat = await db.roomCategory.update({ where: { id }, data: input })
  await logEvent({ type: 'tariff.update', description: `Categoria ${cat.code} atualizada`, entity: 'category', entityId: String(id) })
  return cat
```
end of `updateRate`:
```ts
  const rate = await db.rate.update({ where: { categoryId_day: { categoryId, day } }, data: prices })
  await logEvent({ type: 'tariff.update', description: `Tarifa categoria #${categoryId} (${day}) atualizada`, entity: 'rate', entityId: `${categoryId}:${day}` })
  return rate
```

`products.ts` — end of `upsertProduct`:
```ts
  const product = await db.product.upsert({ where: { code }, create: input, update: rest })
  await logEvent({ type: 'product.update', description: `Produto ${product.description} (${product.code}) salvo`, entity: 'product', entityId: product.code })
  return product
```

`employees.ts` — end of each:
```ts
// createEmployee
  const created = await db.employee.create({ data: { name: input.name, username: input.username, role: input.role, passwordHash }, select: { id: true, name: true, username: true, role: true, active: true } })
  await logEvent({ type: 'user.create', description: `Funcionário ${created.name} (${created.role}) criado`, entity: 'employee', entityId: String(created.id) })
  return created
// updateEmployee
  const updated = await db.employee.update({ where: { id }, data: { role: input.role, active: input.active }, select: { id: true, name: true, username: true, role: true, active: true } })
  await logEvent({ type: 'user.update', description: `Funcionário ${updated.name} atualizado (${updated.role}, ${updated.active ? 'ativo' : 'inativo'})`, entity: 'employee', entityId: String(id) })
  return updated
// deactivateEmployee
  const deactivated = await db.employee.update({ where: { id }, data: { active: false } })
  await logEvent({ type: 'user.deactivate', description: `Funcionário ${deactivated.name} desativado`, entity: 'employee', entityId: String(id) })
  return deactivated
// resetPassword
  const reset = await db.employee.update({ where: { id }, data: { passwordHash: await hashPassword(password) } })
  await logEvent({ type: 'user.reset', description: `Senha redefinida para ${reset.name}`, entity: 'employee', entityId: String(id) })
  return reset
```

`loyalty.ts` — end of `upsertTier`:
```ts
  const tier = await db.loyaltyTier.upsert({ where: { minVisits: input.minVisits }, create: input, update: { discountPercent: input.discountPercent } })
  await logEvent({ type: 'loyalty.tier.upsert', description: `Faixa fidelidade ${tier.minVisits} visitas · ${tier.discountPercent}%`, entity: 'loyaltyTier', entityId: String(tier.id) })
  return tier
```
end of `deleteTier`:
```ts
  const tier = await db.loyaltyTier.delete({ where: { id } })
  await logEvent({ type: 'loyalty.tier.delete', description: `Faixa fidelidade ${tier.minVisits} visitas removida`, entity: 'loyaltyTier', entityId: String(id) })
  return tier
```

- [ ] **Step 4: Run to verify it passes + full suite green**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/audit-config.test.ts`
Then the whole suite + build: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test && pnpm build`
Expected: all PASS; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/server/data/tariff.ts src/server/data/products.ts src/server/data/employees.ts src/server/data/loyalty.ts tests/server/audit-config.test.ts
git commit -m "feat(audit): emit config-edit events (tariff/product/user/loyalty)"
```
