# Spec — Cancelar entrada / cancelar saída

Data: 2026-07-03 · Status: aprovado p/ planejamento

## Contexto
O legado tinha `Frm1CEntrada` (cancelar entrada) e `Frm1CSaida` (cancelar saída) — desfazer um
check-in feito por engano e reabrir uma estadia fechada por engano. Hoje o app novo só tem check-in e
check-out, sem desfazer. Esta fatia adiciona os dois cancelamentos, revertendo o dinheiro corretamente
e deixando trilha de auditoria.

`StayStatus` já tem o valor `canceled`. Check-in cria um `cash_movement type=stay` (antecipado);
check-out cria o `cash_movement type=stay` (saldo). Consumo em quarto é liquidado no saldo do checkout.

## Decisões (travadas)
- **Cancelar entrada:** a estadia vira `canceled`, o quarto volta a **livre**, e o antecipado é
  **estornado** (movimento de caixa oposto). Só permitido se a estadia está `open` (ainda não saiu).
- **Cancelar saída:** a estadia fechada **reabre** (`status=open`, `checkOut=null`, `stayAmount=null`),
  o quarto volta a **ocupado**, e o saldo cobrado no checkout é **estornado**. Só a **última** saída
  do quarto (a estadia que está fechada mais recente e cujo quarto não foi reocupado).
- **Autorização:** **Gerente** cancela sempre. **Recepção** só enquanto o **turno/caixa atual está
  aberto** — o cancelamento reverte movimentos naquele turno; caixa fechado só o gerente mexe.
  Nova ação `stay:cancel` (recepção + gerente); a **janela** (turno aberto) é regra na DAL para
  não-gerente.
- **Estorno, não deleção:** reverter dinheiro cria `cash_movement` de **sinal oposto** (mesmo `type`),
  `description="estorno · cancelamento"`, ligado à mesma `stay` e ao **turno corrente**. Nada é
  apagado — as métricas de caixa se anulam e a auditoria fica íntegra.
- **Motivo obrigatório** no cancelamento (texto curto) — vai pro `description` do evento e do estorno.
- Emite auditoria (`stay.cancel_checkin`, `stay.cancel_checkout`) via `logEvent`.

## Modelo (Prisma)
- `Stay`: adicionar `canceledAt DateTime? @db.Timestamptz @map("canceled_at")`,
  `canceledReason String? @map("canceled_reason")`, `canceledById Int? @map("canceled_by_id")`
  (relação opcional `Employee`). Sem novo enum (usa `status=canceled`).
- Migração Prisma.

## DAL — `src/server/data/stays.ts` (adiciona 2 funções, `server-only`)
- `cancelCheckIn(roomNumber, reason)` — **stay:cancel** + janela:
  - Carrega o quarto e a estadia aberta. Erros claros: `not occupied` (sem estadia aberta).
  - Autz de janela: se o operador não é gerente e o turno atual está fechado → `Forbidden` (`shift closed`).
  - Numa transação: cria estornos dos `cash_movement type=stay` da estadia (antecipado); marca
    `stay` `canceled` (+ `canceledAt/Reason/ById`); zera `room.currentStayId` e `room.status='free'`.
  - `logEvent('stay.cancel_checkin', …)`. Retorna void.
- `cancelCheckOut(roomNumber, reason)` — **stay:cancel** + janela:
  - Acha a estadia `closed` mais recente do quarto **cujo quarto ainda está livre/limpeza** (não
    reocupado). Erros: `no closed stay` / `room reoccupied`.
  - Autz de janela igual acima.
  - Transação: estorna os `cash_movement` do checkout (o `type=stay` de saldo criado na saída);
    reabre a estadia (`status=open`, `checkOut=null`, `stayAmount=null`, mantém consumo e antecipado);
    `room.status='occupied'`, `room.currentStayId=stay.id`.
  - `logEvent('stay.cancel_checkout', …)`.
- Helper interno `isCurrentShiftOpen()` (reusa `shifts` DAL) e `reverseStayMovements(tx, stayId, kinds)`.

## Server Actions — `src/app/quartos/actions.ts` (adiciona 2)
- `cancelCheckInAction(roomNumber, reason)` e `cancelCheckOutAction(roomNumber, reason)` — padrão
  `ActionState`, `mapErr` ganha casos (`shift closed`→"Caixa fechado — só o gerente cancela.",
  `room reoccupied`→"Quarto já foi reocupado.", `no closed stay`→"Nada a cancelar."),
  `revalidatePath('/quartos')`.

## UI — modal do quarto (`room-grid.tsx`)
- **Quarto ocupado:** no fim do painel, um botão discreto **"Cancelar entrada"** (variant destructive
  outline) que abre um mini-form pedindo o motivo → confirma. Some pra recepção se o caixa está fechado
  (o server valida de qualquer jeito).
- **Quarto livre/limpeza que acabou de ter saída:** ação **"Cancelar última saída"** (mesmo mini-form
  com motivo). Aparece só quando há estadia fechada reabrível naquele quarto (o board já sabe via DAL:
  incluir um flag `lastClosedStayId` por quarto na query do board).
- Confirmação clara ("Isto desfaz o check-in e estorna o antecipado.").

## RBAC
Nova ação `stay:cancel` (`reception` + `manager`). Janela de turno aberto aplicada na DAL p/ recepção.

## Dados pro board
`listRoomsWithCurrentStay` passa a incluir, para quartos não-ocupados, o id da última estadia
`closed` reabrível (`lastClosedStayId` + se o operador pode). O client usa isso pra mostrar a ação.

## Testes
- `cancelCheckIn`: estadia vira `canceled`, quarto livre, antecipado estornado (soma dos movimentos
  `stay` da estadia = 0); recusa se não há estadia aberta.
- `cancelCheckOut`: reabre estadia (open, checkOut null), quarto ocupado, saldo do checkout estornado;
  recusa se o quarto foi reocupado / não há estadia fechada.
- Janela: recepção com caixa fechado → Forbidden nos dois; gerente passa; recepção com caixa aberto passa.
- Auditoria: cada cancelamento gera `EventLog` com motivo.
- Actions: integração (Zod motivo obrigatório, `mapErr`).

## Não-objetivos
Cancelar estadia antiga arbitrária (só a última reabrível) · edição de valores de uma estadia ·
cancelamento parcial · reverter consumo item-a-item (já existe "remover consumo") · desfazer
movimentos de caixa avulsos.

## Decomposição (→ 2 planos)
1. Migração (`canceled*`) + DAL `cancelCheckIn`/`cancelCheckOut` + estorno + janela + auditoria + testes.
2. Board flag `lastClosedStayId` + actions + UI no modal (mini-form de motivo) + RBAC `stay:cancel` + testes.

## Pontos confirmados
- Gerente sempre; recepção só turno aberto. Estorno (não deleção). Motivo obrigatório. Só a última saída.
