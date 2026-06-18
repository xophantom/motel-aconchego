# Spec — Caixa (fechamento por turno, sangria, métricas)

Data: 2026-06-18 · Status: aprovado p/ planejamento

## Contexto
Terceira fatia do MotelAconchego. Automatiza o caixa: abertura/fechamento por turno, sangria/
suprimento/correção, e métricas por turno. A fatia anterior (núcleo operacional) já grava
`cash_movement` no check-in (antecipado) e checkout (saldo) com `employeeId`; o `shiftId` fica nulo.
Esta fatia liga os movimentos ao turno e fecha o caixa. Tabelas `shift` e `cash_movement` já existem.

## Decisões (travadas)
- **1 caixa por período** (mesa): `period` = `day_07_19` (07–19) | `night_19_07` (19–07); unique
  `(businessDate, period)` (já no schema). Operador gravado por movimento.
- **Não bloqueia**: pagamento sem caixa aberto grava `shiftId = null` (fora de turno).
- **Escopo completo**: abrir/fechar + sangria + suprimento + correção.
- **nº aptos = pelo checkout**: estadia conta no turno em que o `checkOut` ocorreu.
- **Correção = só gerente**; abrir/fechar/sangria/suprimento = recepção+gerente.

## Helper de período — `src/lib/shift.ts` (PURO, TDD)
```ts
export type ShiftPeriod = 'day_07_19' | 'night_19_07'
export function currentPeriod(d: Date): ShiftPeriod   // 7 <= hour < 19 -> day, senão night
export function businessDateFor(d: Date): Date         // data (00:00 local) do turno:
//   day  -> a própria data
//   night com hour < 7 -> data do dia ANTERIOR (turno abriu às 19h de ontem)
//   night com hour >= 19 -> a própria data
```
Retorna `Date` truncada em meia-noite local. Pura, sem efeitos.

## DAL — `src/server/data/shifts.ts` (`server-only`, authz dentro)
- `getOpenShiftFor(now: Date)` — shift do período atual (`businessDateFor`+`currentPeriod`) com
  `closedAt = null`, ou `null`. Sem authz extra (leitura usada internamente).
- `openShift(input: { openingBalance: number })` — **cash:manage**. Resolve período/businessDate de
  `now`. Se já existe shift nesse `(businessDate, period)`: aberto → erro "caixa já aberto"; fechado →
  erro "caixa já fechado neste período". Cria `shift` (employeeId=me, openedAt=now, openingBalance).
- `closeShift(shiftId, input: { closingBalance: number })` — **cash:manage**. Exige aberto. Seta
  `closedAt=now`, `closingBalance`. Retorna as métricas (abaixo).
- `addCashMovement(input: { type: 'withdrawal'|'supply'|'correction', amount: number, description?: string })`
  — sangria/suprimento/correção. Authz: `withdrawal`/`supply` = **cash:manage**; `correction` = **manager**.
  Sinal: `withdrawal` armazenado negativo (`-abs`), `supply` positivo (`+abs`), `correction` como vier
  (±). Anexa ao caixa aberto (`shiftId = getOpenShiftFor(now)?.id ?? null`), `employeeId=me`.
- `currentShiftSummary()` — **cash:manage**. `{ shift, movements, metrics }` do caixa aberto (ou
  `{ shift: null }`).
- `listClosedShifts(limit=30)` — **cash:manage**. Turnos fechados recentes + métricas.

### Métricas de um turno (`shiftMetrics(shift)`)
- `nAptos` = `COUNT(stay WHERE status='closed' AND checkOut BETWEEN shift.openedAt AND COALESCE(shift.closedAt, now()))`
  **e** mesma `period`/`businessDate` (via janela de tempo do turno). (Conta pelo checkout.)
- `totalEstadias` = Σ `cash_movement.amount` tipo `stay` com `shiftId = shift.id`.
- `totalConsumo` = Σ tipo `consumption` (0 por enquanto — fatia futura).
- `totalSangrias` = Σ tipo `withdrawal`; `totalSuprimentos` = Σ `supply`; `totalCorrecoes` = Σ `correction`.
- `ticketMedio` = `nAptos > 0 ? totalEstadias / nAptos : 0`.
- `saldo` = `openingBalance + Σ(amount de todos os tipos com shiftId=shift.id)`.

## Mudança no DAL existente — `src/server/data/stays.ts`
`checkIn` e `checkOut` passam a setar `shiftId` nos `cash_movement` que criam:
`shiftId = (await getOpenShiftFor(new Date()))?.id ?? null`. Não bloqueia se não houver caixa aberto.

## RBAC — `src/lib/rbac.ts`
Adicionar `Action` `'cash:manage'`: manager + reception. (`correction` é checado à parte por
`role === 'manager'` dentro de `addCashMovement`.)

## Server Actions — `src/app/caixa/actions.ts`
`openShiftAction`, `closeShiftAction`, `cashMovementAction` — Zod, chamam DAL, `revalidatePath('/caixa')`.

## Página — `src/app/caixa/page.tsx` (server, Suspense+`connection()`, gate via DAL `Forbidden`→`redirect('/')`)
- Caixa fechado → form **Abrir caixa** (saldo inicial).
- Caixa aberto → cartões de métricas (nº aptos, ticket médio, total estadias, sangrias, suprimentos,
  saldo) + tabela de movimentos + botões **Sangria / Suprimento / Correção**(gerente) / **Fechar
  caixa** (saldo final). Componentes client com `useActionState`.
- Seção **Histórico** (turnos fechados + métricas).
- Link `Caixa` na nav da home (recepção+gerente).

## Testes
- `shift.ts` (puro, TDD): `currentPeriod` (bordas 06:59/07:00/18:59/19:00), `businessDateFor`
  (00–07 noturno → dia anterior; 19–24 noturno → hoje; dia → hoje).
- `shifts` DAL: open (cria; rejeita duplo-open; rejeita reabrir fechado); close (métricas corretas);
  addCashMovement (sinais; correção só gerente; anexa shiftId; sangria recepção ok); métricas
  (nAptos pelo checkout na janela; totais; ticket médio; saldo); authz (housekeeper bloqueado).
- `stays` DAL: check-in/out anexam `shiftId` quando há caixa aberto; nulo quando não há.
- actions: integração (Zod, revalidate mockado).
- build + (smoke `/caixa`).

## Decomposição (ordem → 3 planos)
1. Helper de período (puro, TDD).
2. RBAC `cash:manage` + shifts DAL (open/close/addMovement/metrics/summary) + setar `shiftId` no stays DAL.
3. Caixa actions + `/caixa` + nav.

## Pontos confirmados
- nº aptos atribuído pelo **checkout** (janela do turno).
- Correção **só gerente**.
- Movimentos fora de turno (sem caixa aberto) ficam `shiftId=null` — não entram em nenhuma métrica de turno até reconciliação futura (fora de escopo).
