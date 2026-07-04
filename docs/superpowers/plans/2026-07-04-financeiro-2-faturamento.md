# Financeiro 2 — Faturamento computado (DAL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute the daily financial statement (faturamento) from live data — stays, consumption, cash movements and ledger entries — with no persisted "closing" table, plus a monthly per-cost-center summary.

**Architecture:** Pure read functions appended to `src/server/data/finance.ts`, gated by `finance:manage`, aggregating by civil date exactly like `monthlyOccupancy`. No new tables. Slice 2 of 3 (spec `docs/superpowers/specs/2026-07-03-financeiro-design.md`); depends on slice 1 (migration + `finance:manage` + entries DAL).

**Tech Stack:** Next.js 16, Prisma 7, Vitest, TypeScript.

## Global Constraints

- **Prisma imports** from `@/generated/prisma/client`; **DB singleton** `@/server/db`; **server-only**.
- **Computed, not persisted:** the truth is the underlying rows. No closing table.
- **`net` definition (locked):** `net = (cashIn − cashOut) + income − expenses`. `stays` and `consumption` are **informational** columns and are NOT summed into `net` (their money already flows through cash movements at check-out / walk-in, so adding them would double-count).
- **Sign of cash:** `cashIn` = sum of positive `cash_movement.amount` that day; `cashOut` = absolute value of the sum of negative amounts that day.
- **Civil dates in local time:** a day is `[new Date(y,m,d), new Date(y,m,d+1))`. `entryDate` is a `@db.Date` and compared with `gte/lt` on local-midnight Dates.
- **Tests:** `pnpm test`. Mock `server-only` + `@/server/session`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.

---

### Task 1: `dailyStatement(date)`

**Files:**
- Modify: `src/server/data/finance.ts`
- Test: `tests/server/finance-statement.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DailyStatement = {
    date: string        // 'YYYY-MM-DD' (local civil date)
    stays: number       // informational: sum stayAmount of room stays closed that day
    consumption: number // informational: sum consumptionAmount of those stays + walk-ins closed that day
    cashIn: number
    cashOut: number
    expenses: number
    income: number
    net: number         // (cashIn - cashOut) + income - expenses
  }
  export async function dailyStatement(date: Date): Promise<DailyStatement>
  ```
  Requires `finance:manage`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/finance-statement.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { dailyStatement } from '@/server/data/finance'

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h)

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.ledgerEntry.deleteMany(); await db.costCenter.deleteMany()
  await db.cashMovement.deleteMany(); await db.consumption.deleteMany(); await db.stay.deleteMany()
  await db.room.deleteMany(); await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('dailyStatement', () => {
  it('is forbidden for reception', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    await expect(dailyStatement(at(2026, 7, 4))).rejects.toThrow(/forbidden/i)
  })

  it('aggregates stays, consumption, cash, and ledger for one civil day', async () => {
    // a room stay checked out on the 4th: stayAmount 75, consumption 10
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: at(2026, 7, 4, 10), checkOut: at(2026, 7, 4, 11), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10 } })
    // a walk-in closed on the 4th: consumption 20
    await db.stay.create({ data: { type: 'walkin', roomNumber: '99', checkIn: at(2026, 7, 4, 12), checkOut: at(2026, 7, 4, 12), status: 'closed', stayAmount: 0, consumptionAmount: 20 } })
    // cash: +85 (stay balance), +20 (walkin), -30 (sangria)
    await db.cashMovement.create({ data: { type: 'stay', amount: 85, occurredAt: at(2026, 7, 4, 11), employeeId: 1 } })
    await db.cashMovement.create({ data: { type: 'consumption', amount: 20, occurredAt: at(2026, 7, 4, 12), employeeId: 1 } })
    await db.cashMovement.create({ data: { type: 'withdrawal', amount: -30, occurredAt: at(2026, 7, 4, 13), employeeId: 1 } })
    // ledger: expense 40, income 15 on the 4th
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 4), kind: 'expense', amount: 40, description: 'Compra' } })
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 4), kind: 'income', amount: 15, description: 'Venda' } })
    // noise on the 5th (must be excluded)
    await db.cashMovement.create({ data: { type: 'supply', amount: 999, occurredAt: at(2026, 7, 5, 10), employeeId: 1 } })

    const s = await dailyStatement(at(2026, 7, 4))
    expect(s.date).toBe('2026-07-04')
    expect(s.stays).toBe(75)
    expect(s.consumption).toBe(30)          // 10 (room) + 20 (walk-in)
    expect(s.cashIn).toBe(105)              // 85 + 20
    expect(s.cashOut).toBe(30)              // |−30|
    expect(s.expenses).toBe(40)
    expect(s.income).toBe(15)
    expect(s.net).toBe(60)                  // (105 − 30) + 15 − 40
  })
})
```

Run: `pnpm test tests/server/finance-statement.test.ts` → FAIL (function missing).

- [ ] **Step 2: Implement `dailyStatement`**

Append to `src/server/data/finance.ts` (add `const round2 = (n: number) => Math.round(n * 100) / 100` near the top if not already present):

```ts
export type DailyStatement = {
  date: string
  stays: number
  consumption: number
  cashIn: number
  cashOut: number
  expenses: number
  income: number
  net: number
}

function civilDayBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return { start, end }
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export async function dailyStatement(date: Date): Promise<DailyStatement> {
  await requireFinance()
  const { start, end } = civilDayBounds(date)

  const roomStays = await db.stay.findMany({
    where: { type: 'room', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { stayAmount: true, consumptionAmount: true },
  })
  const walkins = await db.stay.findMany({
    where: { type: 'walkin', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { consumptionAmount: true },
  })
  const stays = roomStays.reduce((a, s) => a + Number(s.stayAmount ?? 0), 0)
  const consumption =
    roomStays.reduce((a, s) => a + Number(s.consumptionAmount ?? 0), 0) +
    walkins.reduce((a, s) => a + Number(s.consumptionAmount ?? 0), 0)

  const movs = await db.cashMovement.findMany({
    where: { occurredAt: { gte: start, lt: end } },
    select: { amount: true },
  })
  let cashIn = 0
  let cashOut = 0
  for (const m of movs) {
    const v = Number(m.amount)
    if (v >= 0) cashIn += v
    else cashOut += -v
  }

  const entries = await db.ledgerEntry.findMany({
    where: { entryDate: { gte: start, lt: end } },
    select: { kind: true, amount: true },
  })
  let expenses = 0
  let income = 0
  for (const e of entries) {
    if (e.kind === 'income') income += Number(e.amount)
    else expenses += Number(e.amount)
  }

  const net = cashIn - cashOut + income - expenses
  return {
    date: isoDate(date),
    stays: round2(stays), consumption: round2(consumption),
    cashIn: round2(cashIn), cashOut: round2(cashOut),
    expenses: round2(expenses), income: round2(income), net: round2(net),
  }
}
```

> If `round2` is already defined earlier in the file (from a prior task), do not redeclare it — reuse the existing one.

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/server/finance-statement.test.ts` → PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/server/data/finance.ts tests/server/finance-statement.test.ts
git commit -m "feat(finance): dailyStatement computed aggregation"
```

---

### Task 2: `statementRange(from, to)`

**Files:**
- Modify: `src/server/data/finance.ts`
- Test: `tests/server/finance-statement.test.ts` (extend)

**Interfaces:**
- Produces:
  ```ts
  export type StatementRange = { days: DailyStatement[]; totals: DailyStatement }
  export async function statementRange(from: Date, to: Date): Promise<StatementRange>
  ```
  `days` has one `DailyStatement` per civil day in `[from, to]` inclusive (ascending). `totals` sums each numeric field across days; `totals.date` is `''`. Requires `finance:manage`.

- [ ] **Step 1: Add the failing assertions**

Append to `tests/server/finance-statement.test.ts`:

```ts
import { statementRange } from '@/server/data/finance'

describe('statementRange', () => {
  it('produces one row per civil day and correct totals', async () => {
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 4), kind: 'expense', amount: 40, description: 'A' } })
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 5), kind: 'income', amount: 100, description: 'B' } })
    const r = await statementRange(new Date(2026, 6, 4), new Date(2026, 6, 6))
    expect(r.days.map((d) => d.date)).toEqual(['2026-07-04', '2026-07-05', '2026-07-06'])
    expect(r.days[0].expenses).toBe(40)
    expect(r.days[1].income).toBe(100)
    expect(r.totals.expenses).toBe(40)
    expect(r.totals.income).toBe(100)
    expect(r.totals.net).toBe(60) // (0) + 100 - 40
  })
})
```

Run: `pnpm test tests/server/finance-statement.test.ts` → the new block FAILs (function missing).

- [ ] **Step 2: Implement `statementRange`**

Append to `src/server/data/finance.ts`:

```ts
export type StatementRange = { days: DailyStatement[]; totals: DailyStatement }

export async function statementRange(from: Date, to: Date): Promise<StatementRange> {
  await requireFinance()
  const days: DailyStatement[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  // guard against an inverted or absurd range (cap at 366 iterations)
  for (let i = 0; cursor <= last && i < 366; i++) {
    days.push(await dailyStatement(new Date(cursor)))
    cursor.setDate(cursor.getDate() + 1)
  }
  const totals = days.reduce<DailyStatement>((t, d) => ({
    date: '',
    stays: t.stays + d.stays, consumption: t.consumption + d.consumption,
    cashIn: t.cashIn + d.cashIn, cashOut: t.cashOut + d.cashOut,
    expenses: t.expenses + d.expenses, income: t.income + d.income, net: t.net + d.net,
  }), { date: '', stays: 0, consumption: 0, cashIn: 0, cashOut: 0, expenses: 0, income: 0, net: 0 })
  const r2 = (n: number) => Math.round(n * 100) / 100
  totals.stays = r2(totals.stays); totals.consumption = r2(totals.consumption)
  totals.cashIn = r2(totals.cashIn); totals.cashOut = r2(totals.cashOut)
  totals.expenses = r2(totals.expenses); totals.income = r2(totals.income); totals.net = r2(totals.net)
  return { days, totals }
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/server/finance-statement.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/data/finance.ts tests/server/finance-statement.test.ts
git commit -m "feat(finance): statementRange (per-day list + totals)"
```

---

### Task 3: `costCenterMonthly(year, month)`

**Files:**
- Modify: `src/server/data/finance.ts`
- Test: `tests/server/finance-costcenter-monthly.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CostCenterMonthRow = { code: string | null; description: string | null; income: number; expense: number; net: number }
  export type CostCenterMonthly = { year: number; month: number; rows: CostCenterMonthRow[]; totals: { income: number; expense: number; net: number } }
  export async function costCenterMonthly(year: number, month: number): Promise<CostCenterMonthly>
  ```
  One row per cost center that has entries in the month, plus a `code: null` row for entries without a center. `net = income − expense` per row. Rows sorted by `code` (the null/"sem centro" row last). Requires `finance:manage`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/finance-costcenter-monthly.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { costCenterMonthly, upsertCostCenter } from '@/server/data/finance'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.ledgerEntry.deleteMany(); await db.costCenter.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
  await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
})

describe('costCenterMonthly', () => {
  it('groups income/expense/net per center, with a no-center row, month-scoped', async () => {
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 3), kind: 'expense', amount: 40, description: 'A', costCenter: 'LIMP' } })
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 10), kind: 'income', amount: 100, description: 'B', costCenter: 'LIMP' } })
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 15), kind: 'expense', amount: 25, description: 'C' } }) // no center
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 7, 1), kind: 'expense', amount: 999, description: 'next month' } })

    const r = await costCenterMonthly(2026, 7)
    const limp = r.rows.find((x) => x.code === 'LIMP')!
    const none = r.rows.find((x) => x.code === null)!
    expect(limp.income).toBe(100); expect(limp.expense).toBe(40); expect(limp.net).toBe(60)
    expect(none.expense).toBe(25); expect(none.income).toBe(0); expect(none.net).toBe(-25)
    expect(r.totals.income).toBe(100); expect(r.totals.expense).toBe(65); expect(r.totals.net).toBe(35)
  })
})
```

Run: `pnpm test tests/server/finance-costcenter-monthly.test.ts` → FAIL (function missing).

- [ ] **Step 2: Implement `costCenterMonthly`**

Append to `src/server/data/finance.ts`:

```ts
export type CostCenterMonthRow = { code: string | null; description: string | null; income: number; expense: number; net: number }
export type CostCenterMonthly = { year: number; month: number; rows: CostCenterMonthRow[]; totals: { income: number; expense: number; net: number } }

export async function costCenterMonthly(year: number, month: number): Promise<CostCenterMonthly> {
  await requireFinance()
  month = Math.min(12, Math.max(1, Math.trunc(month)))
  year = Math.min(2100, Math.max(2000, Math.trunc(year)))
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)
  const entries = await db.ledgerEntry.findMany({
    where: { entryDate: { gte: start, lt: end } },
    select: { kind: true, amount: true, costCenter: true, center: { select: { description: true } } },
  })
  const map = new Map<string, CostCenterMonthRow>()
  for (const e of entries) {
    const key = e.costCenter ?? ' ' // sentinel for the no-center bucket
    const row = map.get(key) ?? { code: e.costCenter ?? null, description: e.center?.description ?? null, income: 0, expense: 0, net: 0 }
    if (e.kind === 'income') row.income += Number(e.amount)
    else row.expense += Number(e.amount)
    map.set(key, row)
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  const rows = [...map.values()]
    .map((r) => ({ ...r, income: r2(r.income), expense: r2(r.expense), net: r2(r.income - r.expense) }))
    .sort((a, b) => {
      if (a.code === null) return 1
      if (b.code === null) return -1
      return a.code.localeCompare(b.code)
    })
  const totals = {
    income: r2(rows.reduce((a, r) => a + r.income, 0)),
    expense: r2(rows.reduce((a, r) => a + r.expense, 0)),
    net: r2(rows.reduce((a, r) => a + r.net, 0)),
  }
  return { year, month, rows, totals }
}
```

- [ ] **Step 3: Run to verify it passes + full suite**

Run: `pnpm test tests/server/finance-costcenter-monthly.test.ts` → PASS. Then `pnpm test` → all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/data/finance.ts tests/server/finance-costcenter-monthly.test.ts
git commit -m "feat(finance): costCenterMonthly summary"
```
