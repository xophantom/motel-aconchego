# Financeiro 3 — UI `/financeiro` + Actions + CSV/PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the manager-only `/financeiro` page with three sections (lançar contas, centros de custo, faturamento), server actions for the CRUD, and CSV/PDF export of the faturamento — plus the nav link.

**Architecture:** Server component page reads `finance:manage`-gated DAL (slices 1 & 2), renders three cards. Mutations go through Zod-validated server actions in `src/app/financeiro/actions.ts` (pattern `ActionState`, `revalidatePath('/financeiro')`). Export via Route Handlers `/financeiro/csv|pdf` reusing the `/relatorios` handler shape. Slice 3 of 3 (spec `docs/superpowers/specs/2026-07-03-financeiro-design.md`); depends on slices 1 & 2.

**Tech Stack:** Next.js 16 (App Router, server + client components, server actions), Prisma 7, Zod, @react-pdf/renderer, Vitest.

## Global Constraints

- **Reads via DAL** (authz inside); **mutations via server actions + Zod**; **`/financeiro/csv|pdf`** are Route Handlers that re-check `finance:manage` and return 403 otherwise.
- **Civil date:** the form sends `entryDate` as `'YYYY-MM-DD'`; the action converts it to a **local** `Date` via `new Date(y, m-1, d)` before calling the DAL.
- **Sign/colors:** despesa red, receita green, using existing tokens; `.tnum` on figures.
- **Page redirects to `/`** when the DAL throws `Forbidden` (mirror `/relatorios`, `/fidelidade`).
- **Tests:** `pnpm test`. Mock `server-only` + `@/server/session`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.
- **Shared period:** the page uses one `from`/`to` (query params) for both the entries list and the faturamento; `costCenter` query param filters the entries list; the monthly cost-center summary uses the month of `from`.

---

### Task 1: Server actions

**Files:**
- Create: `src/app/financeiro/actions.ts`
- Test: `tests/app/financeiro-actions.test.ts`

**Interfaces:**
- Consumes: DAL `createEntry`/`updateEntry`/`deleteEntry`/`upsertCostCenter`/`deleteCostCenter`, schemas from `@/lib/validation/finance`.
- Produces:
  ```ts
  export type ActionState = { ok: boolean; error?: string }
  export async function createEntryAction(_prev: ActionState, fd: FormData): Promise<ActionState>
  export async function updateEntryAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState>
  export async function deleteEntryAction(id: string): Promise<ActionState>
  export async function saveCostCenterAction(_prev: ActionState, fd: FormData): Promise<ActionState>
  export async function deleteCostCenterAction(code: string): Promise<ActionState>
  ```
  (`id` is a string because `LedgerEntry.id` is a `bigint`; the action does `BigInt(id)`.)

- [ ] **Step 1: Write the failing test**

Create `tests/app/financeiro-actions.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { createEntryAction, deleteEntryAction, saveCostCenterAction } from '@/app/financeiro/actions'

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const k in o) f.set(k, o[k]); return f }

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.ledgerEntry.deleteMany(); await db.costCenter.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('financeiro actions', () => {
  it('createEntryAction validates and persists with a local civil date', async () => {
    const r = await createEntryAction({ ok: false }, fd({ entryDate: '2026-07-04', kind: 'expense', amount: '12.5', description: 'Sabão' }))
    expect(r.ok).toBe(true)
    const row = await db.ledgerEntry.findFirstOrThrow()
    expect(Number(row.amount)).toBe(12.5)
    expect(row.entryDate.getFullYear()).toBe(2026)
    expect(row.entryDate.getMonth()).toBe(6)  // July (0-based)
    expect(row.entryDate.getDate()).toBe(4)
  })

  it('rejects invalid amount', async () => {
    const r = await createEntryAction({ ok: false }, fd({ entryDate: '2026-07-04', kind: 'expense', amount: '-5', description: 'x' }))
    expect(r.ok).toBe(false)
    expect(await db.ledgerEntry.count()).toBe(0)
  })

  it('reception gets a permission error, not a crash', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    const r = await createEntryAction({ ok: false }, fd({ entryDate: '2026-07-04', kind: 'income', amount: '5', description: 'x' }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/permiss/i)
  })

  it('saveCostCenterAction + deleteEntryAction work end-to-end', async () => {
    expect((await saveCostCenterAction({ ok: false }, fd({ code: 'LIMP', description: 'Limpeza' }))).ok).toBe(true)
    const c = await createEntryAction({ ok: false }, fd({ entryDate: '2026-07-04', kind: 'expense', amount: '9', description: 'x', costCenter: 'LIMP' }))
    expect(c.ok).toBe(true)
    const row = await db.ledgerEntry.findFirstOrThrow()
    expect((await deleteEntryAction(String(row.id))).ok).toBe(true)
    expect(await db.ledgerEntry.count()).toBe(0)
  })
})
```

Run: `pnpm test tests/app/financeiro-actions.test.ts` → FAIL (module missing).

- [ ] **Step 2: Write the actions**

Create `src/app/financeiro/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { entrySchema, costCenterSchema } from '@/lib/validation/finance'
import * as finance from '@/server/data/finance'

export type ActionState = { ok: boolean; error?: string }

const permErr = (e: unknown) => (e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.')

// 'YYYY-MM-DD' → local midnight Date (avoids the UTC shift of new Date('YYYY-MM-DD'))
function civilDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function createEntryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = entrySchema.safeParse({
    entryDate: fd.get('entryDate'), kind: fd.get('kind'), amount: fd.get('amount'),
    description: fd.get('description'), costCenter: fd.get('costCenter') || null,
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try {
    await finance.createEntry({ ...parsed.data, entryDate: civilDate(parsed.data.entryDate) })
  } catch (e) { return { ok: false, error: permErr(e) } }
  revalidatePath('/financeiro')
  return { ok: true }
}

export async function updateEntryAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = entrySchema.safeParse({
    entryDate: fd.get('entryDate'), kind: fd.get('kind'), amount: fd.get('amount'),
    description: fd.get('description'), costCenter: fd.get('costCenter') || null,
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try {
    await finance.updateEntry(BigInt(id), { ...parsed.data, entryDate: civilDate(parsed.data.entryDate) })
  } catch (e) { return { ok: false, error: permErr(e) } }
  revalidatePath('/financeiro')
  return { ok: true }
}

export async function deleteEntryAction(id: string): Promise<ActionState> {
  try { await finance.deleteEntry(BigInt(id)) } catch (e) { return { ok: false, error: permErr(e) } }
  revalidatePath('/financeiro')
  return { ok: true }
}

export async function saveCostCenterAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = costCenterSchema.safeParse({ code: fd.get('code'), description: fd.get('description') })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await finance.upsertCostCenter(parsed.data) } catch (e) { return { ok: false, error: permErr(e) } }
  revalidatePath('/financeiro')
  return { ok: true }
}

export async function deleteCostCenterAction(code: string): Promise<ActionState> {
  try { await finance.deleteCostCenter(code) }
  catch (e) { return { ok: false, error: e instanceof Error && /uso/i.test(e.message) ? 'Centro em uso: possui lançamentos.' : permErr(e) } }
  revalidatePath('/financeiro')
  return { ok: true }
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/app/financeiro-actions.test.ts` → PASS (4 tests).

> If the test cannot import `@/app/...`, use the alias that resolves `src/app` — check an existing test's imports; the project's tsconfig maps `@/*` to `src/*`, so `@/app/financeiro/actions` is correct.

- [ ] **Step 4: Commit**

```bash
git add src/app/financeiro/actions.ts tests/app/financeiro-actions.test.ts
git commit -m "feat(finance): server actions for entries + cost centers"
```

---

### Task 2: CSV/PDF export (lib + route handlers)

**Files:**
- Create: `src/lib/finance-csv.ts`
- Create: `src/lib/finance-pdf.tsx`
- Create: `src/app/financeiro/csv/route.ts`
- Create: `src/app/financeiro/pdf/route.ts`
- Test: `tests/app/financeiro-export.test.ts`

**Interfaces:**
- Consumes: `statementRange` (slice 2), `getCurrentUser`, `can`.
- Produces: `toFinanceCsv(range: StatementRange): string`; `buildFinancePdf(range: StatementRange, label: string): Promise<Buffer>`; `GET` handlers at `/financeiro/csv` and `/financeiro/pdf` that read `from`/`to` query params, gate `finance:manage` (403 otherwise), and stream the file.

- [ ] **Step 1: Write the failing test**

Create `tests/app/financeiro-export.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { GET as csvGET } from '@/app/financeiro/csv/route'
import { GET as pdfGET } from '@/app/financeiro/pdf/route'

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.ledgerEntry.deleteMany(); await db.costCenter.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 4), kind: 'expense', amount: 40, description: 'A' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

const url = (p: string) => new Request(`http://localhost${p}`)

describe('finance export handlers', () => {
  it('CSV responds 200 with a semicolon table for managers', async () => {
    const res = await csvGET(url('/financeiro/csv?from=2026-07-04&to=2026-07-04'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/csv/)
    expect(await res.text()).toMatch(/2026-07-04/)
  })

  it('PDF responds 200 application/pdf', async () => {
    const res = await pdfGET(url('/financeiro/pdf?from=2026-07-04&to=2026-07-04'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })

  it('reception gets 403 from both', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    expect((await csvGET(url('/financeiro/csv?from=2026-07-04&to=2026-07-04'))).status).toBe(403)
    expect((await pdfGET(url('/financeiro/pdf?from=2026-07-04&to=2026-07-04'))).status).toBe(403)
  })
})
```

Run: `pnpm test tests/app/financeiro-export.test.ts` → FAIL (modules missing).

- [ ] **Step 2: Write the CSV lib**

Create `src/lib/finance-csv.ts`:

```ts
import type { StatementRange } from '@/server/data/finance'

export function toFinanceCsv(range: StatementRange): string {
  const n = (v: number) => v.toFixed(2)
  const header = 'Data;Estadias;Consumo;Caixa entra;Caixa sai;Despesas;Receitas;Líquido'
  const lines = range.days.map((d) =>
    [d.date, n(d.stays), n(d.consumption), n(d.cashIn), n(d.cashOut), n(d.expenses), n(d.income), n(d.net)].join(';'))
  const t = range.totals
  const total = ['TOTAL', n(t.stays), n(t.consumption), n(t.cashIn), n(t.cashOut), n(t.expenses), n(t.income), n(t.net)].join(';')
  return [header, ...lines, total].join('\n')
}
```

- [ ] **Step 3: Write the PDF lib**

Create `src/lib/finance-pdf.tsx`:

```tsx
import 'server-only'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { StatementRange } from '@/server/data/finance'

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9 },
  title: { fontSize: 14, marginBottom: 12 },
  row: { flexDirection: 'row', borderBottom: '1 solid #ccc', paddingVertical: 3 },
  head: { flexDirection: 'row', borderBottom: '1 solid #000', paddingVertical: 3, fontWeight: 'bold' },
  c: { flex: 1 }, cNum: { flex: 1, textAlign: 'right' },
})
const money = (n: number) => n.toFixed(2)

export function buildFinancePdf(range: StatementRange, label: string): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Faturamento {label}</Text>
        <View style={s.head}>
          <Text style={s.c}>Data</Text><Text style={s.cNum}>Estadias</Text><Text style={s.cNum}>Consumo</Text>
          <Text style={s.cNum}>Caixa+</Text><Text style={s.cNum}>Caixa−</Text><Text style={s.cNum}>Despesas</Text>
          <Text style={s.cNum}>Receitas</Text><Text style={s.cNum}>Líquido</Text>
        </View>
        {range.days.map((d) => (
          <View key={d.date} style={s.row}>
            <Text style={s.c}>{d.date}</Text><Text style={s.cNum}>{money(d.stays)}</Text><Text style={s.cNum}>{money(d.consumption)}</Text>
            <Text style={s.cNum}>{money(d.cashIn)}</Text><Text style={s.cNum}>{money(d.cashOut)}</Text><Text style={s.cNum}>{money(d.expenses)}</Text>
            <Text style={s.cNum}>{money(d.income)}</Text><Text style={s.cNum}>{money(d.net)}</Text>
          </View>
        ))}
        <View style={s.head}>
          <Text style={s.c}>TOTAL</Text><Text style={s.cNum}>{money(range.totals.stays)}</Text><Text style={s.cNum}>{money(range.totals.consumption)}</Text>
          <Text style={s.cNum}>{money(range.totals.cashIn)}</Text><Text style={s.cNum}>{money(range.totals.cashOut)}</Text><Text style={s.cNum}>{money(range.totals.expenses)}</Text>
          <Text style={s.cNum}>{money(range.totals.income)}</Text><Text style={s.cNum}>{money(range.totals.net)}</Text>
        </View>
      </Page>
    </Document>
  )
  return renderToBuffer(doc)
}
```

- [ ] **Step 4: Write the route handlers**

Create `src/app/financeiro/csv/route.ts`:

```ts
import { statementRange } from '@/server/data/finance'
import { toFinanceCsv } from '@/lib/finance-csv'

function civilDate(s: string | null, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const now = new Date()
  const from = civilDate(searchParams.get('from'), new Date(now.getFullYear(), now.getMonth(), 1))
  const to = civilDate(searchParams.get('to'), now)
  let range
  try { range = await statementRange(from, to) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) return new Response('Forbidden', { status: 403 }); throw e }
  const file = `faturamento-${searchParams.get('from') ?? ''}_${searchParams.get('to') ?? ''}.csv`
  return new Response('﻿' + toFinanceCsv(range), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
```

Create `src/app/financeiro/pdf/route.ts`:

```ts
import { statementRange } from '@/server/data/finance'
import { buildFinancePdf } from '@/lib/finance-pdf'

function civilDate(s: string | null, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const now = new Date()
  const from = civilDate(searchParams.get('from'), new Date(now.getFullYear(), now.getMonth(), 1))
  const to = civilDate(searchParams.get('to'), now)
  let range
  try { range = await statementRange(from, to) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) return new Response('Forbidden', { status: 403 }); throw e }
  const label = `${searchParams.get('from') ?? ''} a ${searchParams.get('to') ?? ''}`
  const buffer = await buildFinancePdf(range, label)
  const file = `faturamento-${searchParams.get('from') ?? ''}_${searchParams.get('to') ?? ''}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test tests/app/financeiro-export.test.ts` → PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/finance-csv.ts src/lib/finance-pdf.tsx src/app/financeiro/csv/route.ts src/app/financeiro/pdf/route.ts tests/app/financeiro-export.test.ts
git commit -m "feat(finance): CSV/PDF export of faturamento (lib + route handlers)"
```

---

### Task 3: Client form components

**Files:**
- Create: `src/app/financeiro/finance-forms.tsx`

**Interfaces:**
- Consumes: the actions from Task 1; `NativeSelect`, `Input`, `Label`, `Button`.
- Produces (all `'use client'`):
  ```ts
  export function EntryForm({ centers }: { centers: { code: string; description: string }[] }): JSX.Element
  export function EntryRowActions({ id }: { id: string }): JSX.Element         // delete button
  export function CostCenterForm(): JSX.Element
  export function DeleteCostCenter({ code }: { code: string }): JSX.Element
  ```

- [ ] **Step 1: Write the components**

Create `src/app/financeiro/finance-forms.tsx`:

```tsx
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createEntryAction, deleteEntryAction, saveCostCenterAction, deleteCostCenterAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? '…' : children}</Button>
}

export function EntryForm({ centers }: { centers: { code: string; description: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createEntryAction, { ok: false })
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="entryDate" className="text-xs">Data</Label><Input id="entryDate" name="entryDate" type="date" required /></div>
      <div className="grid gap-1">
        <Label htmlFor="kind" className="text-xs">Tipo</Label>
        <NativeSelect id="kind" name="kind" defaultValue="expense" className="w-32">
          <NativeSelectOption value="expense">Despesa</NativeSelectOption>
          <NativeSelectOption value="income">Receita</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid gap-1"><Label htmlFor="amount" className="text-xs">Valor</Label><Input id="amount" name="amount" type="number" step="0.01" min="0.01" className="w-28" required /></div>
      <div className="grid gap-1">
        <Label htmlFor="costCenter" className="text-xs">Centro</Label>
        <NativeSelect id="costCenter" name="costCenter" defaultValue="" className="w-40">
          <NativeSelectOption value="">— sem centro —</NativeSelectOption>
          {centers.map((c) => <NativeSelectOption key={c.code} value={c.code}>{c.code} · {c.description}</NativeSelectOption>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1 flex-1 min-w-40"><Label htmlFor="description" className="text-xs">Descrição</Label><Input id="description" name="description" required /></div>
      <Submit>Lançar</Submit>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">✓ lançado</span>}
    </form>
  )
}

export function EntryRowActions({ id }: { id: string }) {
  const [, action] = useActionState<ActionState, FormData>(async () => deleteEntryAction(id), { ok: false })
  return <form action={action}><Button size="sm" variant="ghost" type="submit">excluir</Button></form>
}

export function CostCenterForm() {
  const [state, action] = useActionState<ActionState, FormData>(saveCostCenterAction, { ok: false })
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="cc-code" className="text-xs">Código</Label><Input id="cc-code" name="code" maxLength={20} className="w-28" required /></div>
      <div className="grid gap-1 flex-1"><Label htmlFor="cc-desc" className="text-xs">Descrição</Label><Input id="cc-desc" name="description" required /></div>
      <Submit>Salvar</Submit>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">✓ salvo</span>}
    </form>
  )
}

export function DeleteCostCenter({ code }: { code: string }) {
  const [state, action] = useActionState<ActionState, FormData>(async () => deleteCostCenterAction(code), { ok: false })
  return (
    <form action={action} className="flex items-center gap-2">
      <Button size="sm" variant="ghost" type="submit">remover</Button>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
    </form>
  )
}
```

> Editing an existing entry is intentionally out of this slice's UI (the spec's "editar" is served by delete + re-create for now; `updateEntryAction` exists and can be wired to an inline edit form in a follow-up). Do not block on it.

- [ ] **Step 2: Typecheck**

Run: `pnpm build` → the components compile (the page in Task 4 consumes them; if build complains about an unused export, that resolves once Task 4 lands — run build again at the end of Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/app/financeiro/finance-forms.tsx
git commit -m "feat(finance): client form components (entry, cost center)"
```

---

### Task 4: The `/financeiro` page + nav link

**Files:**
- Create: `src/app/financeiro/page.tsx`
- Modify: `src/components/app-nav.tsx`

**Interfaces:**
- Consumes: DAL `listEntries`/`listCostCenters`/`statementRange`/`costCenterMonthly`; the client components from Task 3; UI primitives.
- Produces: route `/financeiro` (three cards) reading query params `{ from?, to?, costCenter? }`; a manager-only **Financeiro** nav link.

- [ ] **Step 1: Create the page**

Create `src/app/financeiro/page.tsx`:

```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listEntries, listCostCenters, statementRange, costCenterMonthly } from '@/server/data/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PageHeader } from '@/components/page-header'
import { EntryForm, EntryRowActions, CostCenterForm, DeleteCostCenter } from './finance-forms'

const money = (n: number) => `R$ ${n.toFixed(2)}`
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function civil(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

async function Finance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection()
  const sp = await searchParams
  const now = new Date()
  const from = civil(sp.from, new Date(now.getFullYear(), now.getMonth(), 1))
  const to = civil(sp.to, now)
  const fromStr = iso(from), toStr = iso(to)
  const costCenterFilter = sp.costCenter || undefined

  let entries, centers, range, monthly
  try {
    ;[entries, centers, range, monthly] = await Promise.all([
      listEntries({ from, to, costCenter: costCenterFilter }),
      listCostCenters(),
      statementRange(from, to),
      costCenterMonthly(from.getFullYear(), from.getMonth() + 1),
    ])
  } catch (e) {
    if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/')
    throw e
  }

  const qs = `from=${fromStr}&to=${toStr}`
  const centerOptions = centers.map((c) => ({ code: c.code, description: c.description }))

  return (
    <div className="grid gap-6">
      {/* Section 1: entries */}
      <Card>
        <CardHeader><CardTitle className="font-display">Lançar conta</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <EntryForm centers={centerOptions} />
          <form method="GET" className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="grid gap-1"><Label htmlFor="from" className="text-xs">De</Label><Input id="from" name="from" type="date" defaultValue={fromStr} /></div>
            <div className="grid gap-1"><Label htmlFor="to" className="text-xs">Até</Label><Input id="to" name="to" type="date" defaultValue={toStr} /></div>
            <div className="grid gap-1">
              <Label htmlFor="costCenter" className="text-xs">Centro</Label>
              <NativeSelect id="costCenter" name="costCenter" defaultValue={costCenterFilter ?? ''} className="w-40">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {centers.map((c) => <NativeSelectOption key={c.code} value={c.code}>{c.code}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <Button type="submit" variant="outline">Filtrar</Button>
          </form>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Centro</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {entries.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Nenhum lançamento no período.</TableCell></TableRow>}
              {entries.map((e) => (
                <TableRow key={String(e.id)}>
                  <TableCell className="tnum">{iso(e.entryDate)}</TableCell>
                  <TableCell>{e.kind === 'income' ? 'Receita' : 'Despesa'}</TableCell>
                  <TableCell>{e.costCenter ?? '—'}</TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell className={`tnum text-right font-medium ${e.kind === 'income' ? 'text-[var(--room-free)]' : 'text-destructive'}`}>{e.kind === 'income' ? '+' : '−'}{money(e.amount)}</TableCell>
                  <TableCell className="text-right"><EntryRowActions id={String(e.id)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 2: cost centers */}
      <Card>
        <CardHeader><CardTitle className="font-display">Centros de custo</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <CostCenterForm />
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Lançamentos</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {centers.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Nenhum centro ainda.</TableCell></TableRow>}
              {centers.map((c) => (
                <TableRow key={c.code}>
                  <TableCell className="font-medium">{c.code}</TableCell>
                  <TableCell>{c.description}</TableCell>
                  <TableCell className="tnum text-right">{c.entryCount}</TableCell>
                  <TableCell className="text-right"><DeleteCostCenter code={c.code} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 3: faturamento */}
      <Card>
        <CardHeader><CardTitle className="font-display">Faturamento <span className="text-sm font-normal text-muted-foreground">{fromStr} → {toStr}</span></CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><a href={`/financeiro/csv?${qs}`}>Baixar CSV</a></Button>
            <Button asChild variant="outline" size="sm"><a href={`/financeiro/pdf?${qs}`}>Baixar PDF</a></Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead className="text-right">Estadias</TableHead><TableHead className="text-right">Consumo</TableHead><TableHead className="text-right">Caixa+</TableHead><TableHead className="text-right">Caixa−</TableHead><TableHead className="text-right">Despesas</TableHead><TableHead className="text-right">Receitas</TableHead><TableHead className="text-right">Líquido</TableHead></TableRow></TableHeader>
            <TableBody>
              {range.days.map((d) => (
                <TableRow key={d.date}>
                  <TableCell className="tnum">{d.date}</TableCell>
                  <TableCell className="tnum text-right">{money(d.stays)}</TableCell>
                  <TableCell className="tnum text-right">{money(d.consumption)}</TableCell>
                  <TableCell className="tnum text-right">{money(d.cashIn)}</TableCell>
                  <TableCell className="tnum text-right">{money(d.cashOut)}</TableCell>
                  <TableCell className="tnum text-right text-destructive">{money(d.expenses)}</TableCell>
                  <TableCell className="tnum text-right text-[var(--room-free)]">{money(d.income)}</TableCell>
                  <TableCell className="tnum text-right font-semibold">{money(d.net)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-primary/40 font-semibold">
                <TableCell className="font-display">TOTAL</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.stays)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.consumption)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.cashIn)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.cashOut)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.expenses)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.income)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.net)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <h3 className="mt-2 font-display text-sm">Por centro de custo — {String(monthly.month).padStart(2, '0')}/{monthly.year}</h3>
          <Table>
            <TableHeader><TableRow><TableHead>Centro</TableHead><TableHead className="text-right">Receitas</TableHead><TableHead className="text-right">Despesas</TableHead><TableHead className="text-right">Líquido</TableHead></TableRow></TableHeader>
            <TableBody>
              {monthly.rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Sem lançamentos no mês.</TableCell></TableRow>}
              {monthly.rows.map((r) => (
                <TableRow key={r.code ?? '—'}>
                  <TableCell>{r.code ? `${r.code} · ${r.description ?? ''}` : 'Sem centro'}</TableCell>
                  <TableCell className="tnum text-right text-[var(--room-free)]">{money(r.income)}</TableCell>
                  <TableCell className="tnum text-right text-destructive">{money(r.expense)}</TableCell>
                  <TableCell className="tnum text-right font-medium">{money(r.net)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-primary/40 font-semibold">
                <TableCell className="font-display">TOTAL</TableCell>
                <TableCell className="tnum text-right">{money(monthly.totals.income)}</TableCell>
                <TableCell className="tnum text-right">{money(monthly.totals.expense)}</TableCell>
                <TableCell className="tnum text-right">{money(monthly.totals.net)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function FinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Financeiro" subtitle="Contas por centro de custo e faturamento diário consolidado." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Finance searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 2: Add the nav link**

In `src/components/app-nav.tsx`, inside the `isManager` links array, add after the `/relatorios` entry:

```tsx
          { href: '/relatorios', label: 'Relatórios' },
          { href: '/financeiro', label: 'Financeiro' },
```

- [ ] **Step 3: Build + full suite**

Run: `pnpm build` → succeeds and lists `/financeiro`, `/financeiro/csv`, `/financeiro/pdf`.
Run: `pnpm test` → all PASS.

- [ ] **Step 4: Manual smoke (recommended)**

`pnpm dev`, log in as manager, open `/financeiro`: create a cost center, lançar a despesa and a receita, confirm they color red/green, change the period, download CSV and PDF. Log in as reception → `/financeiro` redirects to `/`.

- [ ] **Step 5: Commit**

```bash
git add src/app/financeiro/page.tsx src/components/app-nav.tsx
git commit -m "feat(finance): /financeiro page (3 sections) + nav link"
```
