# Fechamento de turno — Plano 3 (Relatório detalhado + impressão 80mm) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relatório do turno (detalhado apto-a-apto + resumo) e sua impressão térmica 80mm, reusando a infra do ticket.

**Architecture:** Um DAL `shiftReport(shiftId)` monta as linhas (estadias com checkout na janela + avulsas) e o resumo (via `shiftMetrics`). Uma rota `/caixa/turno/[shiftId]` renderiza o recibo 80mm (classes `.ticket` já existentes) e auto-imprime, igual `/ticket/[stayId]`.

**Tech Stack:** Next 16 (App Router, `connection()`, Suspense), React 19, Prisma 7, Vitest (`renderToStaticMarkup`).

## Global Constraints

- **Depende dos Planos 1-2** (mergeados): `shiftMetrics` estendido, `Shift.closedBy`.
- **Reusa o print do ticket:** o CSS `@media print` de `globals.css` mostra só `#ticket`. O recibo do turno usa `id="ticket"` + classes `.ticket*` e `.ticket-page`, igual `src/app/ticket/receipt.tsx`.
- Guard: `shiftReport` exige `cash:manage` (mesma `requireCash`).
- Tests: `pnpm test`. Commits: Conventional Commits, sem `Co-Authored-By`.

---

### Task 1: DAL `shiftReport`

**Files:**
- Modify: `src/server/data/shifts.ts` (add `shiftReport` + tipos)
- Test: `tests/server/data/shift-report.test.ts`

**Interfaces:**
- Produces:
  - `type ShiftReportLine = { room: string; checkIn: Date; checkOut: Date | null; stayAmount: number; consumptionAmount: number }`
  - `type ShiftReport = { shift: { id: string; period: string; businessDate: Date; openedAt: Date; closedAt: Date | null; openingBalance: number }; metrics: ShiftMetrics; closedByName: string | null; lines: ShiftReportLine[] }`
  - `shiftReport(shiftId: bigint): Promise<ShiftReport>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/data/shift-report.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
const session = vi.hoisted(() => ({ current: { id: 1, name: 'Rec', role: 'reception' } as any }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { shiftReport } from '@/server/data/shifts'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Rec', username: 'rec', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
})

describe('shiftReport', () => {
  it('lists closed stays in the window and summarizes', async () => {
    const shift = await db.shift.create({ data: { businessDate: new Date('2020-03-01'), period: 'day_07_19', employeeId: 1, openedAt: new Date('2020-03-01T07:00:00'), openingBalance: 150, expectedOpeningBalance: 150 } })
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: new Date('2020-03-01T09:00:00'), checkOut: new Date('2020-03-01T11:00:00'), status: 'closed', stayAmount: 75, consumptionAmount: 20 } })
    const rep = await shiftReport(shift.id)
    expect(rep.lines).toHaveLength(1)
    expect(rep.lines[0]).toMatchObject({ room: '01', stayAmount: 75, consumptionAmount: 20 })
    expect(rep.metrics.total).toBe(rep.metrics.totalEstadias + rep.metrics.totalConsumo)
    expect(rep.closedByName).toBeNull()
  })
})
```

- [ ] **Step 2: Run test — fails.**

- [ ] **Step 3: Implement** (append em `src/server/data/shifts.ts`)

```ts
export type ShiftReportLine = { room: string; checkIn: Date; checkOut: Date | null; stayAmount: number; consumptionAmount: number }
export type ShiftReport = {
  shift: { id: string; period: string; businessDate: Date; openedAt: Date; closedAt: Date | null; openingBalance: number }
  metrics: ShiftMetrics; closedByName: string | null; lines: ShiftReportLine[]
}

export async function shiftReport(shiftId: bigint): Promise<ShiftReport> {
  await requireCash()
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId }, include: { closedBy: true } })
  const end = shift.closedAt ?? new Date()
  const stays = await db.stay.findMany({ where: { status: 'closed', checkOut: { gte: shift.openedAt, lte: end } }, orderBy: { checkOut: 'asc' } })
  const lines: ShiftReportLine[] = stays.map((s) => ({ room: s.roomNumber ?? '—', checkIn: s.checkIn, checkOut: s.checkOut, stayAmount: Number(s.stayAmount ?? 0), consumptionAmount: Number(s.consumptionAmount) }))
  const metrics = await shiftMetrics(shift)
  return {
    shift: { id: String(shift.id), period: shift.period, businessDate: shift.businessDate, openedAt: shift.openedAt, closedAt: shift.closedAt, openingBalance: Number(shift.openingBalance) },
    metrics, closedByName: shift.closedBy?.name ?? null, lines,
  }
}
```

- [ ] **Step 4: Run test — passes.** Then `pnpm test` (full) — green.

- [ ] **Step 5: Commit**

```bash
git add src/server/data/shifts.ts tests/server/data/shift-report.test.ts
git commit -m "feat(caixa): DAL shiftReport (detalhe apto-a-apto + resumo)"
```

---

### Task 2: Recibo 80mm + rota `/caixa/turno/[shiftId]` (auto-print)

**Files:**
- Create: `src/app/caixa/turno/[shiftId]/receipt.tsx` (componente `ShiftReceipt`)
- Create: `src/app/caixa/turno/[shiftId]/auto-print.tsx` (client, `window.print()` no mount)
- Create: `src/app/caixa/turno/[shiftId]/print-button.tsx` (client, botão imprimir)
- Create: `src/app/caixa/turno/[shiftId]/page.tsx`
- Test: `tests/app/shift-receipt.test.tsx`

**Interfaces:**
- Consumes: `shiftReport` (Task 1); tipo `ShiftReport`.
- Produces: `ShiftReceipt({ data: ShiftReport })`; rota que renderiza e imprime.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/shift-receipt.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShiftReceipt } from '@/app/caixa/turno/[shiftId]/receipt'

const data = {
  shift: { id: '7', period: 'day_07_19', businessDate: new Date('2026-08-07T00:00:00'), openedAt: new Date('2026-08-07T07:00:00'), closedAt: new Date('2026-08-07T19:00:00'), openingBalance: 150 },
  metrics: { nAptos: 3, totalEstadias: 765, totalConsumo: 230, totalSangrias: 0, totalSuprimentos: 0, totalCorrecoes: 0, ticketMedio: 255, saldo: 1145, retiradoDinheiro: 100, retiradoCartao: 420, total: 995, openingDifference: 0 },
  closedByName: 'Vanessa',
  lines: [{ room: '01', checkIn: new Date('2026-08-07T09:00:00'), checkOut: new Date('2026-08-07T11:00:00'), stayAmount: 75, consumptionAmount: 20 }],
} as any

describe('ShiftReceipt', () => {
  it('renders detail + summary', () => {
    const html = renderToStaticMarkup(<ShiftReceipt data={data} />)
    expect(html).toContain('id="ticket"')
    expect(html).toMatch(/Total.*Estadia/s)
    expect(html).toContain('Vanessa')
    expect(html).toMatch(/Retirado.*Dinheiro/s)
    expect(html).toMatch(/Retirado.*Cart/s)
    expect(html).toContain('01') // linha do apto
  })
})
```

- [ ] **Step 2: Run test — fails.**

- [ ] **Step 3: Implement**

`src/app/caixa/turno/[shiftId]/receipt.tsx`:
```tsx
import type { ShiftReport } from '@/server/data/shifts'
import { MOTEL_NAME } from '@/lib/config'

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const hm = (d: Date | null) => (d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')
const periodLabel = (p: string) => (p === 'day_07_19' ? 'Diurno (07–19)' : 'Noturno (19–07)')

export function ShiftReceipt({ data }: { data: ShiftReport }) {
  const m = data.metrics
  return (
    <div id="ticket" className="ticket">
      <div className="t-center t-bold">{MOTEL_NAME}</div>
      <div className="t-center">Relatório de turno · {periodLabel(data.shift.period)}</div>
      <div className="t-center t-small">{data.shift.businessDate.toLocaleDateString('pt-BR')}</div>
      <div className="t-sep" />
      <div className="t-row t-small t-bold"><span>Apto</span><span>Entra/Saída</span><span>Est/Cons</span></div>
      {data.lines.map((l, i) => (
        <div className="t-row t-small" key={i}>
          <span>{l.room}</span>
          <span>{hm(l.checkIn)}–{hm(l.checkOut)}</span>
          <span className="tnum">{brl(l.stayAmount)}/{brl(l.consumptionAmount)}</span>
        </div>
      ))}
      <div className="t-sep" />
      <div className="t-row"><span>Total em Estadia</span><span className="tnum">{brl(m.totalEstadias)}</span></div>
      <div className="t-row"><span>Total em Consumo</span><span className="tnum">{brl(m.totalConsumo)}</span></div>
      <div className="t-row"><span>Nº de Aptos</span><span className="tnum">{m.nAptos}</span></div>
      <div className="t-row t-bold"><span>Total</span><span className="tnum">{brl(m.total)}</span></div>
      <div className="t-sep" />
      <div className="t-row"><span>Retirado em Dinheiro</span><span className="tnum">{brl(m.retiradoDinheiro)}</span></div>
      <div className="t-row"><span>Retirado em Cartão</span><span className="tnum">{brl(m.retiradoCartao)}</span></div>
      {m.openingDifference !== 0 && (
        <div className="t-row"><span>⚠ Diferença de abertura</span><span className="tnum">{brl(m.openingDifference)}</span></div>
      )}
      <div className="t-sep" />
      <div className="t-row t-bold t-total"><span>Saldo atual</span><span className="tnum">R$ {brl(m.saldo)}</span></div>
      <div className="t-sep" />
      <div className="t-row"><span>Fechado por</span><span>{data.closedByName ?? '—'}{data.shift.closedAt ? ` · ${hm(data.shift.closedAt)}` : ''}</span></div>
    </div>
  )
}
```
`src/app/caixa/turno/[shiftId]/auto-print.tsx`:
```tsx
'use client'
import { useEffect } from 'react'
export function AutoPrint() {
  useEffect(() => { const t = setTimeout(() => window.print(), 300); return () => clearTimeout(t) }, [])
  return null
}
```
`src/app/caixa/turno/[shiftId]/print-button.tsx`:
```tsx
'use client'
export function PrintButton() {
  return <button className="ticket-print-btn" onClick={() => window.print()}>Imprimir</button>
}
```
`src/app/caixa/turno/[shiftId]/page.tsx`:
```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { notFound, redirect } from 'next/navigation'
import { shiftReport } from '@/server/data/shifts'
import { ShiftReceipt } from './receipt'
import { AutoPrint } from './auto-print'
import { PrintButton } from './print-button'

export async function ShiftTicketContent({ params, searchParams }: { params: Promise<{ shiftId: string }>; searchParams: Promise<{ auto?: string }> }) {
  await connection()
  const { shiftId } = await params
  const { auto } = await searchParams
  let data
  try { data = await shiftReport(BigInt(shiftId)) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/'); notFound() }
  return (
    <div className="ticket-page">
      {auto === '1' && <AutoPrint />}
      <ShiftReceipt data={data} />
      <div className="ticket-actions"><PrintButton /></div>
    </div>
  )
}

export default function ShiftTicketPage({ params, searchParams }: { params: Promise<{ shiftId: string }>; searchParams: Promise<{ auto?: string }> }) {
  return <Suspense fallback={null}><ShiftTicketContent params={params} searchParams={searchParams} /></Suspense>
}
```

- [ ] **Step 4: Run test — passes.** Then `pnpm test` (full) + `pnpm build` — green (rota nova respeita cacheComponents: `connection()` no topo).

- [ ] **Step 5: Commit**

```bash
git add src/app/caixa/turno tests/app/shift-receipt.test.tsx
git commit -m "feat(caixa): recibo 80mm do turno + rota /caixa/turno/[shiftId] (auto-print)"
```

---

## Self-Review
- **Spec coverage:** relatório detalhado apto-a-apto + resumo (Total Estadia/Consumo, Nº Aptos, Total, Retirado Dinheiro/Cartão, quem fechou + horário, Saldo atual, aviso de diferença) ✓; impressão 80mm reusando `.ticket`/`@media print` ✓.
- **Placeholders:** nenhum — o botão de imprimir é o client `PrintButton` (`window.print()`).
- **Type consistency:** `ShiftReport`/`ShiftReportLine`/`ShiftMetrics` consistentes entre DAL, recibo e teste.
