# Fechamento de turno — Plano 4 (UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformular a `/caixa` pro novo modelo (auto-abertura, retirada com método, fechar por retirada final, config do fundo) e adicionar os botões **"Caixa do turno"** e **"Fechar turno"** no painel de quartos.

**Architecture:** A `/caixa` passa a abrir o turno automaticamente ao visualizar (via `getOrOpenCurrentShift`), some o form de abertura manual, e ganha retirada com método + fechar por retirada final + card de config do fundo. O painel de quartos ganha dois atalhos. Verificação visual no navegador (skill `run`) — a maior parte é UI.

**Tech Stack:** Next 16 (Server Components + Actions), React 19 (`useActionState`/`useFormStatus`), Prisma 7, Vitest.

## Global Constraints

- **Depende dos Planos 1-3** (mergeados): `getOrOpenCurrentShift`, `shiftMetrics` estendido, `closeShift(input)`, `cashMovementAction`/`closeShiftAction`, `getCashPolicy`/`updateCashPolicy`, rota `/caixa/turno/[shiftId]`.
- **Remover** `openShift` (DAL), `openShiftAction`, `openShiftSchema`, `OpenShiftForm` — a abertura vira automática. Conferir que não sobra referência.
- Botões/telas de caixa guardados por `cash:manage` (recepção+gerente). Config do fundo: `finance:manage` (gerente).
- Copy PT-BR. Tests: `pnpm test`; `pnpm build`. Verificação visual: skill `run` (ajuste fino ao vivo). Commits: Conventional Commits, sem `Co-Authored-By`.

---

### Task 1: `/caixa` — auto-abertura na visão + remoção da abertura manual

**Files:**
- Modify: `src/server/data/shifts.ts` (`currentShiftSummary` auto-abre; remover `openShift`)
- Modify: `src/app/caixa/actions.ts` (remover `openShiftAction`)
- Modify: `src/lib/validation/shift.ts` (remover `openShiftSchema`)
- Test: `tests/server/data/shift-summary.test.ts`

**Interfaces:**
- Produces: `currentShiftSummary()` retorna `{ shift, movements, metrics, closed: boolean }` — auto-abre o turno do período; `closed:true` se o período já foi fechado.

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/data/shift-summary.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
const session = vi.hoisted(() => ({ current: { id: 1, name: 'R', role: 'reception' } as any }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { db } from '@/server/db'
import { currentShiftSummary } from '@/server/data/shifts'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'R', username: 'r', role: 'reception', passwordHash: 'x' } })
})

describe('currentShiftSummary', () => {
  it('auto-opens the current shift when viewing', async () => {
    const s = await currentShiftSummary()
    expect(s.shift).not.toBeNull()
    expect(s.closed).toBe(false)
    expect(s.metrics).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test — fails** (auto-abertura ainda não existe; `closed` não existe).

- [ ] **Step 3: Implement**

Em `src/server/data/shifts.ts`:
- **Remova** a função `openShift`.
- Reescreva `currentShiftSummary`:
```ts
export async function currentShiftSummary() {
  await requireCash()
  let shift
  try { shift = await getOrOpenCurrentShift() }
  catch (e) { if (e instanceof Error && /já fechado/i.test(e.message)) return { shift: null, movements: [], metrics: null as ShiftMetrics | null, closed: true }; throw e }
  const movements = await db.cashMovement.findMany({ where: { shiftId: shift.id }, orderBy: { occurredAt: 'desc' } })
  return { shift, movements, metrics: await shiftMetrics(shift), closed: false }
}
```
Em `src/app/caixa/actions.ts`: **remova** `openShiftAction` e o import de `openShiftSchema`.
Em `src/lib/validation/shift.ts`: **remova** `openShiftSchema`.

- [ ] **Step 4: Verify no dangling refs**

Run: `rg -n "openShift\b|openShiftAction|openShiftSchema|OpenShiftForm" /Users/leosperandio/Git/MotelAconchego/src`
Expected: só aparece em `caixa-forms.tsx`/`page.tsx` (tratados na Task 2). Se aparecer em outro lugar, ajuste.

- [ ] **Step 5: Run test — passes.** (`pnpm build` pode falhar aqui por causa do `OpenShiftForm` órfão — resolvido na Task 2; rode só `pnpm test`.)

- [ ] **Step 6: Commit**

```bash
git add src/server/data/shifts.ts src/app/caixa/actions.ts src/lib/validation/shift.ts tests/server/data/shift-summary.test.ts
git commit -m "feat(caixa): abertura automática do turno na visão; remove abertura manual"
```

---

### Task 2: `/caixa` — página e forms reformulados

**Files:**
- Modify: `src/app/caixa/caixa-forms.tsx` (retirada com método, fechar por retirada final; remover `OpenShiftForm`)
- Modify: `src/app/caixa/page.tsx` (métricas novas, sem abertura manual, card de config)
- Create: `src/app/caixa/policy-form.tsx` (config do fundo, gerente)
- Modify: `src/app/caixa/actions.ts` (add `updateCashPolicyAction`)

**Interfaces:**
- Consumes: `currentShiftSummary` (Task 1); `getCashPolicy`/`updateCashPolicy`; `cashMovementAction`/`closeShiftAction`.

- [ ] **Step 1: Forms** — reescreva `src/app/caixa/caixa-forms.tsx` (remova `OpenShiftForm`)

```tsx
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { closeShiftAction, cashMovementAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? '…' : children}</Button>
}

// Retirada com método (dinheiro/cartão); suprimento/correção sem método.
export function MovementForm({ type, label, canUse }: { type: 'withdrawal' | 'supply' | 'correction'; label: string; canUse: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(cashMovementAction, { ok: false })
  if (!canUse) return null
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="type" value={type} />
      {type === 'withdrawal' && (
        <div className="grid gap-1"><Label htmlFor="method">Método</Label>
          <NativeSelect id="method" name="method" defaultValue="cash" className="w-32">
            <NativeSelectOption value="cash">Dinheiro</NativeSelectOption>
            <NativeSelectOption value="card">Cartão</NativeSelectOption>
          </NativeSelect>
        </div>
      )}
      <div className="grid gap-1"><Label htmlFor={`amt-${type}`}>{label} (R$)</Label><Input id={`amt-${type}`} name="amount" type="number" step="0.01" className="w-28" /></div>
      <Input name="description" placeholder="motivo" className="w-40" />
      <Submit>{label}</Submit>
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  )
}

// Fechar turno: retirada final dinheiro/cartão → fecha e vai pro relatório (auto-print).
export function CloseShiftForm({ shiftId }: { shiftId: string }) {
  const action = closeShiftAction.bind(null, shiftId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  if (state.ok && typeof window !== 'undefined') window.location.href = `/caixa/turno/${shiftId}?auto=1`
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="finalWithdrawCash">Retirada dinheiro</Label><Input id="finalWithdrawCash" name="finalWithdrawCash" type="number" step="0.01" defaultValue="0" className="w-28" /></div>
      <div className="grid gap-1"><Label htmlFor="finalWithdrawCard">Retirada cartão</Label><Input id="finalWithdrawCard" name="finalWithdrawCard" type="number" step="0.01" defaultValue="0" className="w-28" /></div>
      <Submit>Fechar turno (imprime)</Submit>
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  )
}
```

- [ ] **Step 2: Config action** — em `src/app/caixa/actions.ts` add:

```ts
import { updateCashPolicy } from '@/server/data/cash-policy'
export async function updateCashPolicyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const v = Number(fd.get('expectedOpeningBalance') ?? 0)
  if (!Number.isFinite(v) || v < 0) return { ok: false, error: 'Valor inválido.' }
  try { await updateCashPolicy(v) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/caixa')
  return { ok: true }
}
```

- [ ] **Step 3: Config form** — `src/app/caixa/policy-form.tsx`:

```tsx
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { updateCashPolicyAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function CashPolicyForm({ value }: { value: number }) {
  const [state, action] = useActionState<ActionState, FormData>(updateCashPolicyAction, { ok: false })
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="grid gap-1"><Label htmlFor="expectedOpeningBalance">Fundo de caixa esperado (manhã)</Label><Input id="expectedOpeningBalance" name="expectedOpeningBalance" type="number" step="0.01" defaultValue={String(value)} className="w-32" /></div>
      <Button size="sm">Salvar</Button>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--room-free)]">✓ ok</span>}
    </form>
  )
}
```

- [ ] **Step 4: Page** — em `src/app/caixa/page.tsx`:
  - Import `getCashPolicy` (de `@/server/data/cash-policy`), `CashPolicyForm`, e `getCurrentUser`.
  - Trocar a lógica: `summary = await currentShiftSummary()`. Se `summary.closed` → mostrar card "Turno fechado — aguardando o próximo período" + `ClosedHistory`. Senão, mostrar as métricas (adicionar **Retirado dinheiro**, **Retirado cartão** e, se `m.openingDifference !== 0`, um aviso de diferença), a lista de movimentos, os `MovementForm` (retirada/suprimento/correção) e o `CloseShiftForm`.
  - Remover o bloco `!summary.shift → OpenShiftForm` e o import de `OpenShiftForm`.
  - Adicionar um `<Card>` "Fundo de caixa" com `<CashPolicyForm value={(await getCashPolicy()).expectedOpeningBalance} />`, visível só pra gerente (`me?.role === 'manager'`).

- [ ] **Step 5: Verify** — `pnpm test` (full) verde + `pnpm build` OK (sem `OpenShiftForm` órfão).

- [ ] **Step 6: Commit**

```bash
git add src/app/caixa
git commit -m "feat(caixa): /caixa reformulada (retirada com método, fechar por retirada final, fundo)"
```

---

### Task 3: Botões "Caixa do turno" e "Fechar turno" no painel

**Files:**
- Modify: `src/app/quartos/page.tsx` (buscar o turno atual + passar id/permissão)
- Modify: `src/app/quartos/room-grid.tsx` (botões no topo do painel + dialog de fechar)
- Test: `tests/app/quartos-caixa-buttons.test.tsx`

**Interfaces:**
- Consumes: `getOrOpenCurrentShift` (id do turno); `closeShiftAction` (via form); a rota `/caixa/turno/[shiftId]`.

- [ ] **Step 1: Página passa o turno atual**

Em `src/app/quartos/page.tsx`, no `Board`, após os fetches: resolver o turno atual e a permissão de caixa e passar pro `RoomGrid`:
```ts
import { getOrOpenCurrentShift } from '@/server/data/shifts'
// ...
let currentShiftId: string | null = null
try { currentShiftId = String((await getOrOpenCurrentShift()).id) } catch { currentShiftId = null }
const canCash = me?.role === 'manager' || me?.role === 'reception'
```
E passe `currentShiftId={currentShiftId}` e `canCash={canCash}` pro `<RoomGrid …>`.

- [ ] **Step 2: `RoomGrid` — botões + dialog** (em `src/app/quartos/room-grid.tsx`)

- `RoomGrid` ganha props `currentShiftId: string | null` e `canCash: boolean`.
- No header do grid (perto do `<VendaAvulsa />`), quando `canCash && currentShiftId`, renderizar:
  - **"Caixa do turno"**: `<Button asChild variant="outline"><a href={\`/caixa/turno/${currentShiftId}\`}>Caixa do turno</a></Button>`.
  - **"Fechar turno"**: um `<CloseTurnoButton shiftId={currentShiftId} />` (novo componente client abaixo) — abre um `Dialog` com os campos de retirada final (dinheiro/cartão) e um submit que chama `closeShiftAction` e, no sucesso, redireciona pra `/caixa/turno/${shiftId}?auto=1`.
- Novo componente client (no mesmo arquivo ou `src/app/quartos/close-turno.tsx`):
```tsx
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { closeShiftAction, type ActionState } from '@/app/caixa/actions'

export function CloseTurnoButton({ shiftId }: { shiftId: string }) {
  const action = closeShiftAction.bind(null, shiftId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  if (state.ok && typeof window !== 'undefined') window.location.href = `/caixa/turno/${shiftId}?auto=1`
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Fechar turno</Button></DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Fechar turno</DialogTitle></DialogHeader>
        <form action={formAction} className="grid gap-3">
          <div className="grid gap-1"><Label htmlFor="fwc">Retirada em dinheiro (R$)</Label><Input id="fwc" name="finalWithdrawCash" type="number" step="0.01" defaultValue="0" /></div>
          <div className="grid gap-1"><Label htmlFor="fwd">Retirada em cartão (R$)</Label><Input id="fwd" name="finalWithdrawCard" type="number" step="0.01" defaultValue="0" /></div>
          <Button className="w-full">Confirmar e fechar (imprime)</Button>
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}
```
Importar/usar `CloseTurnoButton` no header do `RoomGrid`.

- [ ] **Step 3: Test** (dado o env `node`, testar o componente por dados/marcação leve)

```tsx
// tests/app/quartos-caixa-buttons.test.tsx
import { vi, describe, it, expect } from 'vitest'
vi.mock('@/app/caixa/actions', () => ({ closeShiftAction: () => async () => ({ ok: false }) }))
import { renderToStaticMarkup } from 'react-dom/server'
import { CloseTurnoButton } from '@/app/quartos/close-turno'

describe('CloseTurnoButton', () => {
  it('renders the trigger', () => {
    const html = renderToStaticMarkup(<CloseTurnoButton shiftId="7" />)
    expect(html).toContain('Fechar turno')
  })
})
```
_(Se o `Dialog`/Radix não renderizar em Node, o teste pode falhar no import — nesse caso reduza para um teste de fumaça do texto do trigger via um wrapper mínimo, ou confie no build + verificação visual; documente no relatório.)_

- [ ] **Step 4: Verify** — `pnpm test` (full) verde + `pnpm build` OK.

- [ ] **Step 5: Verificação visual (interativo, pós-implementação)**

Subir o app (skill `run`), logar, e conferir: painel mostra "Caixa do turno" (abre o relatório 80mm) e "Fechar turno" (dialog → retirada → fecha → imprime). `/caixa` sem abertura manual, com retirada dinheiro/cartão, aviso de diferença e card do fundo (gerente). Ajustar ao vivo se precisar.

- [ ] **Step 6: Commit**

```bash
git add src/app/quartos tests/app/quartos-caixa-buttons.test.tsx
git commit -m "feat(caixa): botões Caixa do turno + Fechar turno no painel de quartos"
```

---

## Self-Review
- **Spec coverage:** `/caixa` reformulada (auto-abertura, retirada com método, fechar por retirada final, config do fundo) ✓; botões no painel ✓; abertura manual removida ✓.
- **Placeholders:** nenhum — código real; a nota de fallback do teste do Dialog é um plano-B explícito, não um TODO de código.
- **Type consistency:** `currentShiftSummary` retorna `closed`; `CloseShiftForm`/`CloseTurnoButton` mandam `finalWithdrawCash`/`finalWithdrawCard` (casam com `closeShiftSchema`); `MovementForm` manda `method`.
- **Ordem:** Task 1 remove a abertura manual do DAL/action/validação mas o build só volta 100% verde na Task 2 (quando o `OpenShiftForm` sai do `page.tsx`) — por isso a Task 1 roda só `pnpm test`, e a Task 2 roda `pnpm build`.
