# Relatórios extras 1 — DAL (movimento, estadias&pedidos, bar, operador) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four period reports to `reports.ts` — movement (check-ins/outs), stays & orders aggregate, bar products, and by-operator — all `report:view`, computed by query, returning serializable numbers.

**Architecture:** Four functions appended to `src/server/data/reports.ts`, each gated by `report:view`, aggregating by a local civil-date range `[from 00:00, to+1 00:00)`. No schema change. Slice 1 of 2 (spec `docs/superpowers/specs/2026-07-03-relatorios-extras-design.md`); slice 2 = CSV/PDF-by-`type` + `/relatorios` selector.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, TypeScript.

## Global Constraints

- **Prisma imports** from `@/generated/prisma/client`; **DB singleton** `@/server/db`; **server-only**.
- **`report:view`** (manager) on every function (mirror `monthlyOccupancy`).
- **Decimal → number** in all returned rows/totals; `round2` for money.
- **Civil range (local):** `start = new Date(from y,m,d)`, `end = new Date(to y,m,d+1)`; filter `gte start, lt end`.
- **Operator = who received payment** (`paymentEmployeeId`), matching the caixa rule.
- **Tests:** `pnpm test` (test DB auto; the suite truncates before each test). Mock `server-only` + `@/server/session`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.

---

### Task 1: Date helper + `movementReport`

**Files:**
- Modify: `src/server/data/reports.ts`
- Test: `tests/server/report-movement.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MovementRow = {
    stayId: string; roomNumber: string | null; checkIn: Date; checkOut: Date | null
    isEntry: boolean; isExit: boolean; durationMin: number | null
    stayAmount: number | null; consumption: number; total: number; operator: string | null
  }
  export type MovementReport = { rows: MovementRow[]; totals: { entries: number; exits: number; totalStay: number; totalConsumption: number; total: number } }
  export async function movementReport(from: Date, to: Date): Promise<MovementReport>
  ```
  Includes non-canceled `type='room'` stays whose `checkIn` OR `checkOut` falls in the range; `isEntry`/`isExit` flag which; sorted by `checkIn` asc.

- [ ] **Step 1: Write the failing test**

Create `tests/server/report-movement.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { movementReport } from '@/server/data/reports'

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h)

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  await db.room.create({ data: { number: '02', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('movementReport', () => {
  it('is forbidden for reception', async () => {
    session.current = { id: 1, name: 'R', role: 'reception' }
    await expect(movementReport(at(2026, 7, 4), at(2026, 7, 4))).rejects.toThrow(/forbidden/i)
  })

  it('flags entries and exits in the range with totals', async () => {
    // stay A: checked in AND out on the 4th (both) — charged
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 10), checkOut: at(2026, 7, 4, 12), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10, paymentEmployeeId: 1 } })
    // stay B: checked in on the 4th, still open (entry only)
    await db.stay.create({ data: { type: 'room', roomNumber: '02', checkIn: at(2026, 7, 4, 20), status: 'open', day: 'normal', guests: 2, consumptionAmount: 5, entryEmployeeId: 1 } })
    // stay C: checked in on the 3rd, out on the 5th — out only would be outside; here out on 5th is outside range → excluded
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 3, 10), checkOut: at(2026, 7, 5, 10), status: 'closed', day: 'normal', guests: 2, stayAmount: 160, consumptionAmount: 0, paymentEmployeeId: 1 } })

    const r = await movementReport(at(2026, 7, 4), at(2026, 7, 4))
    expect(r.rows).toHaveLength(2) // A and B (C's checkIn on 3rd and checkOut on 5th are both outside the 4th)
    const a = r.rows.find((x) => x.roomNumber === '01')!
    expect(a.isEntry).toBe(true); expect(a.isExit).toBe(true)
    expect(a.total).toBe(85) // 75 + 10
    const b = r.rows.find((x) => x.roomNumber === '02')!
    expect(b.isEntry).toBe(true); expect(b.isExit).toBe(false); expect(b.stayAmount).toBeNull()
    expect(r.totals.entries).toBe(2); expect(r.totals.exits).toBe(1)
    expect(r.totals.total).toBe(90) // 85 + 5
  })
})
```

Run: `pnpm test tests/server/report-movement.test.ts` → FAIL.

- [ ] **Step 2: Add the helper + `movementReport`**

In `src/server/data/reports.ts`, add after `round2`:

```ts
function dayRange(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1)
  return { start, end }
}
async function requireReports() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'report:view')) throw new Error('Forbidden')
  return me
}
```

Append:

```ts
export type MovementRow = {
  stayId: string; roomNumber: string | null; checkIn: Date; checkOut: Date | null
  isEntry: boolean; isExit: boolean; durationMin: number | null
  stayAmount: number | null; consumption: number; total: number; operator: string | null
}
export type MovementReport = { rows: MovementRow[]; totals: { entries: number; exits: number; totalStay: number; totalConsumption: number; total: number } }

export async function movementReport(from: Date, to: Date): Promise<MovementReport> {
  await requireReports()
  const { start, end } = dayRange(from, to)
  const stays = await db.stay.findMany({
    where: {
      type: 'room',
      status: { not: 'canceled' },
      OR: [{ checkIn: { gte: start, lt: end } }, { checkOut: { gte: start, lt: end } }],
    },
    orderBy: { checkIn: 'asc' },
    select: {
      id: true, roomNumber: true, checkIn: true, checkOut: true, stayAmount: true, consumptionAmount: true,
      paymentEmployee: { select: { name: true } }, entryEmployee: { select: { name: true } },
    },
  })
  const rows: MovementRow[] = stays.map((s) => {
    const isEntry = s.checkIn >= start && s.checkIn < end
    const isExit = !!s.checkOut && s.checkOut >= start && s.checkOut < end
    const stayAmount = s.stayAmount != null ? Number(s.stayAmount) : null
    const consumption = Number(s.consumptionAmount ?? 0)
    const total = round2((stayAmount ?? 0) + consumption)
    const durationMin = s.checkOut ? Math.max(0, Math.round((s.checkOut.getTime() - s.checkIn.getTime()) / 60000)) : null
    return {
      stayId: String(s.id), roomNumber: s.roomNumber, checkIn: s.checkIn, checkOut: s.checkOut,
      isEntry, isExit, durationMin, stayAmount, consumption, total,
      operator: s.paymentEmployee?.name ?? s.entryEmployee?.name ?? null,
    }
  })
  const totals = {
    entries: rows.filter((r) => r.isEntry).length,
    exits: rows.filter((r) => r.isExit).length,
    totalStay: round2(rows.reduce((a, r) => a + (r.stayAmount ?? 0), 0)),
    totalConsumption: round2(rows.reduce((a, r) => a + r.consumption, 0)),
    total: round2(rows.reduce((a, r) => a + r.total, 0)),
  }
  return { rows, totals }
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/server/report-movement.test.ts` → PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/server/data/reports.ts tests/server/report-movement.test.ts
git commit -m "feat(reports): movementReport (check-ins/outs in period)"
```

---

### Task 2: `staysOrdersReport`

**Files:**
- Modify: `src/server/data/reports.ts`
- Test: `tests/server/report-stays-orders.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StaysOrdersReport = { nStays: number; totalStay: number; avgTicket: number; nWalkins: number; totalConsumption: number }
  export async function staysOrdersReport(from: Date, to: Date): Promise<StaysOrdersReport>
  ```
  `nStays`/`totalStay` from closed `type='room'` stays with `checkOut` in range; `nWalkins` from closed `type='walkin'` in range; `totalConsumption` = sum of `consumptionAmount` across both.

- [ ] **Step 1: Write the failing test**

Create `tests/server/report-stays-orders.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { staysOrdersReport } from '@/server/data/reports'

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h)

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  await db.room.create({ data: { number: '99', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('staysOrdersReport', () => {
  it('counts room stays vs walk-ins and sums consumption in the period', async () => {
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 10), checkOut: at(2026, 7, 4, 12), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10 } })
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 13), checkOut: at(2026, 7, 4, 15), status: 'closed', day: 'normal', guests: 2, stayAmount: 100, consumptionAmount: 0 } })
    await db.stay.create({ data: { type: 'walkin', roomNumber: '99', checkIn: at(2026, 7, 4, 16), checkOut: at(2026, 7, 4, 16), status: 'closed', stayAmount: 0, consumptionAmount: 20 } })
    // outside the period
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 9, 10), checkOut: at(2026, 7, 9, 12), status: 'closed', day: 'normal', guests: 2, stayAmount: 999, consumptionAmount: 0 } })

    const r = await staysOrdersReport(at(2026, 7, 4), at(2026, 7, 4))
    expect(r.nStays).toBe(2)
    expect(r.totalStay).toBe(175)
    expect(r.avgTicket).toBe(87.5)
    expect(r.nWalkins).toBe(1)
    expect(r.totalConsumption).toBe(30) // 10 + 0 + 20
  })

  it('returns zeros for an empty period', async () => {
    const r = await staysOrdersReport(at(2026, 1, 1), at(2026, 1, 1))
    expect(r).toEqual({ nStays: 0, totalStay: 0, avgTicket: 0, nWalkins: 0, totalConsumption: 0 })
  })
})
```

Run: `pnpm test tests/server/report-stays-orders.test.ts` → FAIL.

- [ ] **Step 2: Implement**

Append to `src/server/data/reports.ts`:

```ts
export type StaysOrdersReport = { nStays: number; totalStay: number; avgTicket: number; nWalkins: number; totalConsumption: number }

export async function staysOrdersReport(from: Date, to: Date): Promise<StaysOrdersReport> {
  await requireReports()
  const { start, end } = dayRange(from, to)
  const rooms = await db.stay.findMany({
    where: { type: 'room', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { stayAmount: true, consumptionAmount: true },
  })
  const walkins = await db.stay.findMany({
    where: { type: 'walkin', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { consumptionAmount: true },
  })
  const nStays = rooms.length
  const totalStay = round2(rooms.reduce((a, s) => a + Number(s.stayAmount ?? 0), 0))
  const totalConsumption = round2(
    rooms.reduce((a, s) => a + Number(s.consumptionAmount ?? 0), 0) +
    walkins.reduce((a, s) => a + Number(s.consumptionAmount ?? 0), 0),
  )
  return {
    nStays, totalStay,
    avgTicket: nStays > 0 ? round2(totalStay / nStays) : 0,
    nWalkins: walkins.length, totalConsumption,
  }
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/server/report-stays-orders.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/data/reports.ts tests/server/report-stays-orders.test.ts
git commit -m "feat(reports): staysOrdersReport aggregate"
```

---

### Task 3: `barReport`

**Files:**
- Modify: `src/server/data/reports.ts`
- Test: `tests/server/report-bar.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BarRow = { productCode: string; description: string | null; category: string | null; qty: number; revenue: number }
  export type BarReport = { rows: BarRow[]; totals: { qty: number; revenue: number } }
  export async function barReport(from: Date, to: Date): Promise<BarReport>
  ```
  Groups `consumption` (by `createdAt` in range) per product: `qty` summed, `revenue = Σ qty*unitPrice`; sorted by `revenue` desc.

- [ ] **Step 1: Write the failing test**

Create `tests/server/report-bar.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { barReport } from '@/server/data/reports'

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h)

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'occupied', categoryId: cat.id } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true } })
  await db.product.create({ data: { code: 'AGU', description: 'Água', category: 'minibar', price: 5, cost: 2, stockQty: 50, minStock: 6, trackStock: true } })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 10), status: 'open', day: 'normal', guests: 2 } })
  // in-period consumptions
  await db.consumption.create({ data: { stayId: stay.id, productCode: 'CLA', qty: 3, unitPrice: 10, createdAt: at(2026, 7, 4, 11) } })
  await db.consumption.create({ data: { stayId: stay.id, productCode: 'AGU', qty: 2, unitPrice: 5, createdAt: at(2026, 7, 4, 12) } })
  // out of period
  await db.consumption.create({ data: { stayId: stay.id, productCode: 'CLA', qty: 9, unitPrice: 10, createdAt: at(2026, 7, 9, 12) } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('barReport', () => {
  it('sums qty and revenue per product in the period, ordered by revenue desc', async () => {
    const r = await barReport(at(2026, 7, 4), at(2026, 7, 4))
    expect(r.rows.map((x) => x.productCode)).toEqual(['CLA', 'AGU']) // 30 > 10
    const cla = r.rows[0]
    expect(cla.qty).toBe(3); expect(cla.revenue).toBe(30); expect(cla.description).toBe('Cerveja')
    expect(r.totals.qty).toBe(5); expect(r.totals.revenue).toBe(40)
  })
})
```

Run: `pnpm test tests/server/report-bar.test.ts` → FAIL.

- [ ] **Step 2: Implement**

Append to `src/server/data/reports.ts`:

```ts
export type BarRow = { productCode: string; description: string | null; category: string | null; qty: number; revenue: number }
export type BarReport = { rows: BarRow[]; totals: { qty: number; revenue: number } }

export async function barReport(from: Date, to: Date): Promise<BarReport> {
  await requireReports()
  const { start, end } = dayRange(from, to)
  const items = await db.consumption.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: { productCode: true, qty: true, unitPrice: true, product: { select: { description: true, category: true } } },
  })
  const byProduct = new Map<string, BarRow>()
  for (const it of items) {
    const key = it.productCode ?? '?'
    const row = byProduct.get(key) ?? { productCode: key, description: it.product?.description ?? null, category: it.product?.category ?? null, qty: 0, revenue: 0 }
    row.qty += it.qty
    row.revenue += it.qty * Number(it.unitPrice)
    byProduct.set(key, row)
  }
  const rows = [...byProduct.values()]
    .map((r) => ({ ...r, revenue: round2(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || a.productCode.localeCompare(b.productCode))
  return {
    rows,
    totals: { qty: rows.reduce((a, r) => a + r.qty, 0), revenue: round2(rows.reduce((a, r) => a + r.revenue, 0)) },
  }
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/server/report-bar.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/data/reports.ts tests/server/report-bar.test.ts
git commit -m "feat(reports): barReport (consumption by product)"
```

---

### Task 4: `operatorReport`

**Files:**
- Modify: `src/server/data/reports.ts`
- Test: `tests/server/report-operator.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type OperatorRow = { employeeId: number | null; operator: string | null; aptos: number; received: number; avgTicket: number }
  export type OperatorReport = { rows: OperatorRow[]; totals: { aptos: number; received: number } }
  export async function operatorReport(from: Date, to: Date): Promise<OperatorReport>
  ```
  Groups closed `type='room'` stays (`checkOut` in range) by `paymentEmployeeId`: `aptos` count, `received = Σ (stayAmount + consumptionAmount)`, `avgTicket`; joined operator name; sorted by `received` desc.

- [ ] **Step 1: Write the failing test**

Create `tests/server/report-operator.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { operatorReport } from '@/server/data/reports'

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h)

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Ana', username: 'ana', role: 'reception', passwordHash: 'x' } })
  await db.employee.create({ data: { id: 2, name: 'Bia', username: 'bia', role: 'reception', passwordHash: 'x' } })
  await db.employee.create({ data: { id: 9, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 9, name: 'Boss', role: 'manager' }
})

describe('operatorReport', () => {
  it('groups by who received payment, summing stay + consumption', async () => {
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 8), checkOut: at(2026, 7, 4, 10), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10, paymentEmployeeId: 1 } })
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 11), checkOut: at(2026, 7, 4, 13), status: 'closed', day: 'normal', guests: 2, stayAmount: 100, consumptionAmount: 0, paymentEmployeeId: 1 } })
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 14), checkOut: at(2026, 7, 4, 16), status: 'closed', day: 'normal', guests: 2, stayAmount: 50, consumptionAmount: 5, paymentEmployeeId: 2 } })

    const r = await operatorReport(at(2026, 7, 4), at(2026, 7, 4))
    expect(r.rows.map((x) => x.operator)).toEqual(['Ana', 'Bia']) // 185 > 55
    const ana = r.rows[0]
    expect(ana.aptos).toBe(2); expect(ana.received).toBe(185); expect(ana.avgTicket).toBe(92.5)
    expect(r.totals.aptos).toBe(3); expect(r.totals.received).toBe(240)
  })
})
```

Run: `pnpm test tests/server/report-operator.test.ts` → FAIL.

- [ ] **Step 2: Implement**

Append to `src/server/data/reports.ts`:

```ts
export type OperatorRow = { employeeId: number | null; operator: string | null; aptos: number; received: number; avgTicket: number }
export type OperatorReport = { rows: OperatorRow[]; totals: { aptos: number; received: number } }

export async function operatorReport(from: Date, to: Date): Promise<OperatorReport> {
  await requireReports()
  const { start, end } = dayRange(from, to)
  const stays = await db.stay.findMany({
    where: { type: 'room', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { stayAmount: true, consumptionAmount: true, paymentEmployeeId: true, paymentEmployee: { select: { name: true } } },
  })
  const byOp = new Map<string, OperatorRow>()
  for (const s of stays) {
    const key = s.paymentEmployeeId != null ? String(s.paymentEmployeeId) : 'null'
    const row = byOp.get(key) ?? { employeeId: s.paymentEmployeeId ?? null, operator: s.paymentEmployee?.name ?? null, aptos: 0, received: 0, avgTicket: 0 }
    row.aptos += 1
    row.received += Number(s.stayAmount ?? 0) + Number(s.consumptionAmount ?? 0)
    byOp.set(key, row)
  }
  const rows = [...byOp.values()]
    .map((r) => ({ ...r, received: round2(r.received), avgTicket: r.aptos > 0 ? round2(r.received / r.aptos) : 0 }))
    .sort((a, b) => b.received - a.received)
  return {
    rows,
    totals: { aptos: rows.reduce((a, r) => a + r.aptos, 0), received: round2(rows.reduce((a, r) => a + r.received, 0)) },
  }
}
```

- [ ] **Step 3: Run to verify it passes + full suite**

Run: `pnpm test tests/server/report-operator.test.ts` → PASS. Then `pnpm test` → all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/data/reports.ts tests/server/report-operator.test.ts
git commit -m "feat(reports): operatorReport (by who received payment)"
```
