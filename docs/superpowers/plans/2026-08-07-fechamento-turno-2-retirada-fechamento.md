# Fechamento de turno — Plano 2 (Retirada + fechamento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirada com método (dinheiro/cartão) a qualquer hora, e fechamento que **computa** o saldo, grava quem fechou, cria a retirada final opcional e carrega o saldo pro próximo turno.

**Architecture:** Estende `addCashMovement`/`closeShift` (`src/server/data/shifts.ts`) e as validações/actions do caixa. `closeShift` deixa de receber saldo digitado — computa via `shiftMetrics` (Plano 1). A `/caixa` antiga continua funcionando (a UI é reformulada no Plano 4); nada é removido aqui.

**Tech Stack:** Next 16 (server actions), Prisma 7, Zod, Vitest (DB-backed).

## Global Constraints

- **Depende do Plano 1** (mergeado): `CashMethod`, campos do `Shift`, `getOrOpenCurrentShift`, `shiftMetrics` estendido.
- Retirada = `CashMovement type='withdrawal'` com `method`, valor **negativo**. Fechamento **não** apaga registros — só marca fechado; o próximo turno abre com o `closingBalance` (carry).
- **Não remover** `openShift`/`openShiftAction`/`OpenShiftForm` nesta fatia (a `/caixa` ainda usa; removido no Plano 4) — pra o build seguir verde.
- Tests: `pnpm test`. Commits: Conventional Commits, sem `Co-Authored-By`.

---

### Task 1: Validação — método na retirada + `closeShiftSchema`

**Files:**
- Modify: `src/lib/validation/shift.ts`
- Test: `tests/lib/validation-shift.test.ts`

**Interfaces:**
- Produces: `cashMovementSchema` com `method?`; `closeShiftSchema` (`finalWithdrawCash`/`finalWithdrawCard`); `CashMovementInput`, `CloseShiftInput`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/validation-shift.test.ts
import { describe, it, expect } from 'vitest'
import { cashMovementSchema, closeShiftSchema } from '@/lib/validation/shift'

describe('cashMovementSchema', () => {
  it('requires method on withdrawal', () => {
    expect(cashMovementSchema.safeParse({ type: 'withdrawal', amount: 100 }).success).toBe(false)
    expect(cashMovementSchema.safeParse({ type: 'withdrawal', amount: 100, method: 'cash' }).success).toBe(true)
  })
  it('does not require method on supply', () => {
    expect(cashMovementSchema.safeParse({ type: 'supply', amount: 50 }).success).toBe(true)
  })
})
describe('closeShiftSchema', () => {
  it('defaults final withdrawals to 0', () => {
    expect(closeShiftSchema.parse({})).toEqual({ finalWithdrawCash: 0, finalWithdrawCard: 0 })
  })
})
```

- [ ] **Step 2: Run test — fails.**

- [ ] **Step 3: Implement** (`src/lib/validation/shift.ts` — mantenha `openShiftSchema`)

```ts
import { z } from 'zod'

export const openShiftSchema = z.object({ openingBalance: z.coerce.number().min(0).default(0) })

export const cashMovementSchema = z.object({
  type: z.enum(['withdrawal', 'supply', 'correction']),
  amount: z.coerce.number().refine((n) => n !== 0, 'Valor não pode ser zero'),
  method: z.enum(['cash', 'card']).optional(),
  description: z.string().optional(),
}).refine((v) => v.type !== 'withdrawal' || v.method != null, { message: 'Método obrigatório na retirada', path: ['method'] })
export type CashMovementInput = z.infer<typeof cashMovementSchema>

export const closeShiftSchema = z.object({
  finalWithdrawCash: z.coerce.number().min(0).default(0),
  finalWithdrawCard: z.coerce.number().min(0).default(0),
})
export type CloseShiftInput = z.infer<typeof closeShiftSchema>
```

- [ ] **Step 4: Run test — passes.** Then `pnpm test` (full) — green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/shift.ts tests/lib/validation-shift.test.ts
git commit -m "feat(caixa): validação de método na retirada + closeShiftSchema"
```

---

### Task 2: `addCashMovement` com método + `closeShift` computado

**Files:**
- Modify: `src/server/data/shifts.ts`
- Test: `tests/server/data/shift-close.test.ts`

**Interfaces:**
- Consumes: `getOrOpenCurrentShift`, `shiftMetrics` (Plano 1); `CashMovementInput`, `CloseShiftInput`.
- Produces: `addCashMovement(input)` grava `method`; `closeShift(shiftId, input: CloseShiftInput): Promise<ShiftMetrics>` — cria retiradas finais, computa saldo, grava `closedAt`/`closedById`/`closingBalance`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/data/shift-close.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
const session = vi.hoisted(() => ({ current: { id: 1, name: 'R', role: 'reception' } as any }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { addCashMovement, closeShift, getOrOpenCurrentShift } from '@/server/data/shifts'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'R', username: 'r', role: 'reception', passwordHash: 'x' } })
})

describe('retirada + fechamento', () => {
  it('records a withdrawal with method', async () => {
    const s = await getOrOpenCurrentShift()
    await addCashMovement({ type: 'withdrawal', amount: 100, method: 'cash' })
    const m = await db.cashMovement.findFirstOrThrow({ where: { shiftId: s.id, type: 'withdrawal' } })
    expect(m.method).toBe('cash')
    expect(Number(m.amount)).toBe(-100)
  })

  it('close computes saldo, records final withdrawals, sets closedBy, and carries to next shift', async () => {
    const s = await getOrOpenCurrentShift() // opening 150
    const metrics = await closeShift(s.id, { finalWithdrawCash: 50, finalWithdrawCard: 0 })
    expect(metrics.retiradoDinheiro).toBe(50)
    expect(metrics.saldo).toBe(100) // 150 − 50
    const closed = await db.shift.findUniqueOrThrow({ where: { id: s.id } })
    expect(closed.closedById).toBe(1)
    expect(Number(closed.closingBalance)).toBe(100)
    // next auto-open carries 100
    const next = await getOrOpenCurrentShift()
    expect(String(next.id)).not.toBe(String(s.id))
    expect(Number(next.openingBalance)).toBe(100)
  })
})
```
_Nota: o teste depende de o período do turno não virar entre a abertura e o fechamento; roda em segundos, então ok. Se o `@@unique([businessDate, period])` reclamar do "próximo" turno no mesmo período, o teste do carry pode fechar `s` e criar o próximo período manualmente — mas em execução normal os dois `getOrOpenCurrentShift` caem no mesmo período; ajuste o teste do carry para criar o `next` com período diferente se necessário._

- [ ] **Step 2: Run test — fails.**

- [ ] **Step 3: Implement**

Em `src/server/data/shifts.ts`, `addCashMovement` — grave o método:
```ts
const mov = await db.cashMovement.create({
  data: { type: input.type, method: input.type === 'withdrawal' ? (input.method ?? null) : null, amount, employeeId: me.id, shiftId: open.id, occurredAt: now, description: input.description },
})
```
E substitua `closeShift`:
```ts
import type { CloseShiftInput } from '@/lib/validation/shift' // add ao topo (junto do CashMovementInput)

export async function closeShift(shiftId: bigint, input: CloseShiftInput): Promise<ShiftMetrics> {
  const me = await requireCash()
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId } })
  if (shift.closedAt) throw new Error('Caixa já fechado')
  const now = new Date()
  const finals: { method: 'cash' | 'card'; amount: number }[] = []
  if (input.finalWithdrawCash > 0) finals.push({ method: 'cash', amount: input.finalWithdrawCash })
  if (input.finalWithdrawCard > 0) finals.push({ method: 'card', amount: input.finalWithdrawCard })
  for (const f of finals) {
    await db.cashMovement.create({ data: { type: 'withdrawal', method: f.method, amount: -Math.abs(f.amount), employeeId: me.id, shiftId, occurredAt: now, description: 'Retirada no fechamento' } })
  }
  const fresh = await db.shift.findUniqueOrThrow({ where: { id: shiftId } })
  const metrics = await shiftMetrics(fresh)
  await db.shift.update({ where: { id: shiftId }, data: { closedAt: now, closedById: me.id, closingBalance: metrics.saldo } })
  await logEvent({ type: 'shift.close', description: `Caixa fechado · saldo R$ ${metrics.saldo.toFixed(2)}`, entity: 'shift', entityId: String(shiftId) })
  return metrics
}
```

- [ ] **Step 4: Run test — passes.** Then `pnpm test` (full) — green.

- [ ] **Step 5: Commit**

```bash
git add src/server/data/shifts.ts tests/server/data/shift-close.test.ts
git commit -m "feat(caixa): retirada com método + fechamento computado (closedBy, carry)"
```

---

### Task 3: Actions — método na retirada + fechamento

**Files:**
- Modify: `src/app/caixa/actions.ts`
- Test: `tests/app/caixa-actions.test.ts`

**Interfaces:**
- Consumes: `cashMovementSchema`/`closeShiftSchema`; `shifts.addCashMovement`/`shifts.closeShift`.
- Produces: `cashMovementAction` lê `method`; `closeShiftAction` lê `finalWithdrawCash`/`finalWithdrawCard`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/caixa-actions.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const addCashMovement = vi.hoisted(() => vi.fn(async () => ({})))
const closeShift = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock('@/server/data/shifts', () => ({ addCashMovement, closeShift, openShift: vi.fn() }))
import { cashMovementAction, closeShiftAction } from '@/app/caixa/actions'

function fd(obj: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(obj)) f.set(k, v); return f }
beforeEach(() => { addCashMovement.mockClear(); closeShift.mockClear() })

describe('caixa actions', () => {
  it('passes method on withdrawal', async () => {
    const out = await cashMovementAction({ ok: false }, fd({ type: 'withdrawal', amount: '100', method: 'card' }))
    expect(addCashMovement).toHaveBeenCalledWith(expect.objectContaining({ type: 'withdrawal', amount: 100, method: 'card' }))
    expect(out).toEqual({ ok: true })
  })
  it('rejects withdrawal without method', async () => {
    const out = await cashMovementAction({ ok: false }, fd({ type: 'withdrawal', amount: '100' }))
    expect(addCashMovement).not.toHaveBeenCalled()
    expect(out.ok).toBe(false)
  })
  it('closes with final withdrawals', async () => {
    const out = await closeShiftAction('7', { ok: false }, fd({ finalWithdrawCash: '50', finalWithdrawCard: '0' }))
    expect(closeShift).toHaveBeenCalledWith(7n, { finalWithdrawCash: 50, finalWithdrawCard: 0 })
    expect(out).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run test — fails.**

- [ ] **Step 3: Implement** (em `src/app/caixa/actions.ts`)

`cashMovementAction` — inclua `method`:
```ts
const parsed = cashMovementSchema.safeParse({ type: fd.get('type'), amount: fd.get('amount'), method: fd.get('method') ?? undefined, description: fd.get('description') ?? undefined })
```
`closeShiftAction` — use o novo schema:
```ts
export async function closeShiftAction(shiftId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = closeShiftSchema.safeParse({ finalWithdrawCash: fd.get('finalWithdrawCash') ?? 0, finalWithdrawCard: fd.get('finalWithdrawCard') ?? 0 })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await shifts.closeShift(BigInt(shiftId), parsed.data) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/caixa'); revalidatePath('/quartos')
  return { ok: true }
}
```
(Ajuste o import no topo: `import { openShiftSchema, closeShiftSchema, cashMovementSchema } from '@/lib/validation/shift'`.)

- [ ] **Step 4: Run test — passes.** Then `pnpm test` (full) — green.

- [ ] **Step 5: Commit**

```bash
git add src/app/caixa/actions.ts tests/app/caixa-actions.test.ts
git commit -m "feat(caixa): actions com método na retirada + fechamento por retirada final"
```

---

## Self-Review
- **Spec coverage:** método na retirada (Tasks 1-3) ✓; fechamento computa saldo + closedBy + carry + retirada final (Task 2) ✓; revalida `/caixa` e `/quartos` (Task 3) ✓.
- **Placeholders:** nenhum.
- **Type consistency:** `CashMovementInput`/`CloseShiftInput` da validação usados no DAL e nas actions; `closeShift` retorna `ShiftMetrics`.
- **Compat:** `openShift`/`openShiftAction`/`OpenShiftForm` intactos (removidos no Plano 4); `CloseShiftForm` antigo manda `closingBalance` (ignorado) — o fechamento roda com retiradas finais 0. Build verde.
