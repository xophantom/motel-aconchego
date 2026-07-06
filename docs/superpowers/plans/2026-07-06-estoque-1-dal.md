# Reposição de estoque 1 — Migração + DAL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record stock entries and adjustments against `product.stockQty` with a `StockMovement` history (who/when/qty/reason/cost/note), gated by a new `stock:adjust` action, emitting audit events — consumption stays untouched (no double counting).

**Architecture:** Prisma migration adds `StockMovement` + `StockMovementReason` enum. A new `server-only` DAL `src/server/data/stock.ts` with `addStockMovement` (transactional: create movement + apply `stockQty += qty`, block negative results, optionally overwrite `cost`) and `listStockMovements`. Slice 1 of 2 (spec `docs/superpowers/specs/2026-07-03-reposicao-estoque-design.md`); slice 2 = actions + `/produtos` UI + nav + reception access.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, Zod, TypeScript.

## Global Constraints

- **Prisma imports** from `@/generated/prisma/client`; **DB singleton** `@/server/db`; **server-only**.
- **Depósito = `product.stockQty`** (existing). No separate warehouse entity.
- **Consumption is NOT a `StockMovement`** — the sale is already tracked in `consumption`; `StockMovement` is only manual entries/adjustments.
- **Sign:** `qty > 0` = entry, `qty < 0` = adjustment. A negative adjustment must not drive `stockQty` below 0 → error `insufficient stock`.
- **Audit:** `logEvent('stock.entry' | 'stock.adjust', …)`.
- **RBAC:** new `stock:adjust` (reception + manager). Product CRUD stays `product:manage` (manager).
- **Tests:** `pnpm test` (test DB auto). Mock `server-only` + `@/server/session`. After migration: `DATABASE_URL="$DATABASE_URL_TEST" pnpm prisma migrate deploy && pnpm prisma generate`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.

---

### Task 1: Migration (`StockMovement` + `StockMovementReason`) + `stock:adjust` RBAC

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/rbac.ts`
- Create: `prisma/migrations/<ts>_stock_movement/migration.sql` (generated)
- Test: `tests/lib/rbac-stock.test.ts`

**Interfaces:**
- Produces: enum `StockMovementReason { restock | loss | inventory | correction }`; `StockMovement` model; `Product.movements StockMovement[]`; `Action` union includes `'stock:adjust'` (reception + manager).

- [ ] **Step 1: Edit the schema**

Add the enum near the others in `prisma/schema.prisma`:

```prisma
enum StockMovementReason {
  restock
  loss
  inventory
  correction

  @@map("stock_movement_reason")
}
```

Add the model:

```prisma
model StockMovement {
  id          BigInt              @id @default(autoincrement())
  productCode String              @map("product_code")
  qty         Int
  reason      StockMovementReason
  unitCost    Decimal?            @map("unit_cost") @db.Decimal(10, 2)
  note        String?
  employeeId  Int?                @map("employee_id")
  createdAt   DateTime            @default(now()) @map("created_at") @db.Timestamptz
  product     Product             @relation(fields: [productCode], references: [code])
  employee    Employee?           @relation(fields: [employeeId], references: [id])

  @@index([productCode])
  @@map("stock_movement")
}
```

Add the back-relations: to `Product` (after `consumptions`):
```prisma
  movements    StockMovement[]
```
to `Employee` (after `staysCanceled`):
```prisma
  stockMovements StockMovement[]
```

- [ ] **Step 2: Generate + apply the migration**

Run: `pnpm prisma migrate dev --name stock_movement`
Expected: creates the enum type, the `stock_movement` table (empty — no backfill), FKs to `product` and `employee`, and the index. Then:
`DATABASE_URL="$DATABASE_URL_TEST" pnpm prisma migrate deploy && pnpm prisma generate`

- [ ] **Step 3: Add `stock:adjust` + failing test**

Create `tests/lib/rbac-stock.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('stock:adjust', () => {
  it('is granted to reception and manager, not housekeeper', () => {
    expect(can('manager', 'stock:adjust')).toBe(true)
    expect(can('reception', 'stock:adjust')).toBe(true)
    expect(can('housekeeper', 'stock:adjust')).toBe(false)
  })
})
```

Run: `pnpm test tests/lib/rbac-stock.test.ts` → FAIL.

In `src/lib/rbac.ts` add `'stock:adjust'` to the `Action` union, the `manager` array and the `reception` array.

- [ ] **Step 4: Verify + build**

Run: `pnpm test tests/lib/rbac-stock.test.ts` → PASS. Then `pnpm build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/rbac.ts tests/lib/rbac-stock.test.ts
git commit -m "feat(stock): StockMovement migration + stock:adjust RBAC"
```

---

### Task 2: Validation schema

**Files:**
- Create: `src/lib/validation/stock.ts`

**Interfaces:**
- Produces:
  ```ts
  export const stockMovementSchema  // { productCode: string; qty: number(int, ≠0); reason: 'restock'|'loss'|'inventory'|'correction'; unitCost?: number|null; note?: string|null }
  export type StockMovementInput = z.infer<typeof stockMovementSchema>
  ```

- [ ] **Step 1: Write it**

Create `src/lib/validation/stock.ts`:

```ts
import { z } from 'zod'

export const stockMovementSchema = z.object({
  productCode: z.string().min(1),
  qty: z.coerce.number().int().refine((n) => n !== 0, 'Quantidade não pode ser zero'),
  reason: z.enum(['restock', 'loss', 'inventory', 'correction']),
  unitCost: z.coerce.number().min(0).nullish(),
  note: z.string().trim().min(1).nullish(),
})
export type StockMovementInput = z.infer<typeof stockMovementSchema>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validation/stock.ts
git commit -m "feat(stock): zod schema for stock movements"
```

---

### Task 3: DAL — `addStockMovement`

**Files:**
- Create: `src/server/data/stock.ts`
- Test: `tests/server/stock-add.test.ts`

**Interfaces:**
- Consumes: `db`, `getCurrentUser`, `can`, `logEvent`, `StockMovementReason` type.
- Produces:
  ```ts
  export type StockInput = { productCode: string; qty: number; reason: StockMovementReason; unitCost?: number | null; note?: string | null }
  export async function addStockMovement(input: StockInput): Promise<{ code: string; stockQty: number; cost: number }>
  ```
  Requires `stock:adjust`. Throws `insufficient stock` if `stockQty + qty < 0`. On an entry (`qty > 0`) with `unitCost`, overwrites `product.cost`. Emits `stock.entry` (qty>0) or `stock.adjust` (qty<0).

- [ ] **Step 1: Write the failing test**

Create `tests/server/stock-add.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { addStockMovement } from '@/server/data/stock'

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.stockMovement.deleteMany(); await db.consumption.deleteMany()
  await db.product.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 5, minStock: 6, trackStock: true } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('addStockMovement', () => {
  it('an entry adds to stockQty and records a movement', async () => {
    const p = await addStockMovement({ productCode: 'CLA', qty: 12, reason: 'restock' })
    expect(p.stockQty).toBe(17)
    const movs = await db.stockMovement.findMany()
    expect(movs).toHaveLength(1)
    expect(movs[0].qty).toBe(12)
    expect(movs[0].employeeId).toBe(1)
  })

  it('an entry with unitCost overwrites product.cost', async () => {
    const p = await addStockMovement({ productCode: 'CLA', qty: 6, reason: 'restock', unitCost: 4.5 })
    expect(p.cost).toBe(4.5)
  })

  it('a negative adjustment reduces stock', async () => {
    const p = await addStockMovement({ productCode: 'CLA', qty: -2, reason: 'loss', note: 'quebra' })
    expect(p.stockQty).toBe(3)
  })

  it('rejects an adjustment that would go below zero', async () => {
    await expect(addStockMovement({ productCode: 'CLA', qty: -10, reason: 'inventory' })).rejects.toThrow(/insufficient stock/i)
    expect((await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })).stockQty).toBe(5) // unchanged
    expect(await db.stockMovement.count()).toBe(0)
  })

  it('housekeeper is forbidden', async () => {
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    await expect(addStockMovement({ productCode: 'CLA', qty: 1, reason: 'restock' })).rejects.toThrow(/forbidden/i)
  })

  it('emits stock.entry for a positive qty and stock.adjust for a negative one', async () => {
    await addStockMovement({ productCode: 'CLA', qty: 3, reason: 'restock' })
    await addStockMovement({ productCode: 'CLA', qty: -1, reason: 'loss' })
    expect(await db.eventLog.count({ where: { type: 'stock.entry' } })).toBe(1)
    expect(await db.eventLog.count({ where: { type: 'stock.adjust' } })).toBe(1)
  })
})
```

Run: `pnpm test tests/server/stock-add.test.ts` → FAIL.

- [ ] **Step 2: Implement `addStockMovement`**

Create `src/server/data/stock.ts`:

```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'
import type { StockMovementReason } from '@/generated/prisma/client'

async function requireStock() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stock:adjust')) throw new Error('Forbidden')
  return me
}

export type StockInput = { productCode: string; qty: number; reason: StockMovementReason; unitCost?: number | null; note?: string | null }

export async function addStockMovement(input: StockInput) {
  const me = await requireStock()
  if (input.qty === 0) throw new Error('qty must not be zero')
  const product = await db.product.findUniqueOrThrow({ where: { code: input.productCode } })
  if (product.stockQty + input.qty < 0) throw new Error('insufficient stock')
  const setCost = input.qty > 0 && input.unitCost != null
  const updated = await db.$transaction(async (tx) => {
    await tx.stockMovement.create({
      data: { productCode: input.productCode, qty: input.qty, reason: input.reason, unitCost: input.unitCost ?? null, note: input.note ?? null, employeeId: me.id },
    })
    return tx.product.update({
      where: { code: input.productCode },
      data: { stockQty: { increment: input.qty }, ...(setCost ? { cost: input.unitCost as number } : {}) },
    })
  })
  await logEvent({
    type: input.qty > 0 ? 'stock.entry' : 'stock.adjust',
    description: `${input.qty > 0 ? 'Entrada' : 'Ajuste'} ${input.qty > 0 ? '+' : ''}${input.qty} · ${product.description} (${input.productCode})${input.note ? ` · ${input.note}` : ''}`,
    entity: 'product', entityId: input.productCode,
  })
  return { code: updated.code, stockQty: updated.stockQty, cost: Number(updated.cost) }
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/server/stock-add.test.ts` → PASS (6 tests).

- [ ] **Step 4: Commit**

```bash
git add src/server/data/stock.ts tests/server/stock-add.test.ts
git commit -m "feat(stock): addStockMovement DAL (entry/adjust + audit)"
```

---

### Task 4: DAL — `listStockMovements` + consumption non-regression

**Files:**
- Modify: `src/server/data/stock.ts`
- Test: `tests/server/stock-list.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StockFilter = { productCode?: string; from?: Date; to?: Date; take?: number }
  export type StockRow = {
    id: bigint; createdAt: Date; productCode: string; productDescription: string | null
    qty: number; reason: StockMovementReason; unitCost: number | null; note: string | null; operatorName: string | null
  }
  export async function listStockMovements(filter: StockFilter): Promise<StockRow[]>
  ```
  Requires `stock:adjust`; orders `createdAt` desc; default `take: 50`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/stock-list.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { addStockMovement, listStockMovements } from '@/server/data/stock'
import { addConsumption } from '@/server/data/consumption'

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.stockMovement.deleteMany()
  await db.cashMovement.deleteMany(); await db.consumption.deleteMany(); await db.stay.deleteMany()
  await db.room.deleteMany(); await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  await db.product.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true } })
  await db.product.create({ data: { code: 'AGU', description: 'Água', category: 'minibar', price: 5, cost: 2, stockQty: 20, minStock: 6, trackStock: true } })
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('listStockMovements', () => {
  it('lists desc with product + operator, filterable by product', async () => {
    await addStockMovement({ productCode: 'CLA', qty: 10, reason: 'restock' })
    await addStockMovement({ productCode: 'AGU', qty: 5, reason: 'restock' })
    const all = await listStockMovements({})
    expect(all).toHaveLength(2)
    expect(all[0].productCode).toBe('AGU') // most recent first
    expect(all[0].operatorName).toBe('Boss')
    expect(all[0].productDescription).toBe('Água')
    const onlyCla = await listStockMovements({ productCode: 'CLA' })
    expect(onlyCla.map((m) => m.productCode)).toEqual(['CLA'])
  })

  it('is forbidden for housekeeper', async () => {
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    await expect(listStockMovements({})).rejects.toThrow(/forbidden/i)
  })
})

describe('consumption does not create a StockMovement (no double counting)', () => {
  it('addConsumption decrements stock via consumption only', async () => {
    const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
    await db.room.create({ data: { number: '01', status: 'occupied', categoryId: cat.id } })
    const stay = await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
    await addConsumption({ stayId: stay.id, productCode: 'CLA', qty: 2 })
    expect((await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })).stockQty).toBe(48) // 50 − 2
    expect(await db.stockMovement.count()).toBe(0) // consumption is NOT a stock movement
  })
})
```

Run: `pnpm test tests/server/stock-list.test.ts` → FAIL (function missing).

- [ ] **Step 2: Implement `listStockMovements`**

Append to `src/server/data/stock.ts` (add `import { Prisma } from '@/generated/prisma/client'` to the top imports):

```ts
export type StockFilter = { productCode?: string; from?: Date; to?: Date; take?: number }
export type StockRow = {
  id: bigint; createdAt: Date; productCode: string; productDescription: string | null
  qty: number; reason: StockMovementReason; unitCost: number | null; note: string | null; operatorName: string | null
}

export async function listStockMovements(filter: StockFilter): Promise<StockRow[]> {
  await requireStock()
  const where: Prisma.StockMovementWhereInput = {}
  if (filter.productCode) where.productCode = filter.productCode
  if (filter.from || filter.to) where.createdAt = { gte: filter.from, lte: filter.to }
  const rows = await db.stockMovement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filter.take ?? 50,
    select: {
      id: true, createdAt: true, productCode: true, qty: true, reason: true, unitCost: true, note: true,
      product: { select: { description: true } }, employee: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id, createdAt: r.createdAt, productCode: r.productCode, productDescription: r.product?.description ?? null,
    qty: r.qty, reason: r.reason, unitCost: r.unitCost != null ? Number(r.unitCost) : null, note: r.note, operatorName: r.employee?.name ?? null,
  }))
}
```

- [ ] **Step 3: Run to verify it passes + full suite**

Run: `pnpm test tests/server/stock-list.test.ts` → PASS. Then `pnpm test` → all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/data/stock.ts tests/server/stock-list.test.ts
git commit -m "feat(stock): listStockMovements + consumption non-regression test"
```
