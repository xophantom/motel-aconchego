# Relatórios extras 2 — CSV/PDF por `type` + Seletor `/relatorios` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/relatorios` into a report picker (occupancy + the 4 new reports), each with its own period form and CSV/PDF export, via a single generic table view shared by the page and the route handlers.

**Architecture:** A `reportView(sp)` server function dispatches on `type` and returns a typed matrix (`{ title, columns, rows, total, period }`). A pure `report-format.ts` formats a cell by kind for `csv`/`screen`/`pdf`. The CSV/PDF handlers and the page all consume `reportView` — one source of truth. Slice 2 of 2 (spec `docs/superpowers/specs/2026-07-03-relatorios-extras-design.md`); depends on slice 1.

**Tech Stack:** Next.js 16, Prisma 7, @react-pdf/renderer, Vitest, TypeScript.

## Global Constraints

- **`report:view`** enforced by the DAL functions `reportView` calls.
- **Backward compatible:** no `type` (or invalid) → occupancy monthly (current behavior).
- **One view, three renderers:** page table, CSV, PDF all render the same `ReportView`; formatting differs only by `style`.
- **Civil dates local**, mirroring slice 1 and `monthlyOccupancy`.
- **Tests:** `pnpm test`. Mock `server-only` + `@/server/session`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.

---

### Task 1: `report-format.ts` (pure) + `reportView` dispatcher

**Files:**
- Create: `src/lib/report-format.ts`
- Modify: `src/server/data/reports.ts` (add `reportView` + `REPORT_TYPES`)
- Test: `tests/server/report-view.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // report-format.ts
  export type CellKind = 'text' | 'int' | 'money' | 'datetime' | 'duration' | 'yesno'
  export type ReportColumn = { key: string; label: string; kind: CellKind; align?: 'right' }
  export function formatCell(value: unknown, kind: CellKind, style: 'csv' | 'screen' | 'pdf'): string
  export const REPORT_LABELS: Record<string, string>  // slug → PT label
  // reports.ts
  export type ReportPeriod = { kind: 'month'; year: number; month: number } | { kind: 'range'; from: Date; to: Date }
  export type ReportView = { type: string; title: string; columns: ReportColumn[]; rows: Record<string, unknown>[]; total: Record<string, unknown> | null; period: ReportPeriod }
  export const REPORT_TYPES: string[]  // ['occupancy','movement','stays_orders','bar','operator']
  export async function reportView(sp: Record<string, string | undefined>): Promise<ReportView>
  ```

- [ ] **Step 1: Write `report-format.ts`**

Create `src/lib/report-format.ts`:

```ts
export type CellKind = 'text' | 'int' | 'money' | 'datetime' | 'duration' | 'yesno'
export type ReportColumn = { key: string; label: string; kind: CellKind; align?: 'right' }

export const REPORT_LABELS: Record<string, string> = {
  occupancy: 'Ocupação mensal',
  movement: 'Movimento do período',
  stays_orders: 'Estadias & pedidos',
  bar: 'Produtos do bar',
  operator: 'Por operador',
}

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dtm = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export function formatCell(value: unknown, kind: CellKind, style: 'csv' | 'screen' | 'pdf'): string {
  if (value == null || value === '') return style === 'screen' ? '—' : ''
  switch (kind) {
    case 'money': {
      const n = Number(value)
      return style === 'screen' ? `R$ ${brl(n)}` : n.toFixed(2)
    }
    case 'int':
      return String(Math.trunc(Number(value)))
    case 'datetime': {
      const d = value instanceof Date ? value : new Date(String(value))
      return dtm(d)
    }
    case 'duration': {
      const min = Number(value)
      return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
    }
    case 'yesno':
      return value ? 'Sim' : (style === 'screen' ? '—' : '')
    default:
      return String(value)
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/server/report-view.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { reportView, REPORT_TYPES } from '@/server/data/reports'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('reportView', () => {
  it('exposes the five report types', () => {
    expect(REPORT_TYPES).toEqual(['occupancy', 'movement', 'stays_orders', 'bar', 'operator'])
  })

  it('defaults to occupancy for a missing/invalid type', async () => {
    const v = await reportView({})
    expect(v.type).toBe('occupancy')
    expect(v.period.kind).toBe('month')
    expect(v.columns[0].label).toMatch(/Apto/i)
    const v2 = await reportView({ type: 'nope' })
    expect(v2.type).toBe('occupancy')
  })

  it('builds a range report with columns for movement', async () => {
    const v = await reportView({ type: 'movement', from: '2026-07-04', to: '2026-07-04' })
    expect(v.type).toBe('movement')
    expect(v.period).toEqual({ kind: 'range', from: new Date(2026, 6, 4), to: new Date(2026, 6, 4) })
    expect(v.columns.some((c) => c.key === 'operator')).toBe(true)
  })

  it('is forbidden for reception', async () => {
    session.current = { id: 1, name: 'R', role: 'reception' }
    await expect(reportView({ type: 'bar', from: '2026-07-04', to: '2026-07-04' })).rejects.toThrow(/forbidden/i)
  })
})
```

Run: `pnpm test tests/server/report-view.test.ts` → FAIL.

- [ ] **Step 3: Implement `reportView` in `reports.ts`**

Add the import at the top of `src/server/data/reports.ts`:

```ts
import type { ReportColumn } from '@/lib/report-format'
```

Append:

```ts
export type ReportPeriod = { kind: 'month'; year: number; month: number } | { kind: 'range'; from: Date; to: Date }
export type ReportView = { type: string; title: string; columns: ReportColumn[]; rows: Record<string, unknown>[]; total: Record<string, unknown> | null; period: ReportPeriod }

export const REPORT_TYPES = ['occupancy', 'movement', 'stays_orders', 'bar', 'operator']

function civilDate(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function reportView(sp: Record<string, string | undefined>): Promise<ReportView> {
  const type = REPORT_TYPES.includes(sp.type ?? '') ? (sp.type as string) : 'occupancy'
  const now = new Date()

  if (type === 'occupancy') {
    const year = Number(sp.year) || now.getFullYear()
    const month = Number(sp.month) || now.getMonth() + 1
    const rep = await monthlyOccupancy(year, month)
    return {
      type, title: `Ocupação ${String(rep.month).padStart(2, '0')}/${rep.year}`,
      columns: [
        { key: 'roomNumber', label: 'Apto', kind: 'text' },
        { key: 'categoryCode', label: 'Categoria', kind: 'text' },
        { key: 'rentals', label: 'Locações', kind: 'int', align: 'right' },
        { key: 'totalStay', label: 'Total estadia', kind: 'money', align: 'right' },
        { key: 'avgTicket', label: 'Ticket médio', kind: 'money', align: 'right' },
        { key: 'totalConsumption', label: 'Total consumo', kind: 'money', align: 'right' },
      ],
      rows: rep.rows as unknown as Record<string, unknown>[],
      total: { roomNumber: 'TOTAL', rentals: rep.totals.rentals, totalStay: rep.totals.totalStay, avgTicket: rep.totals.avgTicket, totalConsumption: rep.totals.totalConsumption },
      period: { kind: 'month', year: rep.year, month: rep.month },
    }
  }

  const from = civilDate(sp.from, new Date(now.getFullYear(), now.getMonth(), 1))
  const to = civilDate(sp.to, now)
  const period: ReportPeriod = { kind: 'range', from, to }

  if (type === 'movement') {
    const rep = await movementReport(from, to)
    return {
      type, title: 'Movimento do período', period,
      columns: [
        { key: 'roomNumber', label: 'Quarto', kind: 'text' },
        { key: 'checkIn', label: 'Entrada', kind: 'datetime' },
        { key: 'checkOut', label: 'Saída', kind: 'datetime' },
        { key: 'durationMin', label: 'Duração', kind: 'duration', align: 'right' },
        { key: 'stayAmount', label: 'Estadia', kind: 'money', align: 'right' },
        { key: 'consumption', label: 'Consumo', kind: 'money', align: 'right' },
        { key: 'total', label: 'Total', kind: 'money', align: 'right' },
        { key: 'operator', label: 'Operador', kind: 'text' },
      ],
      rows: rep.rows as unknown as Record<string, unknown>[],
      total: { roomNumber: 'TOTAL', stayAmount: rep.totals.totalStay, consumption: rep.totals.totalConsumption, total: rep.totals.total },
    }
  }

  if (type === 'stays_orders') {
    const rep = await staysOrdersReport(from, to)
    return {
      type, title: 'Estadias & pedidos', period,
      columns: [
        { key: 'nStays', label: 'Estadias', kind: 'int', align: 'right' },
        { key: 'totalStay', label: 'Total estadia', kind: 'money', align: 'right' },
        { key: 'avgTicket', label: 'Ticket médio', kind: 'money', align: 'right' },
        { key: 'nWalkins', label: 'Vendas avulsas', kind: 'int', align: 'right' },
        { key: 'totalConsumption', label: 'Total consumo', kind: 'money', align: 'right' },
      ],
      rows: [rep as unknown as Record<string, unknown>],
      total: null,
    }
  }

  if (type === 'bar') {
    const rep = await barReport(from, to)
    return {
      type, title: 'Produtos do bar', period,
      columns: [
        { key: 'productCode', label: 'Código', kind: 'text' },
        { key: 'description', label: 'Produto', kind: 'text' },
        { key: 'category', label: 'Categoria', kind: 'text' },
        { key: 'qty', label: 'Qtd', kind: 'int', align: 'right' },
        { key: 'revenue', label: 'Receita', kind: 'money', align: 'right' },
      ],
      rows: rep.rows as unknown as Record<string, unknown>[],
      total: { productCode: 'TOTAL', qty: rep.totals.qty, revenue: rep.totals.revenue },
    }
  }

  // operator
  const rep = await operatorReport(from, to)
  return {
    type, title: 'Por operador', period,
    columns: [
      { key: 'operator', label: 'Operador', kind: 'text' },
      { key: 'aptos', label: 'Aptos', kind: 'int', align: 'right' },
      { key: 'received', label: 'Total recebido', kind: 'money', align: 'right' },
      { key: 'avgTicket', label: 'Ticket médio', kind: 'money', align: 'right' },
    ],
    rows: rep.rows as unknown as Record<string, unknown>[],
    total: { operator: 'TOTAL', aptos: rep.totals.aptos, received: rep.totals.received },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/server/report-view.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/report-format.ts src/server/data/reports.ts tests/server/report-view.test.ts
git commit -m "feat(reports): report-format + reportView dispatcher (5 types)"
```

---

### Task 2: Generalize CSV/PDF route handlers by `type`

**Files:**
- Rewrite: `src/lib/report-csv.ts` (generic matrix CSV)
- Rewrite: `src/lib/report-pdf.tsx` (generic matrix PDF)
- Rewrite: `src/app/relatorios/csv/route.ts`
- Rewrite: `src/app/relatorios/pdf/route.ts`
- Test: `tests/app/report-export.test.ts`

**Interfaces:**
- Produces: `toReportCsv(view: ReportView): string`; `buildReportPdf(view: ReportView): Promise<Buffer>`; both handlers read the full `searchParams`, call `reportView`, and stream — 403 on forbidden.

> Note: this replaces the occupancy-only `toCsv`/`buildReportPdf`. Their only callers are these two handlers (rewritten here), so removing the old signatures is safe.

- [ ] **Step 1: Write the failing test**

Create `tests/app/report-export.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { GET as csvGET } from '@/app/relatorios/csv/route'
import { GET as pdfGET } from '@/app/relatorios/pdf/route'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

const url = (p: string) => new Request(`http://localhost${p}`)

describe('report export handlers', () => {
  it('occupancy CSV (no type) responds 200', async () => {
    const res = await csvGET(url('/relatorios/csv?year=2026&month=7'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/csv/)
    expect(await res.text()).toMatch(/Apto/)
  })

  it('bar CSV responds 200 with its header', async () => {
    const res = await csvGET(url('/relatorios/csv?type=bar&from=2026-07-04&to=2026-07-04'))
    expect(res.status).toBe(200)
    expect(await res.text()).toMatch(/Receita/)
  })

  it('operator PDF responds 200 application/pdf', async () => {
    const res = await pdfGET(url('/relatorios/pdf?type=operator&from=2026-07-04&to=2026-07-04'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })

  it('reception gets 403', async () => {
    session.current = { id: 1, name: 'R', role: 'reception' }
    expect((await csvGET(url('/relatorios/csv?type=bar&from=2026-07-04&to=2026-07-04'))).status).toBe(403)
  })
})
```

Run: `pnpm test tests/app/report-export.test.ts` → FAIL.

- [ ] **Step 2: Rewrite the CSV lib**

Replace `src/lib/report-csv.ts` with:

```ts
import type { ReportView } from '@/server/data/reports'
import { formatCell } from '@/lib/report-format'

export function toReportCsv(view: ReportView): string {
  const header = view.columns.map((c) => c.label).join(';')
  const line = (row: Record<string, unknown>) => view.columns.map((c) => formatCell(row[c.key], c.kind, 'csv')).join(';')
  const body = view.rows.map(line)
  const lines = [header, ...body]
  if (view.total) lines.push(line(view.total))
  return lines.join('\n')
}
```

- [ ] **Step 3: Rewrite the PDF lib**

Replace `src/lib/report-pdf.tsx` with:

```tsx
import 'server-only'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { ReportView } from '@/server/data/reports'
import { formatCell } from '@/lib/report-format'

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9 },
  title: { fontSize: 14, marginBottom: 12 },
  row: { flexDirection: 'row', borderBottom: '1 solid #ccc', paddingVertical: 3 },
  head: { flexDirection: 'row', borderBottom: '1 solid #000', paddingVertical: 3, fontWeight: 'bold' },
  cell: { flex: 1 }, cellRight: { flex: 1, textAlign: 'right' },
})

export function buildReportPdf(view: ReportView): Promise<Buffer> {
  const cellStyle = (align?: 'right') => (align === 'right' ? s.cellRight : s.cell)
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{view.title}</Text>
        <View style={s.head}>
          {view.columns.map((c) => <Text key={c.key} style={cellStyle(c.align)}>{c.label}</Text>)}
        </View>
        {view.rows.map((row, i) => (
          <View key={i} style={s.row}>
            {view.columns.map((c) => <Text key={c.key} style={cellStyle(c.align)}>{formatCell(row[c.key], c.kind, 'pdf')}</Text>)}
          </View>
        ))}
        {view.total && (
          <View style={s.head}>
            {view.columns.map((c) => <Text key={c.key} style={cellStyle(c.align)}>{formatCell(view.total![c.key], c.kind, 'pdf')}</Text>)}
          </View>
        )}
      </Page>
    </Document>
  )
  return renderToBuffer(doc)
}
```

- [ ] **Step 4: Rewrite the handlers**

Replace `src/app/relatorios/csv/route.ts` with:

```ts
import { reportView } from '@/server/data/reports'
import { toReportCsv } from '@/lib/report-csv'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sp = Object.fromEntries(searchParams.entries())
  let view
  try { view = await reportView(sp) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) return new Response('Forbidden', { status: 403 }); throw e }
  const file = `${view.type}.csv`
  return new Response('﻿' + toReportCsv(view), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
```

Replace `src/app/relatorios/pdf/route.ts` with:

```ts
import { reportView } from '@/server/data/reports'
import { buildReportPdf } from '@/lib/report-pdf'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sp = Object.fromEntries(searchParams.entries())
  let view
  try { view = await reportView(sp) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) return new Response('Forbidden', { status: 403 }); throw e }
  const buffer = await buildReportPdf(view)
  const file = `${view.type}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test tests/app/report-export.test.ts` → PASS. Then `pnpm test` → all PASS (the old occupancy CSV/PDF still work through the new generic path).

- [ ] **Step 6: Commit**

```bash
git add src/lib/report-csv.ts src/lib/report-pdf.tsx src/app/relatorios/csv/route.ts src/app/relatorios/pdf/route.ts tests/app/report-export.test.ts
git commit -m "feat(reports): generic CSV/PDF handlers by report type"
```

---

### Task 3: `/relatorios` selector page

**Files:**
- Rewrite: `src/app/relatorios/page.tsx`
- Test: `tests/app/relatorios-page.test.tsx`

**Interfaces:**
- Consumes: `reportView`, `REPORT_TYPES`, `REPORT_LABELS`, `formatCell`.
- Produces: `/relatorios` with a report `<select>` (5 options), the matching period form (month/year for occupancy, de/até otherwise), a generic table, and CSV/PDF buttons. Exports `ReportBody` for the test.

- [ ] **Step 1: Write the failing test**

Create `tests/app/relatorios-page.test.tsx`:

```tsx
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ connection: async () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
const redirect = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_REDIRECT') }))
vi.mock('next/navigation', () => ({ redirect }))

import { renderToStaticMarkup } from 'react-dom/server'
import { db } from '@/server/db'
import { ReportBody } from '@/app/relatorios/page'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

async function render(node: Promise<React.ReactElement>) { return renderToStaticMarkup(await node) }

describe('/relatorios selector', () => {
  it('renders the bar report table and CSV link with type', async () => {
    await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true } })
    const html = await render(ReportBody({ searchParams: Promise.resolve({ type: 'bar', from: '2026-07-04', to: '2026-07-04' }) }))
    expect(html).toMatch(/Produtos do bar/)
    expect(html).toContain('type=bar')
    expect(html).toMatch(/Receita/)
  })

  it('redirects reception', async () => {
    session.current = { id: 1, name: 'R', role: 'reception' }
    await expect(render(ReportBody({ searchParams: Promise.resolve({ type: 'bar' }) }))).rejects.toThrow(/REDIRECT/)
  })
})
```

Run: `pnpm test tests/app/relatorios-page.test.tsx` → FAIL.

- [ ] **Step 2: Rewrite the page**

Replace `src/app/relatorios/page.tsx` with:

```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { reportView, REPORT_TYPES } from '@/server/data/reports'
import { REPORT_LABELS, formatCell } from '@/lib/report-format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PageHeader } from '@/components/page-header'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function ReportBody({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection()
  const sp = await searchParams
  let view
  try { view = await reportView(sp) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/'); throw e }

  // querystring for the CSV/PDF links, echoing type + the resolved period
  const qs = new URLSearchParams()
  qs.set('type', view.type)
  if (view.period.kind === 'month') { qs.set('year', String(view.period.year)); qs.set('month', String(view.period.month)) }
  else { qs.set('from', iso(view.period.from)); qs.set('to', iso(view.period.to)) }
  const q = qs.toString()

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle className="font-display">Relatório</CardTitle></CardHeader>
        <CardContent>
          <form method="GET" className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="type" className="text-xs">Tipo</Label>
              <NativeSelect id="type" name="type" defaultValue={view.type} className="w-52">
                {REPORT_TYPES.map((t) => <NativeSelectOption key={t} value={t}>{REPORT_LABELS[t]}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            {view.period.kind === 'month' ? (
              <>
                <div className="grid gap-1"><Label htmlFor="month" className="text-xs">Mês</Label><Input id="month" name="month" type="number" min="1" max="12" defaultValue={view.period.month} className="w-20" /></div>
                <div className="grid gap-1"><Label htmlFor="year" className="text-xs">Ano</Label><Input id="year" name="year" type="number" defaultValue={view.period.year} className="w-28" /></div>
              </>
            ) : (
              <>
                <div className="grid gap-1"><Label htmlFor="from" className="text-xs">De</Label><Input id="from" name="from" type="date" defaultValue={iso(view.period.from)} /></div>
                <div className="grid gap-1"><Label htmlFor="to" className="text-xs">Até</Label><Input id="to" name="to" type="date" defaultValue={iso(view.period.to)} /></div>
              </>
            )}
            <Button type="submit">Ver</Button>
            <Button asChild variant="outline"><a href={`/relatorios/csv?${q}`}>Baixar CSV</a></Button>
            <Button asChild variant="outline"><a href={`/relatorios/pdf?${q}`}>Baixar PDF</a></Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display">{view.title}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>{view.columns.map((c) => <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : undefined}>{c.label}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {view.rows.length === 0 && <TableRow><TableCell colSpan={view.columns.length} className="text-center text-sm text-muted-foreground">Sem dados no período.</TableCell></TableRow>}
              {view.rows.map((row, i) => (
                <TableRow key={i}>
                  {view.columns.map((c) => <TableCell key={c.key} className={`${c.align === 'right' ? 'text-right ' : ''}${c.kind === 'money' || c.kind === 'int' || c.kind === 'duration' ? 'tnum' : ''}`}>{formatCell(row[c.key], c.kind, 'screen')}</TableCell>)}
                </TableRow>
              ))}
              {view.total && (
                <TableRow className="border-t-2 border-primary/40 font-semibold">
                  {view.columns.map((c) => <TableCell key={c.key} className={`${c.align === 'right' ? 'text-right ' : ''}${c.kind === 'money' || c.kind === 'int' ? 'tnum' : ''}`}>{formatCell(view.total![c.key], c.kind, 'screen')}</TableCell>)}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function RelatoriosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Relatórios" subtitle="Ocupação, movimento, estadias, bar e operador — CSV ou PDF." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <ReportBody searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 3: Run + build + full suite**

Run: `pnpm test tests/app/relatorios-page.test.tsx` → PASS.
Run: `pnpm build` → succeeds (`/relatorios`, `/relatorios/csv`, `/relatorios/pdf`).
Run: `pnpm test` → all PASS.

- [ ] **Step 4: Manual smoke (recommended)**

`pnpm dev`, login as manager, `/relatorios`: switch the report select → the period form and table change; occupancy still works; download CSV/PDF for each type; reception is redirected.

- [ ] **Step 5: Commit**

```bash
git add src/app/relatorios/page.tsx tests/app/relatorios-page.test.tsx
git commit -m "feat(reports): /relatorios report selector (5 types) + generic table"
```
