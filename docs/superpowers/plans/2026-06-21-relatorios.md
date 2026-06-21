# Relatórios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monthly per-apartment occupancy report — on-screen, plus CSV and PDF download via Route Handlers.

**Architecture:** `server-only` DAL aggregates closed room-stays by month → pure `toCsv` builder + a `@react-pdf/renderer` PDF builder → two Route Handlers serve the files (gated to managers) → a `/relatorios` page with a month selector renders the table and links.

**Tech Stack:** Next 16 (App Router + Route Handlers), React 19, Prisma 7 (`@/generated/prisma/client`), `@react-pdf/renderer`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-relatorios-design.md`

**Conventions:** Repo `/Users/leosperandio/Git/MotelAconchego`; branch `feat/relatorios` from `main`. Prisma imports from `@/generated/prisma/client`. **No** `Co-Authored-By`. DB tests: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test <file>` (empty test DB → seed fixtures; mock `server-only` + `@/server/session`). Start: `git checkout -b feat/relatorios`.

---

## File Structure
```
src/lib/rbac.ts                  # +'report:view' (modify)
src/server/data/reports.ts       # monthlyOccupancy + types
src/lib/report-csv.ts            # toCsv (pure)
src/lib/report-pdf.tsx           # buildReportPdf (@react-pdf)
src/app/relatorios/csv/route.ts  # CSV download handler
src/app/relatorios/pdf/route.ts  # PDF download handler
src/app/relatorios/page.tsx      # report page (month selector + table + links)
src/app/page.tsx                 # +Relatórios nav (modify)
tests/lib/rbac-report.test.ts
tests/lib/report-csv.test.ts
tests/server/reports.test.ts
tests/app/relatorios-route.test.ts
```

---

## Task 1: RBAC report:view + reports DAL + toCsv (TDD)

**Files:** Modify `src/lib/rbac.ts`; Create `src/server/data/reports.ts`, `src/lib/report-csv.ts`, `tests/lib/rbac-report.test.ts`, `tests/lib/report-csv.test.ts`, `tests/server/reports.test.ts`

- [ ] **Step 1: RBAC test** `tests/lib/rbac-report.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('report:view', () => {
  it('only manager views reports', () => {
    expect(can('manager', 'report:view')).toBe(true)
    expect(can('reception', 'report:view')).toBe(false)
    expect(can('housekeeper', 'report:view')).toBe(false)
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test tests/lib/rbac-report.test.ts`
Expected: FAIL — `'report:view'` not assignable.

- [ ] **Step 3: Edit `src/lib/rbac.ts`** — replace contents (keeps all prior actions, adds `report:view`):
```ts
import type { EmployeeRole } from '@/generated/prisma/client'

export type Action = 'users:manage' | 'cash:withdraw' | 'room:status' | 'tariff:manage' | 'stay:manage' | 'cash:manage' | 'product:manage' | 'report:view'

const MATRIX: Record<EmployeeRole, Action[]> = {
  manager:     ['users:manage', 'cash:withdraw', 'room:status', 'tariff:manage', 'stay:manage', 'cash:manage', 'product:manage', 'report:view'],
  reception:   ['cash:withdraw', 'room:status', 'stay:manage', 'cash:manage'],
  housekeeper: ['room:status'],
}

export function can(role: EmployeeRole, action: Action): boolean {
  return MATRIX[role]?.includes(action) ?? false
}
```

- [ ] **Step 4: reports DAL** `src/server/data/reports.ts`:
```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'

export type ReportRow = {
  roomNumber: string
  categoryCode: string | null
  rentals: number
  totalStay: number
  totalConsumption: number
  avgTicket: number
}
export type MonthlyReport = {
  year: number
  month: number
  rows: ReportRow[]
  totals: { rentals: number; totalStay: number; totalConsumption: number; avgTicket: number }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function monthlyOccupancy(year: number, month: number): Promise<MonthlyReport> {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'report:view')) throw new Error('Forbidden')
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)
  const stays = await db.stay.findMany({
    where: { type: 'room', status: 'closed', checkOut: { gte: start, lt: end } },
    select: { roomNumber: true, stayAmount: true, consumptionAmount: true, category: { select: { code: true } } },
  })
  const byRoom = new Map<string, ReportRow>()
  for (const s of stays) {
    const key = s.roomNumber ?? '?'
    const row = byRoom.get(key) ?? { roomNumber: key, categoryCode: s.category?.code ?? null, rentals: 0, totalStay: 0, totalConsumption: 0, avgTicket: 0 }
    row.rentals += 1
    row.totalStay += Number(s.stayAmount ?? 0)
    row.totalConsumption += Number(s.consumptionAmount ?? 0)
    byRoom.set(key, row)
  }
  const rows = [...byRoom.values()]
    .map((r) => ({ ...r, totalStay: round2(r.totalStay), totalConsumption: round2(r.totalConsumption), avgTicket: r.rentals > 0 ? round2(r.totalStay / r.rentals) : 0 }))
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber))
  const tRentals = rows.reduce((a, r) => a + r.rentals, 0)
  const tStay = round2(rows.reduce((a, r) => a + r.totalStay, 0))
  const tCons = round2(rows.reduce((a, r) => a + r.totalConsumption, 0))
  return { year, month, rows, totals: { rentals: tRentals, totalStay: tStay, totalConsumption: tCons, avgTicket: tRentals > 0 ? round2(tStay / tRentals) : 0 } }
}
```

- [ ] **Step 5: toCsv** `src/lib/report-csv.ts`:
```ts
import type { MonthlyReport } from '@/server/data/reports'

export function toCsv(report: MonthlyReport): string {
  const n = (v: number) => v.toFixed(2)
  const header = 'Apto;Categoria;Locações;Total estadia;Ticket médio;Total consumo'
  const lines = report.rows.map((r) => [r.roomNumber, r.categoryCode ?? '', r.rentals, n(r.totalStay), n(r.avgTicket), n(r.totalConsumption)].join(';'))
  const total = ['TOTAL', '', report.totals.rentals, n(report.totals.totalStay), n(report.totals.avgTicket), n(report.totals.totalConsumption)].join(';')
  return [header, ...lines, total].join('\n')
}
```
> `import type` is erased at compile, so importing the type from the `server-only` module does NOT pull server code into this pure module.

- [ ] **Step 6: toCsv test** `tests/lib/report-csv.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { toCsv } from '@/lib/report-csv'
import type { MonthlyReport } from '@/server/data/reports'

const report: MonthlyReport = {
  year: 2026, month: 6,
  rows: [
    { roomNumber: '01', categoryCode: 'C', rentals: 2, totalStay: 150, totalConsumption: 20, avgTicket: 75 },
    { roomNumber: '02', categoryCode: 'A', rentals: 1, totalStay: 100, totalConsumption: 0, avgTicket: 100 },
  ],
  totals: { rentals: 3, totalStay: 250, totalConsumption: 20, avgTicket: 83.33 },
}

describe('toCsv', () => {
  it('has the header, one line per row, and a TOTAL line', () => {
    const lines = toCsv(report).split('\n')
    expect(lines[0]).toBe('Apto;Categoria;Locações;Total estadia;Ticket médio;Total consumo')
    expect(lines[1]).toBe('01;C;2;150.00;75.00;20.00')
    expect(lines[2]).toBe('02;A;1;100.00;100.00;0.00')
    expect(lines[3]).toBe('TOTAL;;3;250.00;83.33;20.00')
  })
})
```

- [ ] **Step 7: reports DAL test** `tests/server/reports.test.ts`:
```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { monthlyOccupancy } from '@/server/data/reports'

beforeEach(async () => {
  await db.consumption.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rust', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  await db.room.create({ data: { number: '99', status: 'free' } })
  const inJune = (d: number) => new Date(2026, 5, d, 12) // month index 5 = June
  // two closed room stays for 01 in June
  await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: inJune(1), checkOut: inJune(1), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10 } })
  await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: inJune(2), checkOut: inJune(2), status: 'closed', day: 'normal', guests: 2, stayAmount: 85, consumptionAmount: 0 } })
  // excluded: a walk-in, an open stay, and a May checkout
  await db.stay.create({ data: { type: 'walkin', roomNumber: '99', checkIn: inJune(3), checkOut: inJune(3), status: 'closed', stayAmount: 0, consumptionAmount: 50 } })
  await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: inJune(4), status: 'open', day: 'normal', guests: 2 } })
  await db.stay.create({ data: { type: 'room', roomNumber: '01', categoryId: cat.id, checkIn: new Date(2026, 4, 20, 12), checkOut: new Date(2026, 4, 20, 14), status: 'closed', day: 'normal', guests: 2, stayAmount: 999, consumptionAmount: 0 } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('monthlyOccupancy', () => {
  it('aggregates only closed room stays in the month', async () => {
    const rep = await monthlyOccupancy(2026, 6)
    expect(rep.rows).toHaveLength(1)
    const r = rep.rows[0]
    expect(r.roomNumber).toBe('01')
    expect(r.rentals).toBe(2)
    expect(r.totalStay).toBe(160)
    expect(r.totalConsumption).toBe(10)
    expect(r.avgTicket).toBe(80)
    expect(rep.totals).toEqual({ rentals: 2, totalStay: 160, totalConsumption: 10, avgTicket: 80 })
  })
  it('is manager-only', async () => {
    session.current = { id: 2, name: 'R', role: 'reception' }
    await expect(monthlyOccupancy(2026, 6)).rejects.toThrow(/forbidden/i)
  })
})
```

- [ ] **Step 8: Run → pass**

Run: `pnpm test tests/lib/rbac-report.test.ts tests/lib/report-csv.test.ts` and `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/reports.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/rbac.ts src/server/data/reports.ts src/lib/report-csv.ts tests/lib/rbac-report.test.ts tests/lib/report-csv.test.ts tests/server/reports.test.ts
git commit -m "feat(relatorios): report:view RBAC + monthly occupancy DAL + CSV builder"
```

---

## Task 2: PDF builder + CSV/PDF Route Handlers (TDD on routes)

**Files:** Create `src/lib/report-pdf.tsx`, `src/app/relatorios/csv/route.ts`, `src/app/relatorios/pdf/route.ts`, `tests/app/relatorios-route.test.ts`

- [ ] **Step 1: Install the PDF lib**

Run: `cd /Users/leosperandio/Git/MotelAconchego && pnpm add @react-pdf/renderer`
(Accept any React-19 peer warning; do NOT downgrade react.)

- [ ] **Step 2: PDF builder** `src/lib/report-pdf.tsx`:
```tsx
import 'server-only'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { MonthlyReport } from '@/server/data/reports'

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 10 },
  title: { fontSize: 14, marginBottom: 12 },
  row: { flexDirection: 'row', borderBottom: '1 solid #ccc', paddingVertical: 3 },
  head: { flexDirection: 'row', borderBottom: '1 solid #000', paddingVertical: 3, fontWeight: 'bold' },
  c: { flex: 1 }, cNum: { flex: 1, textAlign: 'right' },
})
const money = (n: number) => `R$ ${n.toFixed(2)}`

export function buildReportPdf(report: MonthlyReport): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Ocupação {String(report.month).padStart(2, '0')}/{report.year}</Text>
        <View style={s.head}>
          <Text style={s.c}>Apto</Text><Text style={s.c}>Cat</Text><Text style={s.cNum}>Locações</Text>
          <Text style={s.cNum}>Estadia</Text><Text style={s.cNum}>Ticket méd.</Text><Text style={s.cNum}>Consumo</Text>
        </View>
        {report.rows.map((r) => (
          <View key={r.roomNumber} style={s.row}>
            <Text style={s.c}>{r.roomNumber}</Text><Text style={s.c}>{r.categoryCode ?? '—'}</Text>
            <Text style={s.cNum}>{r.rentals}</Text><Text style={s.cNum}>{money(r.totalStay)}</Text>
            <Text style={s.cNum}>{money(r.avgTicket)}</Text><Text style={s.cNum}>{money(r.totalConsumption)}</Text>
          </View>
        ))}
        <View style={s.head}>
          <Text style={s.c}>TOTAL</Text><Text style={s.c}></Text><Text style={s.cNum}>{report.totals.rentals}</Text>
          <Text style={s.cNum}>{money(report.totals.totalStay)}</Text><Text style={s.cNum}>{money(report.totals.avgTicket)}</Text>
          <Text style={s.cNum}>{money(report.totals.totalConsumption)}</Text>
        </View>
      </Page>
    </Document>
  )
  return renderToBuffer(doc)
}
```

- [ ] **Step 3: CSV route** `src/app/relatorios/csv/route.ts`:
```ts
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { monthlyOccupancy } from '@/server/data/reports'
import { toCsv } from '@/lib/report-csv'

export async function GET(req: Request) {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'report:view')) return new Response('Forbidden', { status: 403 })
  const { searchParams } = new URL(req.url)
  const now = new Date()
  const year = Number(searchParams.get('year')) || now.getFullYear()
  const month = Number(searchParams.get('month')) || now.getMonth() + 1
  const csv = toCsv(await monthlyOccupancy(year, month))
  const file = `ocupacao-${year}-${String(month).padStart(2, '0')}.csv`
  return new Response('﻿' + csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
```

- [ ] **Step 4: PDF route** `src/app/relatorios/pdf/route.ts`:
```ts
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { monthlyOccupancy } from '@/server/data/reports'
import { buildReportPdf } from '@/lib/report-pdf'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'report:view')) return new Response('Forbidden', { status: 403 })
  const { searchParams } = new URL(req.url)
  const now = new Date()
  const year = Number(searchParams.get('year')) || now.getFullYear()
  const month = Number(searchParams.get('month')) || now.getMonth() + 1
  const buffer = await buildReportPdf(await monthlyOccupancy(year, month))
  const file = `ocupacao-${year}-${String(month).padStart(2, '0')}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
```

- [ ] **Step 5: Route handler test** `tests/app/relatorios-route.test.ts`:
```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { GET as csvGET } from '@/app/relatorios/csv/route'
import { buildReportPdf } from '@/lib/report-pdf'
import { monthlyOccupancy } from '@/server/data/reports'

beforeEach(async () => {
  await db.consumption.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  await db.room.create({ data: { number: '01', status: 'free' } })
  await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: new Date(2026, 5, 1, 12), checkOut: new Date(2026, 5, 1, 14), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 0 } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('CSV route', () => {
  it('manager gets a CSV attachment', async () => {
    const res = await csvGET(new Request('http://x/relatorios/csv?year=2026&month=6'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('ocupacao-2026-06.csv')
    expect(await res.text()).toContain('01;')
  })
  it('non-manager is forbidden', async () => {
    session.current = { id: 2, name: 'R', role: 'reception' }
    const res = await csvGET(new Request('http://x/relatorios/csv?year=2026&month=6'))
    expect(res.status).toBe(403)
  })
})

describe('PDF builder', () => {
  it('produces a non-empty buffer', async () => {
    const buf = await buildReportPdf(await monthlyOccupancy(2026, 6))
    expect(buf.length).toBeGreaterThan(500)
  })
})
```

- [ ] **Step 6: Run → pass**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/app/relatorios-route.test.ts`
Expected: PASS (CSV 200/403, PDF buffer). If `@react-pdf/renderer`'s `renderToBuffer` is slow under vitest, the test may take a few seconds — that's fine. If it errors importing under the node test env, set the test's runtime expectations: the PDF test must still run in Node (it does). Report any incompatibility.

- [ ] **Step 7: Commit**

```bash
git add src/lib/report-pdf.tsx src/app/relatorios/csv/route.ts src/app/relatorios/pdf/route.ts tests/app/relatorios-route.test.ts package.json pnpm-lock.yaml
git commit -m "feat(relatorios): CSV + PDF download route handlers"
```

---

## Task 3: `/relatorios` page + nav (UI)

**Files:** Create `src/app/relatorios/page.tsx`; Modify `src/app/page.tsx`

- [ ] **Step 1: Page** `src/app/relatorios/page.tsx`:
```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { monthlyOccupancy } from '@/server/data/reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const money = (n: number) => `R$ ${n.toFixed(2)}`

async function Report({ year, month }: { year: number; month: number }) {
  await connection()
  let rep
  try { rep = await monthlyOccupancy(year, month) } catch { redirect('/') }
  const qs = `year=${year}&month=${month}`
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle>Ocupação {String(month).padStart(2, '0')}/{year}</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <form method="GET" className="flex items-end gap-2">
            <div className="grid gap-1"><Label htmlFor="month">Mês</Label><Input id="month" name="month" type="number" min="1" max="12" defaultValue={month} className="w-20" /></div>
            <div className="grid gap-1"><Label htmlFor="year">Ano</Label><Input id="year" name="year" type="number" defaultValue={year} className="w-28" /></div>
            <Button type="submit">Ver</Button>
            <Button asChild variant="outline"><a href={`/relatorios/csv?${qs}`}>Baixar CSV</a></Button>
            <Button asChild variant="outline"><a href={`/relatorios/pdf?${qs}`}>Baixar PDF</a></Button>
          </form>
          <Table>
            <TableHeader><TableRow><TableHead>Apto</TableHead><TableHead>Categoria</TableHead><TableHead>Locações</TableHead><TableHead>Total estadia</TableHead><TableHead>Ticket médio</TableHead><TableHead>Total consumo</TableHead></TableRow></TableHeader>
            <TableBody>
              {rep.rows.map((r) => (
                <TableRow key={r.roomNumber}>
                  <TableCell>{r.roomNumber}</TableCell><TableCell>{r.categoryCode ?? '—'}</TableCell>
                  <TableCell>{r.rentals}</TableCell><TableCell>{money(r.totalStay)}</TableCell>
                  <TableCell>{money(r.avgTicket)}</TableCell><TableCell>{money(r.totalConsumption)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>TOTAL</TableCell><TableCell></TableCell><TableCell>{rep.totals.rentals}</TableCell>
                <TableCell>{money(rep.totals.totalStay)}</TableCell><TableCell>{money(rep.totals.avgTicket)}</TableCell>
                <TableCell>{money(rep.totals.totalConsumption)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams
  const now = new Date()
  const year = Number(sp.year) || now.getFullYear()
  const month = Number(sp.month) || now.getMonth() + 1
  return (
    <main className="mx-auto mt-8 max-w-4xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Relatórios</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Report year={year} month={month} />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 2: Home nav** — in `src/app/page.tsx` `HomeContent` nav, add a Relatórios link for managers (next to Produtos):
```tsx
{me?.role === 'manager' && <Button asChild variant="link"><a href="/relatorios">Relatórios</a></Button>}
```

- [ ] **Step 3: Verify**

Run:
```bash
pnpm exec tsc --noEmit
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test
pnpm build
```
Expected: tsc zero errors; all tests pass; build succeeds with `/relatorios`, `/relatorios/csv`, `/relatorios/pdf` in the route table.
If `@react-pdf/renderer` breaks the Turbopack build, add it to `serverExternalPackages` in `next.config.ts` (`const nextConfig = { cacheComponents: true, serverExternalPackages: ['@react-pdf/renderer'] }`) and re-run; report the change.

- [ ] **Step 4: Commit**

```bash
git add src/app/relatorios/page.tsx src/app/page.tsx
git commit -m "feat(relatorios): /relatorios page (month selector, table, downloads) + nav"
```

---

## Self-Review (done)

- **Spec coverage:** report:view RBAC (T1); monthlyOccupancy DAL room-only/month-window (T1); toCsv (T1); buildReportPdf via @react-pdf (T2); CSV + PDF route handlers gated to managers (T2); /relatorios page with month selector + table + download links + nav (T3). E-mail correctly absent (non-goal). All spec sections mapped.
- **Placeholder scan:** none — every step has real code/commands.
- **Type consistency:** `MonthlyReport`/`ReportRow` defined in T1 (`reports.ts`) and consumed by `toCsv` (T1), `buildReportPdf` (T2), routes (T2), page (T3); `monthlyOccupancy(year, month)` signature consistent across T1/T2/T3; `toCsv`/`buildReportPdf` names consistent; `report:view` added once (T1) and used by DAL + both routes. `import type` keeps `report-csv.ts` free of server-only runtime.
- **Test DB note:** DB-backed tests seed fixtures + clean in `beforeEach`; `fileParallelism: false` already set. Route handlers are tested by importing `GET` and passing a `Request`.
