# Ticket térmico 2 — Disparo na saída + Reimpressão + Auditoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the 80mm ticket automatically after a check-out (with a fallback link if the popup is blocked), and make the ticket page's "Imprimir" button a real reprint that logs a `ticket.reprint` audit event.

**Architecture:** A `logTicketReprintAction` server action logs the reprint (gated via `getStayForTicket`/`stay:manage`). The ticket page swaps its inert print button for a client `PrintButton` that logs (when not auto) then prints. The room modal's `CheckOut` opens `/ticket/<stayId>?auto=1` on success. Slice 2 of 2 (spec `docs/superpowers/specs/2026-07-03-ticket-termico-design.md`); depends on slice 1.

**Tech Stack:** Next.js 16 (server actions, client components), Vitest.

## Global Constraints

- **Audit:** reprint calls `logEvent('ticket.reprint', …)`; the auto-print on check-out does NOT log a reprint (it is the first print).
- **RBAC:** `logTicketReprintAction` enforces `stay:manage` by going through `getStayForTicket`.
- **Popup fallback:** if `window.open` returns null (blocked), the modal stays open and shows a visible "Imprimir ticket" link.
- **Tests:** `pnpm test`. Mock `server-only` + `@/server/session`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.

---

### Task 1: `logTicketReprintAction` + `PrintButton`

**Files:**
- Create: `src/app/ticket/actions.ts`
- Create: `src/app/ticket/[stayId]/print-button.tsx`
- Modify: `src/app/ticket/[stayId]/page.tsx` (use `PrintButton`)
- Test: `tests/app/ticket-reprint.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // actions.ts
  export type ActionState = { ok: boolean; error?: string }
  export async function logTicketReprintAction(stayId: string): Promise<ActionState>
  // print-button.tsx ('use client')
  export function PrintButton({ stayId, logReprint }: { stayId: string; logReprint: boolean }): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/app/ticket-reprint.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { logTicketReprintAction } from '@/app/ticket/actions'

let stayId: bigint
beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.loyaltyRedemption.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '07', status: 'cleaning', categoryId: cat.id } })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '07', categoryId: cat.id, checkIn: new Date(2026, 6, 4, 20), checkOut: new Date(2026, 6, 4, 23), status: 'closed', day: 'normal', guests: 2, stayAmount: 90, consumptionAmount: 0, prepaidAmount: 0, discountPercent: 0, entryEmployeeId: 1, paymentEmployeeId: 1 } })
  stayId = stay.id
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('logTicketReprintAction', () => {
  it('logs a ticket.reprint event for a permitted user', async () => {
    const r = await logTicketReprintAction(String(stayId))
    expect(r.ok).toBe(true)
    const ev = await db.eventLog.findMany({ where: { type: 'ticket.reprint' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].entityId).toBe(String(stayId))
    expect(ev[0].roomNumber).toBe('07')
  })

  it('is forbidden for housekeeper (no event written)', async () => {
    session.current = { id: 1, name: 'H', role: 'housekeeper' }
    const r = await logTicketReprintAction(String(stayId))
    expect(r.ok).toBe(false)
    expect(await db.eventLog.count({ where: { type: 'ticket.reprint' } })).toBe(0)
  })
})
```

Run: `pnpm test tests/app/ticket-reprint.test.ts` → FAIL.

- [ ] **Step 2: Write the action**

Create `src/app/ticket/actions.ts`:

```ts
'use server'
import { getStayForTicket } from '@/server/data/stays'
import { logEvent } from '@/server/audit'

export type ActionState = { ok: boolean; error?: string }

export async function logTicketReprintAction(stayId: string): Promise<ActionState> {
  let data
  try { data = await getStayForTicket(BigInt(stayId)) }
  catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro.' } }
  if (!data) return { ok: false, error: 'Estadia não encontrada.' }
  await logEvent({ type: 'ticket.reprint', description: `Reimpressão ticket quarto ${data.roomNumber ?? '—'} · estadia #${stayId}`, entity: 'stay', entityId: stayId, roomNumber: data.roomNumber })
  return { ok: true }
}
```

- [ ] **Step 3: Write the `PrintButton` + wire the page**

Create `src/app/ticket/[stayId]/print-button.tsx`:

```tsx
'use client'
import { logTicketReprintAction } from '../actions'

export function PrintButton({ stayId, logReprint }: { stayId: string; logReprint: boolean }) {
  return (
    <button
      type="button"
      className="ticket-print-btn"
      onClick={async () => { if (logReprint) await logTicketReprintAction(stayId); window.print() }}
    >
      Imprimir
    </button>
  )
}
```

In `src/app/ticket/[stayId]/page.tsx`, replace the inert button block with the real one — import it and render `logReprint={auto !== '1'}`:

```tsx
import { PrintButton } from './print-button'
```
```tsx
      <div className="ticket-actions">
        <PrintButton stayId={data.id} logReprint={auto !== '1'} />
      </div>
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/app/ticket-reprint.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/ticket/actions.ts src/app/ticket/[stayId]/print-button.tsx src/app/ticket/[stayId]/page.tsx tests/app/ticket-reprint.test.ts
git commit -m "feat(ticket): reprint button + logTicketReprintAction audit"
```

---

### Task 2: Open the ticket on check-out (popup + fallback)

**Files:**
- Modify: `src/app/quartos/room-grid.tsx` (`CheckOut` component + its call site)

**Interfaces:**
- Consumes: existing `checkOutAction`; the `/ticket/[stayId]?auto=1` route.
- Produces: after a successful check-out, `CheckOut` opens the ticket in a small popup and closes the modal; if the popup is blocked, the modal stays open showing a visible "Imprimir ticket" link.

- [ ] **Step 1: Pass `stayId` to `CheckOut`**

In `src/app/quartos/room-grid.tsx`, `OccupiedPanel` already has `const stay = room.currentStay!`. Change its `CheckOut` call site to pass the id:

```tsx
      <CheckOut roomNumber={room.number} stayId={stay.id} onDone={onDone} />
```

- [ ] **Step 2: Replace the `CheckOut` component**

Replace the whole `CheckOut` function with:

```tsx
function CheckOut({ roomNumber, stayId, onDone }: { roomNumber: string; stayId: string; onDone: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(async () => checkOutAction(roomNumber), { ok: false })
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    if (!state.ok) return
    const w = window.open(`/ticket/${stayId}?auto=1`, 'ticket', 'width=380,height=640')
    if (w) onDone()
    else setBlocked(true)
  }, [state.ok, stayId, onDone])
  return (
    <form action={formAction} className="grid gap-2">
      <Submit className="w-full">Confirmar saída</Submit>
      {state.error && <p className="mt-1 text-destructive text-sm">{state.error}</p>}
      {blocked && (
        <a href={`/ticket/${stayId}?auto=1`} target="_blank" rel="noopener" className="text-center text-sm font-medium text-primary underline">
          Imprimir ticket
        </a>
      )}
    </form>
  )
}
```

(`useState`, `useEffect`, `useActionState` are already imported at the top of the file.)

- [ ] **Step 3: Build + full suite**

Run: `pnpm build` → succeeds.
Run: `pnpm test` → all PASS.

- [ ] **Step 4: Manual smoke (recommended)**

`pnpm dev`, login, check out an occupied room → a small window opens at `/ticket/<id>?auto=1` and the browser print dialog appears; the room modal closes. Block popups → the modal shows "Imprimir ticket". Visit `/ticket/<id>` directly → the receipt shows isolated (no nav); click "Imprimir" → a `ticket.reprint` event appears in `/auditoria`.

- [ ] **Step 5: Commit**

```bash
git add src/app/quartos/room-grid.tsx
git commit -m "feat(ticket): open 80mm ticket on check-out (popup + fallback link)"
```
