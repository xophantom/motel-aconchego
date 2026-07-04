# Financeiro 1 — Migração + Centros de Custo + Contas (CRUD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `LedgerEntry` with `kind`/`employeeId`/`createdAt`, add the `finance:manage` RBAC action, and build the read/write DAL for cost centers and ledger entries (contas), all gated to managers and emitting audit events.

**Architecture:** Prisma migration adds an enum + columns + index. A new `server-only` DAL `src/server/data/finance.ts` holds cost-center and entry CRUD, each authz-checked via `can(role, 'finance:manage')` and each mutation calling `logEvent`. Slice 1 of 3 (spec `docs/superpowers/specs/2026-07-03-financeiro-design.md`); slice 2 = faturamento DAL, slice 3 = UI/actions/CSV/PDF.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, TypeScript, Zod.

## Global Constraints

- **Prisma imports:** client, model types, enums (`LedgerKind`), and `Prisma` namespace from `@/generated/prisma/client` — never `@prisma/client`.
- **DB singleton:** `import { db } from '@/server/db'`. **server-only** at the top of every DAL file.
- **Sign convention:** `LedgerEntry.amount` is always **positive**; direction comes from `kind` (`expense` | `income`).
- **Audit:** every finance mutation calls `logEvent` from `@/server/audit` at the end of its happy path (best-effort; already merged).
- **Tests:** Vitest. Just run `pnpm test` (vitest.config points at the test DB). Mock `server-only` + `@/server/session`. After the migration, apply it to the test DB: `DATABASE_URL="$DATABASE_URL_TEST" pnpm prisma migrate deploy`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.
- **Civil dates:** dates are handled in local time (mirror `monthlyOccupancy`, which uses `new Date(year, month-1, day)`).

---

### Task 1: Migration (`LedgerKind`, `kind`, `employeeId`, `createdAt`, index) + `finance:manage`

**Files:**
- Modify: `prisma/schema.prisma` (`LedgerEntry` model ~260, `Employee` model for back-relation)
- Modify: `src/lib/rbac.ts`
- Create: `prisma/migrations/<ts>_finance_kind/migration.sql` (generated)
- Test: `tests/lib/rbac-finance.test.ts`

**Interfaces:**
- Produces: enum `LedgerKind { expense | income }`; `LedgerEntry.kind LedgerKind`, `LedgerEntry.employeeId Int?`, `LedgerEntry.createdAt DateTime @default(now())`, `@@index([entryDate])`; `Action` union includes `'finance:manage'` (manager only).

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, add the enum near the other enums:

```prisma
enum LedgerKind {
  expense
  income

  @@map("ledger_kind")
}
```

Replace the `LedgerEntry` model with:

```prisma
model LedgerEntry {
  id          BigInt      @id @default(autoincrement())
  entryDate   DateTime    @map("entry_date") @db.Date
  kind        LedgerKind
  description String
  amount      Decimal     @db.Decimal(10, 2)
  costCenter  String?     @map("cost_center")
  employeeId  Int?        @map("employee_id")
  createdAt   DateTime    @default(now()) @map("created_at") @db.Timestamptz
  center      CostCenter? @relation(fields: [costCenter], references: [code])
  employee    Employee?   @relation(fields: [employeeId], references: [id])

  @@index([entryDate])
  @@map("ledger_entry")
}
```

In the `Employee` model, add a back-relation field next to its other relations (e.g. after `events EventLog[]`):

```prisma
  ledgerEntries LedgerEntry[]
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm prisma migrate dev --name finance_kind`
Expected: creates `prisma/migrations/<ts>_finance_kind/migration.sql` containing roughly:

```sql
-- CreateEnum
CREATE TYPE "ledger_kind" AS ENUM ('expense', 'income');
-- AlterTable
ALTER TABLE "ledger_entry" ADD COLUMN "kind" "ledger_kind" NOT NULL,
ADD COLUMN "employee_id" INTEGER,
ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- CreateIndex
CREATE INDEX "ledger_entry_entry_date_idx" ON "ledger_entry"("entry_date");
-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT ... FOREIGN KEY ("employee_id") ...
```

> If the `ledger_entry` table already has rows, `kind NOT NULL` without a default fails. It is empty in dev; if migrate objects, add a temporary default (`DEFAULT 'expense'`) in the generated SQL, then drop it — do not leave a default on `kind`.

- [ ] **Step 3: Add the RBAC action + failing test**

Create `tests/lib/rbac-finance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('finance:manage', () => {
  it('is granted to manager only', () => {
    expect(can('manager', 'finance:manage')).toBe(true)
    expect(can('reception', 'finance:manage')).toBe(false)
    expect(can('housekeeper', 'finance:manage')).toBe(false)
  })
})
```

Run: `pnpm test tests/lib/rbac-finance.test.ts` → FAIL (type rejects `'finance:manage'`).

Then in `src/lib/rbac.ts` add `'finance:manage'` to the `Action` union and to the `manager` array only.

- [ ] **Step 4: Verify RBAC test + build**

Run: `pnpm test tests/lib/rbac-finance.test.ts` → PASS.
Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm prisma migrate deploy` (apply to test DB), then `pnpm build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/rbac.ts tests/lib/rbac-finance.test.ts
git commit -m "feat(finance): LedgerEntry kind/employeeId/createdAt migration + finance:manage RBAC"
```

---

### Task 2: Validation schemas

**Files:**
- Create: `src/lib/validation/finance.ts`

**Interfaces:**
- Produces:
  ```ts
  export const costCenterSchema: z.ZodType<{ code: string; description: string }>
  export type CostCenterInput = { code: string; description: string }
  export const entrySchema  // { entryDate: string 'YYYY-MM-DD'; kind: 'expense'|'income'; amount: number; description: string; costCenter?: string | null }
  export type EntryInput = z.infer<typeof entrySchema>
  ```

- [ ] **Step 1: Write the schemas**

Create `src/lib/validation/finance.ts`:

```ts
import { z } from 'zod'

export const costCenterSchema = z.object({
  code: z.string().min(1).max(20),
  description: z.string().min(1),
})
export type CostCenterInput = z.infer<typeof costCenterSchema>

export const entrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  kind: z.enum(['expense', 'income']),
  amount: z.coerce.number().positive(),
  description: z.string().min(1),
  costCenter: z.string().min(1).nullish(),
})
export type EntryInput = z.infer<typeof entrySchema>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build` → succeeds (schema is only referenced once it's imported; this step just confirms it compiles). Alternatively `pnpm tsc --noEmit` if configured.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validation/finance.ts
git commit -m "feat(finance): zod schemas for cost centers and entries"
```

---

### Task 3: DAL — cost centers (`listCostCenters`/`upsertCostCenter`/`deleteCostCenter`)

**Files:**
- Create: `src/server/data/finance.ts`
- Test: `tests/server/finance-centers.test.ts`

**Interfaces:**
- Consumes: `db`, `getCurrentUser`, `can`, `logEvent`.
- Produces:
  ```ts
  export async function listCostCenters(): Promise<{ code: string; description: string; entryCount: number }[]>
  export async function upsertCostCenter(input: { code: string; description: string }): Promise<{ code: string; description: string }>
  export async function deleteCostCenter(code: string): Promise<void>  // throws Error('Centro em uso') if entries exist
  ```
  All three require `finance:manage`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/finance-centers.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listCostCenters, upsertCostCenter, deleteCostCenter } from '@/server/data/finance'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.ledgerEntry.deleteMany()
  await db.costCenter.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('cost centers', () => {
  it('reception is forbidden', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    await expect(listCostCenters()).rejects.toThrow(/forbidden/i)
    await expect(upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })).rejects.toThrow(/forbidden/i)
  })

  it('creates, updates (upsert), and lists with entry counts', async () => {
    await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
    await upsertCostCenter({ code: 'LIMP', description: 'Limpeza & higiene' })
    const centers = await listCostCenters()
    expect(centers).toHaveLength(1)
    expect(centers[0].description).toBe('Limpeza & higiene')
    expect(centers[0].entryCount).toBe(0)
  })

  it('deletes an unused center', async () => {
    await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
    await deleteCostCenter('LIMP')
    expect(await listCostCenters()).toHaveLength(0)
  })

  it('blocks delete when entries reference the center', async () => {
    await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
    await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 4), kind: 'expense', amount: 10, description: 'Sabão', costCenter: 'LIMP' } })
    await expect(deleteCostCenter('LIMP')).rejects.toThrow(/uso/i)
    expect(await listCostCenters()).toHaveLength(1)
  })

  it('emits audit events on upsert and delete', async () => {
    await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
    await deleteCostCenter('LIMP')
    const up = await db.eventLog.findMany({ where: { type: 'finance.costcenter.upsert' } })
    const del = await db.eventLog.findMany({ where: { type: 'finance.costcenter.delete' } })
    expect(up).toHaveLength(1)
    expect(del).toHaveLength(1)
  })
})
```

Run: `pnpm test tests/server/finance-centers.test.ts` → FAIL (module missing).

- [ ] **Step 2: Write the DAL (cost-center half)**

Create `src/server/data/finance.ts`:

```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'

async function requireFinance() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'finance:manage')) throw new Error('Forbidden')
  return me
}

export async function listCostCenters() {
  await requireFinance()
  const centers = await db.costCenter.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, description: true, _count: { select: { entries: true } } },
  })
  return centers.map((c) => ({ code: c.code, description: c.description, entryCount: c._count.entries }))
}

export async function upsertCostCenter(input: { code: string; description: string }) {
  await requireFinance()
  const center = await db.costCenter.upsert({
    where: { code: input.code },
    create: { code: input.code, description: input.description },
    update: { description: input.description },
  })
  await logEvent({ type: 'finance.costcenter.upsert', description: `Centro de custo ${center.code} salvo`, entity: 'costCenter', entityId: center.code })
  return center
}

export async function deleteCostCenter(code: string) {
  await requireFinance()
  const count = await db.ledgerEntry.count({ where: { costCenter: code } })
  if (count > 0) throw new Error('Centro em uso: possui lançamentos vinculados')
  await db.costCenter.delete({ where: { code } })
  await logEvent({ type: 'finance.costcenter.delete', description: `Centro de custo ${code} removido`, entity: 'costCenter', entityId: code })
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/server/finance-centers.test.ts` → PASS (5 tests).

- [ ] **Step 4: Commit**

```bash
git add src/server/data/finance.ts tests/server/finance-centers.test.ts
git commit -m "feat(finance): cost-center DAL (list/upsert/delete) + audit"
```

---

### Task 4: DAL — entries CRUD (`listEntries`/`createEntry`/`updateEntry`/`deleteEntry`)

**Files:**
- Modify: `src/server/data/finance.ts`
- Test: `tests/server/finance-entries.test.ts`

**Interfaces:**
- Consumes: everything from Task 3 plus `LedgerKind` type.
- Produces:
  ```ts
  export type EntryFilter = { from: Date; to: Date; costCenter?: string; kind?: 'expense' | 'income' }
  export type EntryDTO = { entryDate: Date; kind: 'expense' | 'income'; amount: number; description: string; costCenter?: string | null }
  export type EntryRow = {
    id: bigint; entryDate: Date; kind: 'expense' | 'income'; amount: number
    description: string; costCenter: string | null; centerDescription: string | null; operatorName: string | null
  }
  export async function listEntries(filter: EntryFilter): Promise<EntryRow[]>
  export async function createEntry(input: EntryDTO): Promise<{ id: bigint }>
  export async function updateEntry(id: bigint, input: EntryDTO): Promise<{ id: bigint }>
  export async function deleteEntry(id: bigint): Promise<void>
  ```
  All require `finance:manage`. `listEntries` orders `entryDate` desc, then `id` desc.

- [ ] **Step 1: Write the failing test**

Create `tests/server/finance-entries.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { createEntry, updateEntry, deleteEntry, listEntries, upsertCostCenter } from '@/server/data/finance'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.ledgerEntry.deleteMany()
  await db.costCenter.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
  await upsertCostCenter({ code: 'LIMP', description: 'Limpeza' })
})

describe('entries CRUD', () => {
  it('reception is forbidden', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    await expect(createEntry({ entryDate: D(2026, 7, 4), kind: 'expense', amount: 10, description: 'x' })).rejects.toThrow(/forbidden/i)
  })

  it('creates an entry with the acting operator and audit event', async () => {
    const { id } = await createEntry({ entryDate: D(2026, 7, 4), kind: 'expense', amount: 25.5, description: 'Sabão', costCenter: 'LIMP' })
    const row = await db.ledgerEntry.findUniqueOrThrow({ where: { id } })
    expect(Number(row.amount)).toBe(25.5)
    expect(row.kind).toBe('expense')
    expect(row.employeeId).toBe(1)
    expect(await db.eventLog.count({ where: { type: 'finance.entry.create' } })).toBe(1)
  })

  it('updates and deletes an entry (with audit)', async () => {
    const { id } = await createEntry({ entryDate: D(2026, 7, 4), kind: 'income', amount: 100, description: 'Reembolso' })
    await updateEntry(id, { entryDate: D(2026, 7, 4), kind: 'income', amount: 120, description: 'Reembolso corrigido' })
    expect(Number((await db.ledgerEntry.findUniqueOrThrow({ where: { id } })).amount)).toBe(120)
    await deleteEntry(id)
    expect(await db.ledgerEntry.count()).toBe(0)
    expect(await db.eventLog.count({ where: { type: 'finance.entry.update' } })).toBe(1)
    expect(await db.eventLog.count({ where: { type: 'finance.entry.delete' } })).toBe(1)
  })

  it('lists filtered by period, center and kind; joins center + operator', async () => {
    await createEntry({ entryDate: D(2026, 7, 1), kind: 'expense', amount: 10, description: 'A', costCenter: 'LIMP' })
    await createEntry({ entryDate: D(2026, 7, 5), kind: 'income', amount: 20, description: 'B' })
    await createEntry({ entryDate: D(2026, 8, 1), kind: 'expense', amount: 30, description: 'C', costCenter: 'LIMP' })
    const all = await listEntries({ from: D(2026, 7, 1), to: D(2026, 7, 31) })
    expect(all.map((e) => e.description)).toEqual(['B', 'A']) // entryDate desc
    expect(all[1].centerDescription).toBe('Limpeza')
    expect(all[0].operatorName).toBe('Boss')
    const onlyExpense = await listEntries({ from: D(2026, 7, 1), to: D(2026, 7, 31), kind: 'expense' })
    expect(onlyExpense.map((e) => e.description)).toEqual(['A'])
    const onlyLimp = await listEntries({ from: D(2026, 7, 1), to: D(2026, 8, 31), costCenter: 'LIMP' })
    expect(onlyLimp.map((e) => e.description)).toEqual(['C', 'A'])
  })
})
```

Run: `pnpm test tests/server/finance-entries.test.ts` → FAIL (functions missing).

- [ ] **Step 2: Append the entries DAL**

Add to `src/server/data/finance.ts` (import the type at the top: `import type { LedgerKind } from '@/generated/prisma/client'` and `import { Prisma } from '@/generated/prisma/client'`):

```ts
export type EntryFilter = { from: Date; to: Date; costCenter?: string; kind?: LedgerKind }
export type EntryDTO = { entryDate: Date; kind: LedgerKind; amount: number; description: string; costCenter?: string | null }
export type EntryRow = {
  id: bigint; entryDate: Date; kind: LedgerKind; amount: number
  description: string; costCenter: string | null; centerDescription: string | null; operatorName: string | null
}

export async function listEntries(filter: EntryFilter): Promise<EntryRow[]> {
  await requireFinance()
  const where: Prisma.LedgerEntryWhereInput = { entryDate: { gte: filter.from, lte: filter.to } }
  if (filter.costCenter) where.costCenter = filter.costCenter
  if (filter.kind) where.kind = filter.kind
  const rows = await db.ledgerEntry.findMany({
    where,
    orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
    select: {
      id: true, entryDate: true, kind: true, amount: true, description: true, costCenter: true,
      center: { select: { description: true } }, employee: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id, entryDate: r.entryDate, kind: r.kind, amount: Number(r.amount), description: r.description,
    costCenter: r.costCenter, centerDescription: r.center?.description ?? null, operatorName: r.employee?.name ?? null,
  }))
}

export async function createEntry(input: EntryDTO) {
  const me = await requireFinance()
  const entry = await db.ledgerEntry.create({
    data: {
      entryDate: input.entryDate, kind: input.kind, amount: input.amount,
      description: input.description, costCenter: input.costCenter ?? null, employeeId: me.id,
    },
  })
  await logEvent({ type: 'finance.entry.create', description: `${input.kind === 'income' ? 'Receita' : 'Despesa'} R$ ${input.amount.toFixed(2)} · ${input.description}`, entity: 'ledgerEntry', entityId: String(entry.id) })
  return { id: entry.id }
}

export async function updateEntry(id: bigint, input: EntryDTO) {
  await requireFinance()
  await db.ledgerEntry.update({
    where: { id },
    data: {
      entryDate: input.entryDate, kind: input.kind, amount: input.amount,
      description: input.description, costCenter: input.costCenter ?? null,
    },
  })
  await logEvent({ type: 'finance.entry.update', description: `Lançamento #${id} atualizado`, entity: 'ledgerEntry', entityId: String(id) })
  return { id }
}

export async function deleteEntry(id: bigint) {
  await requireFinance()
  await db.ledgerEntry.delete({ where: { id } })
  await logEvent({ type: 'finance.entry.delete', description: `Lançamento #${id} removido`, entity: 'ledgerEntry', entityId: String(id) })
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/server/finance-entries.test.ts` → PASS (4 tests). Then full suite: `pnpm test` → all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/data/finance.ts tests/server/finance-entries.test.ts
git commit -m "feat(finance): ledger-entry CRUD DAL (list/create/update/delete) + audit"
```
