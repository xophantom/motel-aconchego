# Fechamento de turno — Plano 1 (Modelo + ciclo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Base do fechamento de turno: método na retirada, tabela `CashPolicy` (fundo esperado), campos novos do `Shift`, auto-abertura com carry, e `shiftMetrics` estendido.

**Architecture:** Estende o subsistema de caixa que já existe (`src/server/data/shifts.ts`, `Shift`/`CashMovement`). Adiciona um enum `CashMethod`, uma tabela de config de 1 linha `CashPolicy`, e uma função `getOrOpenCurrentShift` que abre o turno automaticamente carregando o saldo do turno anterior. Sem UI nesta fatia.

**Tech Stack:** Next 16, Prisma 7 (`@/generated/prisma/client`), Vitest (env `node`, DB-backed), Postgres (local + Neon).

## Global Constraints

- **Prisma 7:** client/models de `@/generated/prisma/client`; DB `@/server/db`. Migração criada **contra o LOCAL** (o `.env` `DATABASE_URL` aponta pro Neon), depois `migrate deploy` no **test DB** e no **Neon** (URLs literais).
- **Turno por janela:** `currentPeriod`/`businessDateFor` de `@/lib/shift`; `Shift @@unique([businessDate, period])`.
- **Fórmula:** `saldo = saldo inicial + Σ movimentos`; estadia/consumo já entram como `CashMovement` (`type 'stay'/'consumption'`).
- **Fundo esperado:** default **150**. Diurno (`day_07_19`) diverge do esperado; noturno (`night_19_07`) não.
- **Tests:** `pnpm test`. Commits: Conventional Commits, **sem** `Co-Authored-By`. Shell: `rg <abs>`, nunca `cd &&`.

---

### Task 1: Migração — `CashMethod`, `CashPolicy`, campos do `Shift`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_fechamento_turno/migration.sql`
- Modify: `tests/setup.ts` (add `'cash_policy'` ao `APP_TABLES`)

**Interfaces:**
- Produces: `db.cashPolicy`; `CashMovement.method`; `Shift.closedById`/`Shift.expectedOpeningBalance`; relações nomeadas `Employee↔Shift`.

- [ ] **Step 1: Editar o schema**

Em `prisma/schema.prisma`:
```prisma
enum CashMethod {
  cash
  card
  @@map("cash_method")
}
```
No `model CashMovement`, adicione: `method CashMethod? @map("method")`.
No `model Shift`, adicione os campos e troque as relações de `Employee` por nomeadas:
```prisma
  closedById             Int?      @map("closed_by_id")
  expectedOpeningBalance Decimal?  @map("expected_opening_balance") @db.Decimal(10, 2)
  employee     Employee? @relation("shiftOpened", fields: [employeeId], references: [id])
  closedBy     Employee? @relation("shiftClosed", fields: [closedById], references: [id])
```
No `model Employee`, troque `shifts Shift[]` por:
```prisma
  shifts        Shift[]   @relation("shiftOpened")
  shiftsClosed  Shift[]   @relation("shiftClosed")
```
E adicione o model:
```prisma
model CashPolicy {
  id                     Int     @id @default(1)
  expectedOpeningBalance Decimal @default(150) @map("expected_opening_balance") @db.Decimal(10, 2)
  @@map("cash_policy")
}
```

- [ ] **Step 2: Gerar a migração contra o LOCAL (create-only)**

Run:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac?schema=public" pnpm prisma migrate dev --create-only --name fechamento_turno
```

- [ ] **Step 3: Anexar o seed do `cash_policy` ao `migration.sql`**

Ao final do `migration.sql` gerado:
```sql
INSERT INTO "cash_policy" ("id", "expected_opening_balance") VALUES (1, 150) ON CONFLICT DO NOTHING;
```

- [ ] **Step 4: Aplicar no LOCAL + regenerar client**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac?schema=public" pnpm prisma migrate dev`
Expected: "Applying migration … Your database is now in sync". (Se pedir reset ou for interativo, PARE e reporte BLOCKED.)

- [ ] **Step 5: Deploy no test DB e no Neon**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test?schema=public" pnpm prisma migrate deploy`
Run (endpoint direto): `DATABASE_URL="postgresql://neondb_owner:npg_2fOXtIKN4xuQ@ep-mute-breeze-ac583hg2.sa-east-1.aws.neon.tech/neondb?sslmode=require" pnpm prisma migrate deploy`
Expected: "All migrations have been successfully applied." nos dois.

- [ ] **Step 6: Registrar `cash_policy` na truncation dos testes**

Em `tests/setup.ts`, adicione `'cash_policy'` ao array `APP_TABLES` (sem FK; CASCADE cobre).

- [ ] **Step 7: Confirmar que a suíte sobe**

Run: `pnpm test tests/lib/shift.test.ts`
Expected: PASS (schema/generate/setup válidos).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/setup.ts
git commit -m "feat(caixa): CashMethod + CashPolicy + campos closedBy/expectedOpening no Shift"
```

---

### Task 2: DAL `CashPolicy` (`getCashPolicy` / `updateCashPolicy`)

**Files:**
- Create: `src/server/data/cash-policy.ts`
- Test: `tests/server/data/cash-policy.test.ts`

**Interfaces:**
- Consumes: `db.cashPolicy` (Task 1).
- Produces:
  - `getCashPolicy(): Promise<{ expectedOpeningBalance: number }>` — autenticado; fallback 150.
  - `updateCashPolicy(v: number): Promise<{ expectedOpeningBalance: number }>` — `finance:manage`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/data/cash-policy.test.ts
import { vi, describe, it, expect } from 'vitest'
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { getCashPolicy, updateCashPolicy } from '@/server/data/cash-policy'
const manager = { id: 1, name: 'M', role: 'manager' }
const reception = { id: 2, name: 'R', role: 'reception' }

describe('cash policy DAL', () => {
  it('defaults to 150 when no row', async () => {
    session.current = manager
    expect(await getCashPolicy()).toEqual({ expectedOpeningBalance: 150 })
  })
  it('updates (manager) and reads back', async () => {
    session.current = manager
    expect(await updateCashPolicy(200)).toEqual({ expectedOpeningBalance: 200 })
    expect(await getCashPolicy()).toEqual({ expectedOpeningBalance: 200 })
  })
  it('reception cannot update', async () => {
    session.current = reception
    await expect(updateCashPolicy(200)).rejects.toThrow(/forbidden/i)
  })
  it('anonymous cannot read', async () => {
    session.current = null
    await expect(getCashPolicy()).rejects.toThrow(/forbidden/i)
  })
})
```

- [ ] **Step 2: Run test — fails** (`pnpm test tests/server/data/cash-policy.test.ts`) — módulo não existe.

- [ ] **Step 3: Implement**

```ts
// src/server/data/cash-policy.ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { logEvent } from '@/server/audit'

const DEFAULT_EXPECTED = 150

export async function getCashPolicy(): Promise<{ expectedOpeningBalance: number }> {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  const row = await db.cashPolicy.findUnique({ where: { id: 1 } })
  return { expectedOpeningBalance: row ? Number(row.expectedOpeningBalance) : DEFAULT_EXPECTED }
}

export async function updateCashPolicy(expectedOpeningBalance: number): Promise<{ expectedOpeningBalance: number }> {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'finance:manage')) throw new Error('Forbidden')
  const clean = Math.max(0, Math.round(expectedOpeningBalance * 100) / 100)
  const row = await db.cashPolicy.upsert({ where: { id: 1 }, update: { expectedOpeningBalance: clean }, create: { id: 1, expectedOpeningBalance: clean } })
  await logEvent({ type: 'cash.policy', description: `Fundo de caixa esperado: R$ ${clean.toFixed(2)}`, entity: 'cash_policy', entityId: '1' })
  return { expectedOpeningBalance: Number(row.expectedOpeningBalance) }
}
```

- [ ] **Step 4: Run test — passes.** Then `pnpm test` (full) — green.

- [ ] **Step 5: Commit**

```bash
git add src/server/data/cash-policy.ts tests/server/data/cash-policy.test.ts
git commit -m "feat(caixa): DAL CashPolicy (fundo de caixa esperado, finance:manage)"
```

---

### Task 3: Auto-abertura com carry (`getOrOpenCurrentShift`) + wiring

**Files:**
- Modify: `src/server/data/shifts.ts` (add `getOrOpenCurrentShift`; usar em `addCashMovement`)
- Modify: `src/server/data/stays.ts` e `src/server/data/consumption.ts` (resolver o turno via `getOrOpenCurrentShift`)
- Test: `tests/server/data/shift-open.test.ts`

**Interfaces:**
- Consumes: `getCashPolicy` (Task 2); `currentPeriod`/`businessDateFor`.
- Produces: `getOrOpenCurrentShift(): Promise<Shift>` — resolve/abre o turno do período atual; carry do último fechado (1º = fundo).

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/data/shift-open.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { getOrOpenCurrentShift } from '@/server/data/shifts'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'R', username: 'r', role: 'reception', passwordHash: 'x' } })
  session.current = { id: 1, name: 'R', role: 'reception' }
})

describe('getOrOpenCurrentShift', () => {
  it('opens with the configured expected float when there is no prior shift', async () => {
    const s = await getOrOpenCurrentShift()
    expect(Number(s.openingBalance)).toBe(150) // sem turno anterior → fundo (default 150)
    expect(s.closedAt).toBeNull()
  })
  it('is idempotent within the same period', async () => {
    const a = await getOrOpenCurrentShift()
    const b = await getOrOpenCurrentShift()
    expect(String(a.id)).toBe(String(b.id))
  })
  it('carries the closing balance of the last closed shift', async () => {
    await db.shift.create({ data: { businessDate: new Date('2020-01-01'), period: 'day_07_19', employeeId: 1, openedAt: new Date('2020-01-01T07:00:00'), closedAt: new Date('2020-01-01T19:00:00'), openingBalance: 150, closingBalance: 640 } })
    const s = await getOrOpenCurrentShift()
    expect(Number(s.openingBalance)).toBe(640)
  })
})
```

- [ ] **Step 2: Run test — fails** — função não existe.

- [ ] **Step 3: Implement `getOrOpenCurrentShift`** (append em `src/server/data/shifts.ts`)

```ts
import { getCashPolicy } from '@/server/data/cash-policy' // add ao topo

export async function getOrOpenCurrentShift() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  const now = new Date()
  const businessDate = businessDateFor(now)
  const period = currentPeriod(now)
  const existing = await db.shift.findUnique({ where: { businessDate_period: { businessDate, period } } })
  if (existing && !existing.closedAt) return existing
  if (existing && existing.closedAt) throw new Error('Caixa já fechado neste período')
  const last = await db.shift.findFirst({ where: { closedAt: { not: null } }, orderBy: { closedAt: 'desc' } })
  const { expectedOpeningBalance } = await getCashPolicy()
  const openingBalance = last ? Number(last.closingBalance ?? 0) : expectedOpeningBalance
  const expected = period === 'day_07_19' ? expectedOpeningBalance : openingBalance
  const shift = await db.shift.create({ data: { businessDate, period, employeeId: me.id, openedAt: now, openingBalance, expectedOpeningBalance: expected } })
  await logEvent({ type: 'shift.open', description: `Caixa aberto (auto) · saldo inicial R$ ${openingBalance.toFixed(2)}`, entity: 'shift', entityId: String(shift.id) })
  return shift
}
```

- [ ] **Step 4: Wire the callers**

- Em `src/server/data/shifts.ts`, `addCashMovement`: troque `const open = await getOpenShiftFor(now)` por `const open = await getOrOpenCurrentShift()` e use `open.id` (não mais `open?.id ?? null`).
- Em `src/server/data/stays.ts` e `src/server/data/consumption.ts`: onde hoje resolvem o turno aberto pra atribuir `shiftId` nos movimentos de `stay`/`consumption`, troque a resolução por `getOrOpenCurrentShift()` (importe de `@/server/data/shifts`) e use o `.id`. (Localize com `rg -n "getOpenShiftFor|openShiftId" /Users/leosperandio/Git/MotelAconchego/src/server/data`.)

- [ ] **Step 5: Run tests — pass.** Then `pnpm test` (full) — green (garante que checkout/venda avulsa continuam ok com o turno auto-aberto).

- [ ] **Step 6: Commit**

```bash
git add src/server/data/shifts.ts src/server/data/stays.ts src/server/data/consumption.ts tests/server/data/shift-open.test.ts
git commit -m "feat(caixa): auto-abertura do turno com carry (getOrOpenCurrentShift)"
```

---

### Task 4: `shiftMetrics` estendido (retirada por método, total, diferença)

**Files:**
- Modify: `src/server/data/shifts.ts` (`ShiftMetrics`, `shiftMetrics`, `ShiftLike`)
- Test: `tests/server/data/shift-metrics.test.ts`

**Interfaces:**
- Produces: `ShiftMetrics` ganha `retiradoDinheiro`, `retiradoCartao`, `total`, `openingDifference`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/data/shift-metrics.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
const session = vi.hoisted(() => ({ current: { id: 1, name: 'R', role: 'reception' } as any }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { shiftMetrics } from '@/server/data/shifts'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'R', username: 'r', role: 'reception', passwordHash: 'x' } })
})

describe('shiftMetrics — retirada por método', () => {
  it('splits withdrawals into dinheiro/cartão and computes total + diferença', async () => {
    const shift = await db.shift.create({ data: { businessDate: new Date('2020-01-02'), period: 'day_07_19', employeeId: 1, openedAt: new Date('2020-01-02T07:00:00'), openingBalance: 160, expectedOpeningBalance: 150 } })
    await db.cashMovement.create({ data: { type: 'withdrawal', method: 'cash', amount: -100, employeeId: 1, shiftId: shift.id, occurredAt: new Date('2020-01-02T10:00:00') } })
    await db.cashMovement.create({ data: { type: 'withdrawal', method: 'card', amount: -420, employeeId: 1, shiftId: shift.id, occurredAt: new Date('2020-01-02T10:05:00') } })
    const m = await shiftMetrics(shift)
    expect(m.retiradoDinheiro).toBe(100)
    expect(m.retiradoCartao).toBe(420)
    expect(m.openingDifference).toBe(10) // 160 − 150
    expect(m.total).toBe(m.totalEstadias + m.totalConsumo)
  })
})
```

- [ ] **Step 2: Run test — fails** — campos não existem.

- [ ] **Step 3: Implement**

Em `src/server/data/shifts.ts`:
- `ShiftLike` ganha `expectedOpeningBalance: unknown`.
- `ShiftMetrics` ganha `retiradoDinheiro: number; retiradoCartao: number; total: number; openingDifference: number`.
- Em `shiftMetrics`, troque o `select` dos movimentos por `{ type: true, amount: true, method: true }` e adicione:
```ts
  const sumMethod = (mth: string) => movs.filter((x) => x.type === 'withdrawal' && x.method === mth).reduce((a, x) => a + Math.abs(Number(x.amount)), 0)
  const expected = Number(shift.expectedOpeningBalance ?? shift.openingBalance)
```
e no objeto de retorno adicione:
```ts
    retiradoDinheiro: round2(sumMethod('cash')),
    retiradoCartao: round2(sumMethod('card')),
    total: round2(totalEstadias + totalConsumo),
    openingDifference: round2(Number(shift.openingBalance) - expected),
```

- [ ] **Step 4: Run test — passes.** Then `pnpm test` (full) — green.

- [ ] **Step 5: Commit**

```bash
git add src/server/data/shifts.ts tests/server/data/shift-metrics.test.ts
git commit -m "feat(caixa): shiftMetrics com retirada por método, total e diferença de abertura"
```

---

## Self-Review
- **Spec coverage:** `CashMethod` + `CashPolicy` + campos do `Shift` (Task 1) ✓; DAL CashPolicy (Task 2) ✓; auto-abertura/carry + fundo snapshot (Task 3) ✓; métricas estendidas (Task 4) ✓. Retirada/fechamento (Plano 2), relatório/print (Plano 3), UI (Plano 4).
- **Placeholders:** nenhum.
- **Type consistency:** `getOrOpenCurrentShift`/`getCashPolicy`/`shiftMetrics` consistentes; `expectedOpeningBalance` snapshot no Shift usado em `shiftMetrics`.
- **Riscos:** migração cria relações nomeadas `Employee↔Shift` — conferir que `Employee.shifts` vira `@relation("shiftOpened")`. Auto-abertura mantém a trava `@@unique([businessDate, period])` (fechar antes do fim do período impede reabrir no mesmo período — comportamento pré-existente; fora de escopo).
