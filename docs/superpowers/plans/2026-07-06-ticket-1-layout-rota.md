# Ticket térmico 1 — DAL + Layout + Rota `/ticket/[stayId]` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an 80mm print receipt for a (closed) stay at `/ticket/[stayId]`, driven by the stay's own charged numbers, with print CSS that isolates the receipt on paper.

**Architecture:** A `server-only` read `getStayForTicket` in `stays.ts` (`stay:manage`); a pure server-rendered `TicketReceipt` component wrapped in `#ticket`; a route `/ticket/[stayId]` that renders it (404 for a missing stay). Global `@media print` rules hide everything except `#ticket` and set `@page size:80mm`. The app nav is hidden on `/ticket` on screen via a small client gate. Slice 1 of 2 (spec `docs/superpowers/specs/2026-07-03-ticket-termico-design.md`); slice 2 = print trigger on checkout + reprint + audit.

**Tech Stack:** Next.js 16 (App Router, server components), Prisma 7, Vitest, TypeScript.

## Global Constraints

- **Prisma imports** from `@/generated/prisma/client`; **DB singleton** `@/server/db`; **server-only** in DAL.
- **No schema change, no PDF, no persistence.** The ticket reflects what was charged — nothing recomputed.
- **RBAC:** reuse `stay:manage` (reception + manager) to read/print. No new action.
- **Tests:** `pnpm test`. Mock `server-only` + `@/server/session`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.

---

### Task 1: `MOTEL_NAME` config

**Files:**
- Create: `src/lib/config.ts`

**Interfaces:**
- Produces: `export const MOTEL_NAME: string` (default `"Motel Aconchego"`, overridable by `process.env.MOTEL_NAME`).

- [ ] **Step 1: Write it**

Create `src/lib/config.ts`:

```ts
export const MOTEL_NAME = process.env.MOTEL_NAME ?? 'Motel Aconchego'
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat(ticket): MOTEL_NAME config constant"
```

---

### Task 2: `getStayForTicket` DAL

**Files:**
- Modify: `src/server/data/stays.ts`
- Test: `tests/server/ticket-dal.test.ts`

**Interfaces:**
- Consumes: `db`, `requireOps` (existing, `stay:manage`).
- Produces:
  ```ts
  export type TicketData = {
    id: string
    roomNumber: string | null
    categoryDescription: string | null
    checkIn: Date
    checkOut: Date | null
    stayAmount: number
    consumptionAmount: number
    prepaidAmount: number
    discountPercent: number
    items: { description: string; qty: number; unitPrice: number }[]
    entryOperator: string | null
    paymentOperator: string | null
  }
  export async function getStayForTicket(stayId: bigint): Promise<TicketData | null>
  ```
  Requires `stay:manage`; returns `null` if the stay does not exist.

- [ ] **Step 1: Write the failing test**

Create `tests/server/ticket-dal.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { getStayForTicket } from '@/server/data/stays'

let stayId: bigint
beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.consumption.deleteMany(); await db.stay.deleteMany()
  await db.product.deleteMany(); await db.room.deleteMany(); await db.rate.deleteMany()
  await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'Rústico', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '07', status: 'cleaning', categoryId: cat.id } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true } })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '07', categoryId: cat.id, checkIn: new Date(2026, 6, 4, 20), checkOut: new Date(2026, 6, 4, 23), status: 'closed', day: 'normal', guests: 2, stayAmount: 90, consumptionAmount: 20, prepaidAmount: 30, discountPercent: 10, entryEmployeeId: 1, paymentEmployeeId: 1 } })
  await db.consumption.create({ data: { stayId: stay.id, productCode: 'CLA', qty: 2, unitPrice: 10 } })
  stayId = stay.id
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('getStayForTicket', () => {
  it('returns the charged fields, items and operators', async () => {
    const t = (await getStayForTicket(stayId))!
    expect(t.roomNumber).toBe('07')
    expect(t.categoryDescription).toBe('Rústico')
    expect(t.stayAmount).toBe(90)
    expect(t.consumptionAmount).toBe(20)
    expect(t.prepaidAmount).toBe(30)
    expect(t.discountPercent).toBe(10)
    expect(t.items).toEqual([{ description: 'Cerveja', qty: 2, unitPrice: 10 }])
    expect(t.entryOperator).toBe('Boss')
    expect(t.paymentOperator).toBe('Boss')
  })

  it('returns null for a missing stay', async () => {
    expect(await getStayForTicket(999999n)).toBeNull()
  })

  it('is forbidden for housekeeper', async () => {
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    await expect(getStayForTicket(stayId)).rejects.toThrow(/forbidden/i)
  })
})
```

Run: `pnpm test tests/server/ticket-dal.test.ts` → FAIL.

- [ ] **Step 2: Implement `getStayForTicket`**

Append to `src/server/data/stays.ts`:

```ts
export type TicketData = {
  id: string
  roomNumber: string | null
  categoryDescription: string | null
  checkIn: Date
  checkOut: Date | null
  stayAmount: number
  consumptionAmount: number
  prepaidAmount: number
  discountPercent: number
  items: { description: string; qty: number; unitPrice: number }[]
  entryOperator: string | null
  paymentOperator: string | null
}

export async function getStayForTicket(stayId: bigint): Promise<TicketData | null> {
  await requireOps()
  const stay = await db.stay.findUnique({
    where: { id: stayId },
    select: {
      id: true, roomNumber: true, checkIn: true, checkOut: true,
      stayAmount: true, consumptionAmount: true, prepaidAmount: true, discountPercent: true,
      category: { select: { description: true } },
      entryEmployee: { select: { name: true } },
      paymentEmployee: { select: { name: true } },
      consumptions: { orderBy: { createdAt: 'asc' }, select: { qty: true, unitPrice: true, product: { select: { description: true } }, productCode: true } },
    },
  })
  if (!stay) return null
  return {
    id: String(stay.id),
    roomNumber: stay.roomNumber,
    categoryDescription: stay.category?.description ?? null,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    stayAmount: Number(stay.stayAmount ?? 0),
    consumptionAmount: Number(stay.consumptionAmount ?? 0),
    prepaidAmount: Number(stay.prepaidAmount ?? 0),
    discountPercent: stay.discountPercent,
    items: stay.consumptions.map((c) => ({ description: c.product?.description ?? c.productCode ?? '—', qty: c.qty, unitPrice: Number(c.unitPrice) })),
    entryOperator: stay.entryEmployee?.name ?? null,
    paymentOperator: stay.paymentEmployee?.name ?? null,
  }
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/server/ticket-dal.test.ts` → PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add src/server/data/stays.ts tests/server/ticket-dal.test.ts
git commit -m "feat(ticket): getStayForTicket read DAL"
```

---

### Task 3: `TicketReceipt` component

**Files:**
- Create: `src/app/ticket/receipt.tsx`
- Test: `tests/app/ticket-receipt.test.tsx`

**Interfaces:**
- Consumes: `TicketData` (Task 2), `MOTEL_NAME` (Task 1).
- Produces: `export function TicketReceipt({ data }: { data: TicketData }): JSX.Element` — a pure server-render receipt wrapped in `<div id="ticket">`. Shows the discount block only when `discountPercent > 0`. Total = `stayAmount + consumptionAmount − prepaidAmount`.

- [ ] **Step 1: Write the failing test**

Create `tests/app/ticket-receipt.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TicketReceipt } from '@/app/ticket/receipt'
import type { TicketData } from '@/server/data/stays'

const base: TicketData = {
  id: '1', roomNumber: '07', categoryDescription: 'Rústico',
  checkIn: new Date(2026, 6, 4, 20), checkOut: new Date(2026, 6, 4, 23),
  stayAmount: 90, consumptionAmount: 20, prepaidAmount: 30, discountPercent: 0,
  items: [{ description: 'Cerveja', qty: 2, unitPrice: 10 }],
  entryOperator: 'Boss', paymentOperator: 'Boss',
}

describe('TicketReceipt', () => {
  it('renders the total (90 + 20 − 30 = 80), the room, and the item', () => {
    const html = renderToStaticMarkup(<TicketReceipt data={base} />)
    expect(html).toContain('id="ticket"')
    expect(html).toContain('07')
    expect(html).toContain('Cerveja')
    expect(html).toContain('80,00')  // total, pt-BR
  })

  it('omits the discount line when discountPercent is 0', () => {
    const html = renderToStaticMarkup(<TicketReceipt data={base} />)
    expect(html).not.toMatch(/Desconto/i)
  })

  it('shows the discount line when discountPercent > 0', () => {
    const html = renderToStaticMarkup(<TicketReceipt data={{ ...base, discountPercent: 10 }} />)
    expect(html).toMatch(/Desconto/i)
    expect(html).toContain('10%')
  })
})
```

Run: `pnpm test tests/app/ticket-receipt.test.tsx` → FAIL.

- [ ] **Step 2: Implement the receipt**

Create `src/app/ticket/receipt.tsx`:

```tsx
import type { TicketData } from '@/server/data/stays'
import { MOTEL_NAME } from '@/lib/config'

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dt = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
function durationLabel(a: Date, b: Date | null) {
  if (!b) return '—'
  const min = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000))
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

export function TicketReceipt({ data }: { data: TicketData }) {
  const total = data.stayAmount + data.consumptionAmount - data.prepaidAmount
  return (
    <div id="ticket" className="ticket">
      <div className="t-center t-bold">{MOTEL_NAME}</div>
      <div className="t-center">Comprovante de saída</div>
      <div className="t-sep" />
      <div className="t-row"><span>Quarto</span><span>{data.roomNumber ?? '—'}{data.categoryDescription ? ` · ${data.categoryDescription}` : ''}</span></div>
      <div className="t-row"><span>Entrada</span><span>{dt(data.checkIn)}</span></div>
      <div className="t-row"><span>Saída</span><span>{data.checkOut ? dt(data.checkOut) : '—'}</span></div>
      <div className="t-row"><span>Duração</span><span>{durationLabel(data.checkIn, data.checkOut)}</span></div>
      {data.items.length > 0 && (
        <>
          <div className="t-sep" />
          <div className="t-bold">Consumo</div>
          {data.items.map((it, i) => (
            <div className="t-row" key={i}><span>{it.qty}× {it.description}</span><span className="tnum">{brl(it.unitPrice * it.qty)}</span></div>
          ))}
        </>
      )}
      <div className="t-sep" />
      <div className="t-row"><span>Estadia</span><span className="tnum">{brl(data.stayAmount)}</span></div>
      {data.discountPercent > 0 && (
        <div className="t-row"><span>Desconto ({data.discountPercent}%)</span><span className="tnum">aplicado</span></div>
      )}
      <div className="t-row"><span>Consumo</span><span className="tnum">{brl(data.consumptionAmount)}</span></div>
      <div className="t-row"><span>Antecipado</span><span className="tnum">− {brl(data.prepaidAmount)}</span></div>
      <div className="t-sep" />
      <div className="t-row t-bold t-total"><span>TOTAL</span><span className="tnum">R$ {brl(total)}</span></div>
      <div className="t-sep" />
      <div className="t-row"><span>Operador</span><span>{data.paymentOperator ?? data.entryOperator ?? '—'}</span></div>
      <div className="t-center t-small">Emitido em {dt(new Date())}</div>
    </div>
  )
}
```

> `dt(new Date())` uses the current time for the emission line. This makes the render time-dependent; the test only asserts static content (room, item, total, discount), so it stays deterministic.

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test tests/app/ticket-receipt.test.tsx` → PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add src/app/ticket/receipt.tsx tests/app/ticket-receipt.test.tsx
git commit -m "feat(ticket): 80mm TicketReceipt component"
```

---

### Task 4: Route `/ticket/[stayId]` + print CSS + nav gate

**Files:**
- Create: `src/app/ticket/[stayId]/page.tsx`
- Modify: `src/app/globals.css` (append print + ticket styles)
- Create: `src/components/nav-gate.tsx`
- Modify: `src/app/layout.tsx` (wrap `AppNav` in the gate)
- Test: `tests/app/ticket-route.test.tsx`

**Interfaces:**
- Consumes: `getStayForTicket`, `TicketReceipt`.
- Produces: route `/ticket/[stayId]` (server component) rendering the receipt or `notFound()`; `.ticket` + `@media print` CSS; `NavGate` hiding the nav on `/ticket` on screen.

- [ ] **Step 1: Write the failing route test**

Create `tests/app/ticket-route.test.tsx`:

```tsx
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ connection: async () => {} }))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound }))

import { renderToStaticMarkup } from 'react-dom/server'
import { db } from '@/server/db'
import TicketPage from '@/app/ticket/[stayId]/page'

let stayId: bigint
beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.consumption.deleteMany(); await db.stay.deleteMany()
  await db.room.deleteMany(); await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '07', status: 'cleaning', categoryId: cat.id } })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '07', categoryId: cat.id, checkIn: new Date(2026, 6, 4, 20), checkOut: new Date(2026, 6, 4, 23), status: 'closed', day: 'normal', guests: 2, stayAmount: 90, consumptionAmount: 0, prepaidAmount: 0, discountPercent: 0, entryEmployeeId: 1, paymentEmployeeId: 1 } })
  stayId = stay.id
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

async function render(node: Promise<React.ReactElement>) { return renderToStaticMarkup(await node) }

describe('/ticket/[stayId]', () => {
  it('renders the receipt for an existing stay', async () => {
    const html = await render(TicketPage({ params: Promise.resolve({ stayId: String(stayId) }), searchParams: Promise.resolve({}) }))
    expect(html).toContain('id="ticket"')
    expect(html).toContain('07')
  })

  it('calls notFound for a missing stay', async () => {
    await expect(render(TicketPage({ params: Promise.resolve({ stayId: '999999' }), searchParams: Promise.resolve({}) }))).rejects.toThrow(/NOT_FOUND/)
  })
})
```

Run: `pnpm test tests/app/ticket-route.test.tsx` → FAIL.

- [ ] **Step 2: Create the route**

Create `src/app/ticket/[stayId]/page.tsx`:

```tsx
import { connection } from 'next/server'
import { notFound } from 'next/navigation'
import { getStayForTicket } from '@/server/data/stays'
import { TicketReceipt } from '../receipt'
import { AutoPrint } from './auto-print'

export default async function TicketPage({ params, searchParams }: { params: Promise<{ stayId: string }>; searchParams: Promise<{ auto?: string }> }) {
  await connection()
  const { stayId } = await params
  const { auto } = await searchParams
  let data
  try { data = await getStayForTicket(BigInt(stayId)) } catch { notFound() }
  if (!data) notFound()
  return (
    <div className="ticket-page">
      {auto === '1' && <AutoPrint />}
      <TicketReceipt data={data} />
      <div className="ticket-actions">
        <button type="button" onClick={undefined} data-print className="ticket-print-btn">Imprimir</button>
      </div>
    </div>
  )
}
```

> The static `data-print` button is replaced by a real client print button in slice 2 (reprint + audit). For now it is inert; the auto flow prints via `AutoPrint`.

Create `src/app/ticket/[stayId]/auto-print.tsx`:

```tsx
'use client'
import { useEffect } from 'react'

export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [])
  return null
}
```

- [ ] **Step 3: Append print + ticket CSS**

Append to `src/app/globals.css`:

```css
/* ---- Thermal ticket (80mm) ---- */
.ticket-page { max-width: 80mm; margin: 0 auto; padding: 8px; }
.ticket { width: 80mm; font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 12px; line-height: 1.35; color: #000; background: #fff; padding: 6px 8px; }
.ticket .t-center { text-align: center; }
.ticket .t-bold { font-weight: 700; }
.ticket .t-small { font-size: 10px; }
.ticket .t-sep { border-top: 1px dashed #000; margin: 4px 0; }
.ticket .t-row { display: flex; justify-content: space-between; gap: 8px; }
.ticket .t-total { font-size: 14px; }
.ticket-actions { margin-top: 12px; text-align: center; }
.ticket-print-btn { border: 1px solid currentColor; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; }

@media print {
  @page { size: 80mm auto; margin: 0; }
  body { background: #fff; }
  body * { visibility: hidden; }
  #ticket, #ticket * { visibility: visible; }
  #ticket { position: absolute; left: 0; top: 0; width: 80mm; }
  .ticket-actions { display: none; }
}
```

- [ ] **Step 4: Hide the nav on `/ticket` (screen)**

Create `src/components/nav-gate.tsx`:

```tsx
'use client'
import { usePathname } from 'next/navigation'

export function NavGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname?.startsWith('/ticket')) return null
  return <>{children}</>
}
```

In `src/app/layout.tsx`, import it and wrap `AppNav`:

```tsx
import { NavGate } from '@/components/nav-gate'
```
```tsx
          <NavGate><AppNav /></NavGate>
```

- [ ] **Step 5: Run to verify it passes + build**

Run: `pnpm test tests/app/ticket-route.test.tsx` → PASS.
Run: `pnpm build` → succeeds and lists `/ticket/[stayId]`.
Run: `pnpm test` → all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/ticket src/app/globals.css src/components/nav-gate.tsx src/app/layout.tsx tests/app/ticket-route.test.tsx
git commit -m "feat(ticket): /ticket/[stayId] route + 80mm print CSS + nav gate"
```
