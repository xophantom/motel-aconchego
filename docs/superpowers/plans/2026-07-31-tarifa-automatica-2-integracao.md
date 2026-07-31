# Tarifa automática por data — Plano 2 (Integração) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o núcleo (Plano 1) na UI: check-in pré-marca a tabela sugerida pela data (editável) e `/tarifas` ganha um card pra o gerente configurar os dias especiais.

**Architecture:** O board (`quartos/page.tsx`, já dinâmico via `connection()`) calcula `resolveDay(hoje_SP, policy)` e passa `suggestedDay`/`suggestedReason` pelo `RoomGrid → RoomCard → FreeActions`, onde vira o `defaultValue` do seletor + rótulo do motivo. Em `/tarifas`, um `TariffPolicyForm` (checkboxes Seg–Dom) salva via `updateTariffPolicyAction`, com a lista de feriados nacionais do ano como referência.

**Tech Stack:** Next 16 (App Router, cacheComponents/PPR, server actions), React 19 (`useActionState`/`useFormStatus`), Prisma 7, Vitest (`react-dom/server` `renderToStaticMarkup`).

## Global Constraints

- **Depende do Plano 1** (mergeado): `@/lib/holidays`, `@/lib/tariff-day` (`resolveDay`, `dayReasonLabel`, `civilDateInSaoPaulo`, tipos `DayType`/`DayReason`), DAL `getTariffPolicy`/`updateTariffPolicy`, tabela `TariffPolicy`.
- **Prisma 7:** client de `@/generated/prisma/client`; DB `@/server/db`.
- **Tests:** `pnpm test` (banco de teste automático). Mock de `server-only` global. Para client components com hooks, renderizar como **JSX** (`<Comp .../>`), nunca chamando a função direto.
- **Mutations:** via Server Actions + Zod. RBAC: editar política = `tariff:manage` (sem ação nova).
- **Commits:** Conventional Commits. **Nunca** `Co-Authored-By`.
- **Copy PT-BR** com acentuação correta.

---

### Task 1: Action `updateTariffPolicyAction` + schema Zod

**Files:**
- Modify: `src/lib/validation/tariff.ts` (add schema)
- Modify: `src/app/tarifas/actions.ts` (add action + import)
- Test: `tests/app/tarifas-policy-action.test.ts`

**Interfaces:**
- Consumes: `updateTariffPolicy` (Plano 1, Task 5).
- Produces:
  - `tariffPolicySchema` (`{ specialWeekdays: number[] }`, cada item int 0–6).
  - `updateTariffPolicyAction(_prev: ActionState, fd: FormData): Promise<ActionState>` — lê `fd.getAll('weekday')`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/tarifas-policy-action.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const updateTariffPolicy = vi.hoisted(() => vi.fn(async (w: number[]) => ({ specialWeekdays: w })))
vi.mock('@/server/data/tariff', () => ({ updateTariffPolicy }))

import { updateTariffPolicyAction } from '@/app/tarifas/actions'

function fd(weekdays: string[]) {
  const f = new FormData()
  for (const w of weekdays) f.append('weekday', w)
  return f
}

beforeEach(() => { updateTariffPolicy.mockClear() })

describe('updateTariffPolicyAction', () => {
  it('parses checkbox weekdays and calls the DAL', async () => {
    const out = await updateTariffPolicyAction({ ok: false }, fd(['5', '6']))
    expect(updateTariffPolicy).toHaveBeenCalledWith([5, 6])
    expect(out).toEqual({ ok: true })
  })
  it('accepts an empty selection', async () => {
    const out = await updateTariffPolicyAction({ ok: false }, fd([]))
    expect(updateTariffPolicy).toHaveBeenCalledWith([])
    expect(out).toEqual({ ok: true })
  })
  it('rejects out-of-range weekday without calling the DAL', async () => {
    const out = await updateTariffPolicyAction({ ok: false }, fd(['9']))
    expect(updateTariffPolicy).not.toHaveBeenCalled()
    expect(out.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/app/tarifas-policy-action.test.ts`
Expected: FAIL — `updateTariffPolicyAction` não existe.

- [ ] **Step 3a: Add the schema** (append em `src/lib/validation/tariff.ts`)

```ts
export const tariffPolicySchema = z.object({
  specialWeekdays: z.array(z.coerce.number().int().min(0).max(6)),
})
export type TariffPolicyInput = z.infer<typeof tariffPolicySchema>
```

- [ ] **Step 3b: Add the action** em `src/app/tarifas/actions.ts`

Adicione o import (junto aos schemas já importados):
```ts
import { updateCategorySchema, updateRateSchema, tariffPolicySchema } from '@/lib/validation/tariff'
```
E a action (ao final do arquivo):
```ts
export async function updateTariffPolicyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = fd.getAll('weekday').map((v) => Number(v))
  const parsed = tariffPolicySchema.safeParse({ specialWeekdays: raw })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await tariff.updateTariffPolicy(parsed.data.specialWeekdays) }
  catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/tarifas')
  revalidatePath('/quartos')
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/app/tarifas-policy-action.test.ts`
Expected: PASS (3 casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/tariff.ts src/app/tarifas/actions.ts tests/app/tarifas-policy-action.test.ts
git commit -m "feat(tarifas): action updateTariffPolicyAction (checkboxes de dia especial)"
```

---

### Task 2: `TariffPolicyForm` + card em `/tarifas`

**Files:**
- Create: `src/app/tarifas/policy-form.tsx`
- Modify: `src/app/tarifas/page.tsx` (fetch policy/feriados + render do card)
- Test: `tests/app/tarifas-policy-form.test.tsx`

**Interfaces:**
- Consumes: `updateTariffPolicyAction` (Task 1); `getTariffPolicy` + `nationalHolidayList` + `civilDateInSaoPaulo` (Plano 1).
- Produces: `TariffPolicyForm({ specialWeekdays: number[]; year: number; holidays: { date: string; name: string }[] })`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/tarifas-policy-form.test.tsx
import { vi, describe, it, expect } from 'vitest'
vi.mock('@/app/tarifas/actions', () => ({ updateTariffPolicyAction: async () => ({ ok: false }) }))

import { renderToStaticMarkup } from 'react-dom/server'
import { TariffPolicyForm } from '@/app/tarifas/policy-form'

describe('TariffPolicyForm', () => {
  it('checks the configured weekdays and lists holidays', () => {
    const html = renderToStaticMarkup(
      <TariffPolicyForm specialWeekdays={[5, 6]} year={2026} holidays={[{ date: '09-07', name: 'Independência' }]} />,
    )
    expect(html).toMatch(/value="6"[^>]*checked|checked[^>]*value="6"/)
    expect(html).toMatch(/value="5"[^>]*checked|checked[^>]*value="5"/)
    expect(html).not.toMatch(/value="1"[^>]*checked|checked[^>]*value="1"/)
    expect(html).toContain('07/09 Independência')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/app/tarifas-policy-form.test.tsx`
Expected: FAIL — `policy-form` não existe.

- [ ] **Step 3a: Create the component** `src/app/tarifas/policy-form.tsx`

```tsx
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { updateTariffPolicyAction, type ActionState } from './actions'
import { Button } from '@/components/ui/button'

const WEEKDAYS: [number, string][] = [[0, 'Dom'], [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb']]

function Save() {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>
}

export function TariffPolicyForm({ specialWeekdays, year, holidays }: { specialWeekdays: number[]; year: number; holidays: { date: string; name: string }[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateTariffPolicyAction, { ok: false })
  const set = new Set(specialWeekdays)
  return (
    <div className="grid gap-3">
      <form action={formAction} className="grid gap-2">
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map(([n, label]) => (
            <label key={n} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="weekday" value={n} defaultChecked={set.has(n)} className="size-4" />
              {label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Save />
          {state.error && <span className="text-destructive text-xs">{state.error}</span>}
          {state.ok && <span className="text-xs text-[var(--room-free)]">✓ ok</span>}
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">Feriados nacionais {year}:</span>{' '}
        {holidays.map((h) => `${h.date.split('-').reverse().join('/')} ${h.name}`).join(' · ')}
      </p>
    </div>
  )
}
```

- [ ] **Step 3b: Wire the card into** `src/app/tarifas/page.tsx`

Imports (troque/adicione):
```ts
import { listCategoriesWithRates, getTariffPolicy } from '@/server/data/tariff'
import { nationalHolidayList } from '@/lib/holidays'
import { civilDateInSaoPaulo } from '@/lib/tariff-day'
import { TariffPolicyForm } from './policy-form'
```
Dentro de `TariffList`, depois do `try { cats = ... }`:
```ts
const policy = await getTariffPolicy()
const year = civilDateInSaoPaulo(new Date()).year
const holidays = nationalHolidayList(year)
```
E, no JSX, como **primeiro filho** do `<div className="grid gap-4">` (antes do `cats.map`):
```tsx
<Card>
  <CardHeader><CardTitle className="font-display">Política de dia especial</CardTitle></CardHeader>
  <CardContent>
    <TariffPolicyForm specialWeekdays={policy.specialWeekdays} year={year} holidays={holidays} />
  </CardContent>
</Card>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/app/tarifas-policy-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/tarifas/policy-form.tsx src/app/tarifas/page.tsx tests/app/tarifas-policy-form.test.tsx
git commit -m "feat(tarifas): card Política de dia especial em /tarifas"
```

---

### Task 3: Sugestão automática no check-in

**Files:**
- Modify: `src/app/quartos/page.tsx` (calcula e passa `suggestedDay`/`suggestedReason`)
- Modify: `src/app/quartos/room-grid.tsx` (props em `RoomGrid`/`RoomCard`/`FreeActions`; `defaultValue` do seletor + rótulo; **exporta** `FreeActions`)
- Test: `tests/app/quartos-suggested-day.test.tsx`

**Interfaces:**
- Consumes: `getTariffPolicy` (Plano 1); `resolveDay`, `civilDateInSaoPaulo`, `dayReasonLabel`, tipo `DayReason` (Plano 1).
- Produces: `RoomGrid` e `FreeActions` passam a receber `suggestedDay: 'normal' | 'special'` e `suggestedReason: DayReason`. `FreeActions` vira export.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/quartos-suggested-day.test.tsx
import { vi, describe, it, expect } from 'vitest'
// Actions puxam server-only/next-cache; stub o módulo inteiro (qualquer named export vira no-op).
vi.mock('@/app/quartos/actions', () => new Proxy({}, { get: () => async () => ({ ok: false }) }))

import { renderToStaticMarkup } from 'react-dom/server'
import { FreeActions } from '@/app/quartos/room-grid'

const room = {
  number: '01', status: 'free' as const, maintenanceReason: null, category: null,
  currentStay: null, pricing: null, consumption: [], loyalty: null, lastClosedStayId: null,
}

describe('FreeActions suggested tariff', () => {
  it('defaults the table select to the suggested day and shows the reason', () => {
    const html = renderToStaticMarkup(
      <FreeActions room={room as any} onDone={() => {}} suggestedDay="special" suggestedReason="holiday_eve" />,
    )
    expect(html).toMatch(/value="special"[^>]*selected|selected[^>]*value="special"/)
    expect(html).toContain('véspera de feriado')
  })

  it('defaults to Semana on a plain weekday', () => {
    const html = renderToStaticMarkup(
      <FreeActions room={room as any} onDone={() => {}} suggestedDay="normal" suggestedReason="weekday" />,
    )
    expect(html).toMatch(/value="normal"[^>]*selected|selected[^>]*value="normal"/)
    expect(html).toContain('dia de semana')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/app/quartos-suggested-day.test.tsx`
Expected: FAIL — `FreeActions` não é exportado / não aceita as props.

- [ ] **Step 3a: Thread props in** `src/app/quartos/room-grid.tsx`

Import (junto ao `computeStayAmount`):
```ts
import { dayReasonLabel, type DayReason } from '@/lib/tariff-day'
```
`RoomGrid` — assinatura e repasse:
```tsx
export function RoomGrid({ rooms, products, canCancel, suggestedDay, suggestedReason }: { rooms: Room[]; products: Product[]; canCancel: boolean; suggestedDay: 'normal' | 'special'; suggestedReason: DayReason }) {
```
```tsx
{rooms.map((r) => <RoomCard key={r.number} room={r} products={products} canCancel={canCancel} suggestedDay={suggestedDay} suggestedReason={suggestedReason} />)}
```
`RoomCard` — assinatura e repasse pro `FreeActions`:
```tsx
function RoomCard({ room, products, canCancel, suggestedDay, suggestedReason }: { room: Room; products: Product[]; canCancel: boolean; suggestedDay: 'normal' | 'special'; suggestedReason: DayReason }) {
```
```tsx
{room.status === 'free' && <FreeActions room={room} onDone={() => setOpen(false)} suggestedDay={suggestedDay} suggestedReason={suggestedReason} />}
```
`FreeActions` — exporte e use as props (troque `function FreeActions(...)` e o bloco do seletor "Tabela"):
```tsx
export function FreeActions({ room, onDone, suggestedDay, suggestedReason }: { room: Room; onDone: () => void; suggestedDay: 'normal' | 'special'; suggestedReason: DayReason }) {
```
```tsx
<div className="grid gap-1">
  <Label htmlFor="day">Tabela</Label>
  <NativeSelect id="day" name="day" defaultValue={suggestedDay}>
    <NativeSelectOption value="normal">Semana</NativeSelectOption>
    <NativeSelectOption value="special">Fim de semana</NativeSelectOption>
  </NativeSelect>
  <span className="text-[11px] text-muted-foreground">sugerido pela data: {dayReasonLabel(suggestedReason)}</span>
</div>
```

- [ ] **Step 3b: Compute and pass the suggestion in** `src/app/quartos/page.tsx`

Imports:
```ts
import { listCategoriesForBoard, getTariffPolicy } from '@/server/data/tariff'
import { resolveDay, civilDateInSaoPaulo } from '@/lib/tariff-day'
```
No `Board`, depois de `const canCancel = await canCancelNow()`:
```ts
const policy = await getTariffPolicy()
const suggested = resolveDay(civilDateInSaoPaulo(new Date()), policy.specialWeekdays)
```
E no return, passe as props:
```tsx
return <RoomGrid rooms={data} products={products.map((p) => ({ code: p.code, description: p.description, price: Number(p.price) }))} canCancel={canCancel} suggestedDay={suggested.day} suggestedReason={suggested.reason} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/app/quartos-suggested-day.test.tsx`
Expected: PASS (2 casos).
_Se o import do `room-grid` falhar por dependência de client-only no ambiente Node (ex.: Radix tocar `document` no load), reduza o teste para renderizar via um wrapper mínimo do seletor; o núcleo (`resolveDay`/`dayReasonLabel`) já está coberto no Plano 1 e a verificação visual final roda no passo 6._

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: tudo verde.

- [ ] **Step 6: Build (valida cacheComponents/PPR) e verificação visual**

Run: `pnpm build`
Expected: build OK (sem erro de dynamic/`connection()` — `quartos` e `tarifas` já chamam `connection()`).
Depois, suba o app (skill `run` / browser) e confirme: numa data-alvo, o check-in de um quarto livre vem com "Fim de semana" pré-marcado + rótulo do motivo; `/tarifas` mostra o card com os dias marcados e a lista de feriados.

- [ ] **Step 7: Commit**

```bash
git add src/app/quartos/page.tsx src/app/quartos/room-grid.tsx tests/app/quartos-suggested-day.test.tsx
git commit -m "feat(tarifas): check-in sugere a tabela pela data (editável)"
```

---

## Self-Review

- **Spec coverage:** action + Zod (Task 1) ✓; card `/tarifas` com checkboxes + lista de feriados (Task 2) ✓; sugestão no check-in editável + rótulo do motivo (Task 3) ✓; `revalidatePath('/quartos')` ao mudar política ✓; RBAC reusa `tariff:manage` (sem ação nova) ✓; TZ São Paulo via `civilDateInSaoPaulo(new Date())` após `connection()` ✓.
- **Placeholders:** nenhum — todo passo tem código real.
- **Type consistency:** `suggestedDay: 'normal' | 'special'` e `suggestedReason: DayReason` idênticos em `RoomGrid`/`RoomCard`/`FreeActions` e no `page.tsx`; `resolveDay` retorna `{day, reason}` casando com as props; `tariffPolicySchema` produz `specialWeekdays: number[]` igual ao parâmetro do DAL.
- **Riscos anotados:** render de client component em Node (Task 3 Step 4) tem fallback documentado; `new Date()` só é lido após `connection()` (dinâmico), respeitando cacheComponents.
```
