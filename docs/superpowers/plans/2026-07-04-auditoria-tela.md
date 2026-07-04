# Auditoria — Tela `/auditoria` (read DAL + RBAC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give managers a `/auditoria` screen to browse the event trail, filtered by period / type / operator / free text, paginated — gated by a new `audit:view` RBAC action.

**Architecture:** A `server-only` read DAL (`src/server/data/audit.ts`) exposes `listEvents`, `listEventTypes`, `listEventOperators`, each gated by `audit:view`. A server component at `/auditoria` reads GET search params, builds the filter, and renders a filter form + table + prev/next pagination, mirroring the existing `/relatorios` page. Depends on slice 1 (this plan assumes `logEvent` retrofit + the `entity`/`entityId` columns already merged).

**Tech Stack:** Next.js 16 (App Router, server components), Prisma 7, Vitest, TypeScript.

## Global Constraints

- **Prisma imports:** `Prisma` namespace, model types, enums from `@/generated/prisma/client` — never `@prisma/client`.
- **DB singleton:** `import { db } from '@/server/db'`.
- **server-only:** DAL file starts with `import 'server-only'`.
- **Reads via DAL** with authz inside each function; the page renders results and redirects to `/` on `Forbidden` (mirror `/relatorios`).
- **Tests:** Vitest, DB-backed test DB. `DATABASE_URL="$DATABASE_URL_TEST" pnpm test`. Mock `server-only` + `@/server/session`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.
- **No CSV/PDF** in this slice (YAGNI).

---

### Task 1: Add `audit:view` RBAC action

**Files:**
- Modify: `src/lib/rbac.ts` (lines 3-9)
- Test: `tests/lib/rbac-audit.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `Action` union includes `'audit:view'`; `can('manager', 'audit:view') === true`; `can('reception', 'audit:view') === false`; `can('housekeeper', 'audit:view') === false`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/rbac-audit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('audit:view', () => {
  it('is granted to manager only', () => {
    expect(can('manager', 'audit:view')).toBe(true)
    expect(can('reception', 'audit:view')).toBe(false)
    expect(can('housekeeper', 'audit:view')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/lib/rbac-audit.test.ts`
Expected: FAIL — TypeScript rejects `'audit:view'` (not in `Action`) / `can` returns false.

- [ ] **Step 3: Add the action**

In `src/lib/rbac.ts`, add `'audit:view'` to the `Action` union and to the `manager` array only:

```ts
export type Action = 'users:manage' | 'cash:withdraw' | 'room:status' | 'tariff:manage' | 'stay:manage' | 'cash:manage' | 'product:manage' | 'report:view' | 'loyalty:manage' | 'audit:view'

const MATRIX: Record<EmployeeRole, Action[]> = {
  manager:     ['users:manage', 'cash:withdraw', 'room:status', 'tariff:manage', 'stay:manage', 'cash:manage', 'product:manage', 'report:view', 'loyalty:manage', 'audit:view'],
  reception:   ['cash:withdraw', 'room:status', 'stay:manage', 'cash:manage'],
  housekeeper: ['room:status'],
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/lib/rbac-audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rbac.ts tests/lib/rbac-audit.test.ts
git commit -m "feat(audit): add audit:view RBAC action (manager only)"
```

---

### Task 2: Read DAL `src/server/data/audit.ts`

**Files:**
- Create: `src/server/data/audit.ts`
- Test: `tests/server/audit-read.test.ts` (create)

**Interfaces:**
- Consumes: `db`, `getCurrentUser`, `can`, `Prisma` namespace.
- Produces:
  ```ts
  export type EventFilter = {
    from?: Date; to?: Date; type?: string; employeeId?: number; q?: string
    take?: number; skip?: number
  }
  export type EventRow = {
    id: bigint; occurredAt: Date; type: string | null; description: string | null
    roomNumber: string | null; entity: string | null; entityId: string | null
    operatorName: string | null
  }
  export async function listEvents(filter: EventFilter): Promise<{ events: EventRow[]; total: number }>
  export async function listEventTypes(): Promise<string[]>
  export async function listEventOperators(): Promise<{ id: number; name: string }[]>
  ```
  All three throw `Error('Forbidden')` unless the caller has `audit:view`. `listEvents` orders `occurredAt` desc, defaults `take: 100`, `skip: 0`, and `total` is the count matching the same filter (for pagination).

- [ ] **Step 1: Write the failing test**

Create `tests/server/audit-read.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listEvents, listEventTypes, listEventOperators } from '@/server/data/audit'

beforeEach(async () => {
  await db.eventLog.deleteMany()
  await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  await db.employee.create({ data: { id: 2, name: 'Rita', username: 'rita', role: 'reception', passwordHash: 'x' } })
  await db.eventLog.createMany({
    data: [
      { type: 'stay.checkin', description: 'Entrada quarto 07', roomNumber: '07', employeeId: 1, occurredAt: new Date('2026-07-01T10:00:00Z') },
      { type: 'stay.checkout', description: 'Saída quarto 07', roomNumber: '07', employeeId: 2, occurredAt: new Date('2026-07-02T10:00:00Z') },
      { type: 'room.status', description: 'Quarto 03 → limpeza', roomNumber: '03', employeeId: 1, occurredAt: new Date('2026-07-03T10:00:00Z') },
    ],
  })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('listEvents authz', () => {
  it('reception is forbidden', async () => {
    session.current = { id: 2, name: 'Rita', role: 'reception' }
    await expect(listEvents({})).rejects.toThrow(/forbidden/i)
  })
})

describe('listEvents filters + order + pagination', () => {
  it('orders occurredAt desc and joins the operator name', async () => {
    const { events, total } = await listEvents({})
    expect(total).toBe(3)
    expect(events.map((e) => e.type)).toEqual(['room.status', 'stay.checkout', 'stay.checkin'])
    expect(events[2].operatorName).toBe('Boss')
  })
  it('filters by type', async () => {
    const { events, total } = await listEvents({ type: 'stay.checkin' })
    expect(total).toBe(1)
    expect(events[0].roomNumber).toBe('07')
  })
  it('filters by operator', async () => {
    const { events } = await listEvents({ employeeId: 2 })
    expect(events).toHaveLength(1)
    expect(events[0].operatorName).toBe('Rita')
  })
  it('filters by period (from/to inclusive)', async () => {
    const { total } = await listEvents({ from: new Date('2026-07-02T00:00:00Z'), to: new Date('2026-07-02T23:59:59Z') })
    expect(total).toBe(1)
  })
  it('filters by free text q (case-insensitive, on description)', async () => {
    const { total } = await listEvents({ q: 'quarto 07' })
    expect(total).toBe(2)
  })
  it('paginates with take/skip while total stays the full match count', async () => {
    const { events, total } = await listEvents({ take: 2, skip: 0 })
    expect(total).toBe(3)
    expect(events).toHaveLength(2)
    const page2 = await listEvents({ take: 2, skip: 2 })
    expect(page2.events).toHaveLength(1)
  })
})

describe('listEventTypes / listEventOperators', () => {
  it('returns the distinct types present', async () => {
    const types = await listEventTypes()
    expect(types.sort()).toEqual(['room.status', 'stay.checkin', 'stay.checkout'])
  })
  it('returns only operators that have events', async () => {
    const ops = await listEventOperators()
    expect(ops.map((o) => o.name).sort()).toEqual(['Boss', 'Rita'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/audit-read.test.ts`
Expected: FAIL — `Cannot find module '@/server/data/audit'`.

- [ ] **Step 3: Write the DAL**

Create `src/server/data/audit.ts`:

```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { Prisma } from '@/generated/prisma/client'

async function requireAuditView() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'audit:view')) throw new Error('Forbidden')
  return me
}

export type EventFilter = {
  from?: Date
  to?: Date
  type?: string
  employeeId?: number
  q?: string
  take?: number
  skip?: number
}

export type EventRow = {
  id: bigint
  occurredAt: Date
  type: string | null
  description: string | null
  roomNumber: string | null
  entity: string | null
  entityId: string | null
  operatorName: string | null
}

function buildWhere(filter: EventFilter): Prisma.EventLogWhereInput {
  const where: Prisma.EventLogWhereInput = {}
  if (filter.from || filter.to) where.occurredAt = { gte: filter.from, lte: filter.to }
  if (filter.type) where.type = filter.type
  if (filter.employeeId) where.employeeId = filter.employeeId
  if (filter.q) where.description = { contains: filter.q, mode: 'insensitive' }
  return where
}

export async function listEvents(filter: EventFilter): Promise<{ events: EventRow[]; total: number }> {
  await requireAuditView()
  const where = buildWhere(filter)
  const [rows, total] = await Promise.all([
    db.eventLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: filter.take ?? 100,
      skip: filter.skip ?? 0,
      select: {
        id: true, occurredAt: true, type: true, description: true,
        roomNumber: true, entity: true, entityId: true,
        employee: { select: { name: true } },
      },
    }),
    db.eventLog.count({ where }),
  ])
  const events = rows.map((r) => ({
    id: r.id, occurredAt: r.occurredAt, type: r.type, description: r.description,
    roomNumber: r.roomNumber, entity: r.entity, entityId: r.entityId,
    operatorName: r.employee?.name ?? null,
  }))
  return { events, total }
}

export async function listEventTypes(): Promise<string[]> {
  await requireAuditView()
  const rows = await db.eventLog.findMany({ distinct: ['type'], select: { type: true }, orderBy: { type: 'asc' } })
  return rows.map((r) => r.type).filter((t): t is string => !!t)
}

export async function listEventOperators(): Promise<{ id: number; name: string }[]> {
  await requireAuditView()
  return db.employee.findMany({ where: { events: { some: {} } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test tests/server/audit-read.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add src/server/data/audit.ts tests/server/audit-read.test.ts
git commit -m "feat(audit): read DAL — listEvents/listEventTypes/listEventOperators"
```

---

### Task 3: The `/auditoria` page (filters + table + pagination)

**Files:**
- Create: `src/app/auditoria/page.tsx`
- Create: `src/lib/audit-labels.ts` (PT `type` → label map, shared by page)

**Interfaces:**
- Consumes: `listEvents`, `listEventTypes`, `listEventOperators`, `EventFilter` from `@/server/data/audit`; `PageHeader`, `Card*`, `Table*`, `Button`, `Input`, `Label`, `Badge`, `NativeSelect`/`NativeSelectOption`.
- Produces: a server component route `/auditoria` reading `searchParams` `{ from?, to?, type?, employeeId?, q?, skip? }`.

- [ ] **Step 1: Create the label map**

Create `src/lib/audit-labels.ts`:

```ts
// PT labels for EventLog.type. Fallback to the raw type when unmapped so a new
// event type shows up readably without a code change.
export const EVENT_TYPE_LABEL: Record<string, string> = {
  'stay.checkin': 'Entrada',
  'stay.checkout': 'Saída',
  'room.status': 'Status quarto',
  'shift.open': 'Caixa aberto',
  'shift.close': 'Caixa fechado',
  'cash.withdrawal': 'Sangria',
  'cash.supply': 'Suprimento',
  'cash.correction': 'Correção',
  'consumption.add': 'Consumo +',
  'consumption.remove': 'Consumo −',
  'consumption.walkin': 'Venda avulsa',
  'tariff.update': 'Tarifa',
  'product.update': 'Produto',
  'user.create': 'Usuário criado',
  'user.update': 'Usuário editado',
  'user.deactivate': 'Usuário desativado',
  'user.reset': 'Senha redefinida',
  'loyalty.tier.upsert': 'Faixa fidelidade',
  'loyalty.tier.delete': 'Faixa removida',
}

export function eventTypeLabel(type: string | null): string {
  if (!type) return '—'
  return EVENT_TYPE_LABEL[type] ?? type
}
```

- [ ] **Step 2: Create the page**

Create `src/app/auditoria/page.tsx`:

```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listEvents, listEventTypes, listEventOperators, type EventFilter } from '@/server/data/audit'
import { eventTypeLabel } from '@/lib/audit-labels'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PageHeader } from '@/components/page-header'

const PAGE = 100

function todayISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function Trail({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection()
  const sp = await searchParams
  const now = new Date()
  const fromStr = sp.from || todayISO(now)
  const toStr = sp.to || todayISO(now)
  const skip = Math.max(0, Number(sp.skip) || 0)

  const filter: EventFilter = {
    from: new Date(`${fromStr}T00:00:00`),
    to: new Date(`${toStr}T23:59:59.999`),
    type: sp.type || undefined,
    employeeId: sp.employeeId ? Number(sp.employeeId) : undefined,
    q: sp.q || undefined,
    take: PAGE,
    skip,
  }

  let data, types, operators
  try {
    ;[data, types, operators] = await Promise.all([listEvents(filter), listEventTypes(), listEventOperators()])
  } catch (e) {
    if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/')
    throw e
  }

  const { events, total } = data
  const hasPrev = skip > 0
  const hasNext = skip + PAGE < total
  const qsBase = new URLSearchParams()
  qsBase.set('from', fromStr); qsBase.set('to', toStr)
  if (sp.type) qsBase.set('type', sp.type)
  if (sp.employeeId) qsBase.set('employeeId', sp.employeeId)
  if (sp.q) qsBase.set('q', sp.q)
  const pageHref = (s: number) => { const p = new URLSearchParams(qsBase); p.set('skip', String(s)); return `/auditoria?${p}` }

  const fmt = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle className="font-display">Filtros</CardTitle></CardHeader>
        <CardContent>
          <form method="GET" className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1"><Label htmlFor="from">De</Label><Input id="from" name="from" type="date" defaultValue={fromStr} /></div>
            <div className="grid gap-1"><Label htmlFor="to">Até</Label><Input id="to" name="to" type="date" defaultValue={toStr} /></div>
            <div className="grid gap-1">
              <Label htmlFor="type">Tipo</Label>
              <NativeSelect id="type" name="type" defaultValue={sp.type ?? ''} className="w-44">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {types.map((t) => <NativeSelectOption key={t} value={t}>{eventTypeLabel(t)}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="employeeId">Operador</Label>
              <NativeSelect id="employeeId" name="employeeId" defaultValue={sp.employeeId ?? ''} className="w-44">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {operators.map((o) => <NativeSelectOption key={o.id} value={String(o.id)}>{o.name}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className="grid gap-1"><Label htmlFor="q">Busca</Label><Input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="descrição…" /></div>
            <Button type="submit">Filtrar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display">Eventos <span className="text-sm font-normal text-muted-foreground">({total})</span></CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>Hora</TableHead><TableHead>Operador</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Quarto</TableHead></TableRow></TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Nenhum evento no período.</TableCell></TableRow>
              )}
              {events.map((e) => (
                <TableRow key={String(e.id)}>
                  <TableCell className="tnum whitespace-nowrap">{fmt(e.occurredAt)}</TableCell>
                  <TableCell>{e.operatorName ?? '—'}</TableCell>
                  <TableCell><Badge variant="secondary" className="font-normal">{eventTypeLabel(e.type)}</Badge></TableCell>
                  <TableCell>{e.description ?? '—'}</TableCell>
                  <TableCell className="tnum">{e.roomNumber ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between">
            <Button asChild variant="outline" disabled={!hasPrev}><a href={hasPrev ? pageHref(Math.max(0, skip - PAGE)) : '#'}>← Anterior</a></Button>
            <span className="text-xs text-muted-foreground">{total === 0 ? '0' : `${skip + 1}–${Math.min(skip + PAGE, total)}`} de {total}</span>
            <Button asChild variant="outline" disabled={!hasNext}><a href={hasNext ? pageHref(skip + PAGE) : '#'}>Próxima →</a></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Auditoria" subtitle="Trilha de eventos por operador." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Trail searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 3: Build + typecheck**

Run: `pnpm build`
Expected: build succeeds; `/auditoria` compiles. If `Button` does not forward a `disabled` prop when `asChild`, replace the two pagination buttons with conditional rendering: render the `<Button asChild>` link when `hasPrev`/`hasNext`, else a disabled `<Button variant="outline" disabled>` with plain text.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run `pnpm dev`, log in as a manager, open `/auditoria`. Expected: today's events list; changing filters re-queries; prev/next move the window. Log in as reception and hit `/auditoria` → redirected to `/`.

- [ ] **Step 5: Commit**

```bash
git add src/app/auditoria/page.tsx src/lib/audit-labels.ts
git commit -m "feat(audit): /auditoria screen with filters + pagination (manager)"
```

---

### Task 4: Nav link (manager)

**Files:**
- Modify: `src/components/app-nav.tsx` (manager links array, lines 20-28)

**Interfaces:**
- Consumes: existing `isManager` flag in `NavContent`.
- Produces: an **Auditoria** link in the nav, visible only to managers.

- [ ] **Step 1: Add the link**

In `src/components/app-nav.tsx`, inside the `isManager ? [ … ]` array, add after the `/users` entry:

```tsx
          { href: '/users', label: 'Funcionários' },
          { href: '/auditoria', label: 'Auditoria' },
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Full suite green**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-nav.tsx
git commit -m "feat(audit): add Auditoria nav link for managers"
```
