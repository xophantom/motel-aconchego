# Spec — Log / Auditoria

Data: 2026-07-03 · Status: aprovado p/ planejamento

## Contexto
O legado tinha `Frm7Log` — trilha de eventos por operador. O model `EventLog` já existe no schema
(`occurredAt`, `type`, `description`, `employeeId`, `roomNumber`, `legacySeq`) mas **nunca é gravado**
e não tem tela. Esta fatia é a **fundação de auditoria**: um helper `logEvent()` chamado em toda
mutação-chave (carimbo de operador + timestamp) e uma tela de consulta para o gerente.

É a **primeira fatia** do lote pendente — as demais (financeiro, cancelamento, ticket, reposição)
emitem eventos por cima desta fundação.

## Decisões (travadas)
- **Abrangência: tudo.** Toda mutação relevante grava um evento: check-in, check-out, cancelamento de
  entrada/saída, movimentos de caixa (sangria/suprimento/correção/estorno), abrir/fechar turno,
  mudança de status de quarto, e edições de configuração (tarifa, produto, usuário, faixa de
  fidelidade, reposição de estoque, lançamento financeiro).
- **Gravação é efeito colateral, não tem RBAC** — qualquer operação autenticada que muta grava.
- **Tela `/auditoria`** só para **gerente** (nova ação RBAC `audit:view`).
- **Nunca falhar a operação por causa do log.** Se `logEvent` der erro, engole (best-effort) — o log é
  observabilidade, não pode derrubar um check-out.

## Modelo (Prisma)
`EventLog` já existe. Ajustes:
- Adicionar `entity String?` e `entityId String?` (ex.: `entity='stay'`, `entityId='1532'`) para
  filtrar/navegar. Manter `type` como verbo curto namespaced (`stay.checkin`, `cash.withdrawal`,
  `room.status`, `tariff.update`, `stay.cancel_checkin`, …).
- `occurredAt` default `now()`. `description` = frase legível em PT (o que apareceu pro humano).
- Migração Prisma (só adiciona 2 colunas nullable — sem backfill).

## Helper — `src/server/audit.ts` (`server-only`)
```ts
type LogInput = {
  type: string            // 'stay.checkin'
  description: string      // 'Entrada quarto 07 · placa ABC1D23'
  entity?: string; entityId?: string
  roomNumber?: string | null
}
export async function logEvent(input: LogInput): Promise<void>
```
- Lê o operador via `getCurrentUser()` (grava `employeeId`; se null, grava sem operador — ex.: job).
- `try/catch` interno best-effort. Não recebe `db` de fora; usa o singleton `@/server/db`.
- Chamado **de dentro das funções de DAL/actions** já existentes (não é um middleware mágico).

## Pontos de instrumentação (retrofit das mutações existentes)
Cada uma ganha uma chamada `logEvent` no fim do caminho feliz:
- `stays.checkIn` → `stay.checkin`; `stays.checkOut` → `stay.checkout`.
- `rooms.setRoomStatus` → `room.status` (com o novo status na descrição).
- `shifts.openShift`/`closeShift` → `shift.open`/`shift.close`.
- `shifts`/caixa movement (sangria/suprimento/correção) → `cash.<tipo>`.
- `consumption.addConsumption`/`removeConsumption`/`walkinSale` → `consumption.*`.
- `tariff` upsert/rate → `tariff.update`; `products.saveProduct` → `product.update`;
  `employees` create/update/reset → `user.*`; `loyalty` upsertTier/deleteTier → `loyalty.tier.*`.
- Fatias futuras (financeiro, cancelamento, ticket-reprint, reposição) já nascem chamando `logEvent`.

## DAL de leitura — `src/server/data/audit.ts` (`server-only`)
- `listEvents(filter)` — **audit:view** (gerente). `filter = { from?, to?, type?, employeeId?, q?, take?, skip? }`.
  Retorna eventos ordenados desc por `occurredAt`, com o nome do operador (join `employee`), paginado
  (default 100). `q` filtra por `description` (contains, case-insensitive).
- `listEventTypes()` — distinct de `type` presentes (pra popular o filtro). **audit:view**.

## UI — `/auditoria` (gerente)
- `PageHeader` "Auditoria" + subtítulo "Trilha de eventos por operador."
- Filtros (form GET, server-side): período (de/até, default hoje), tipo (select), operador (select),
  busca livre. Tabela: Hora · Operador · Tipo (badge PT) · Descrição · Quarto.
- Paginação simples (próxima/anterior via `skip`).
- Nav: link **Auditoria** (gerente).
- Sem CSV/PDF nesta fatia (YAGNI; adiciona depois se pedirem).

## RBAC
Nova ação `audit:view` (só `manager`). Gravar log não tem gate.

## Testes
- `logEvent` grava com operador da sessão; sem sessão grava `employeeId=null`; erro interno não
  propaga (mockar `db` pra throw → `logEvent` resolve sem lançar).
- Retrofit: `checkIn`/`checkOut`/`setRoomStatus` criam 1 `EventLog` com `type` e `entity` corretos.
- `listEvents` respeita `audit:view` (recepção → Forbidden); filtra por período/tipo/operador/q;
  ordena desc; pagina.
- Build + smoke da tela.

## Não-objetivos
Diff campo-a-campo (before/after) · retenção/purga automática · exportação · alertas · log de leitura
(só mutações). `meta Json` fica de fora (usar `description` legível).

## Decomposição (→ 2 planos)
1. Migração (`entity`/`entityId`) + `logEvent` helper + retrofit das mutações existentes + testes.
2. DAL `audit.ts` + tela `/auditoria` + filtros + nav + RBAC `audit:view` + testes.

## Pontos confirmados
- Abrangência total; gravação sem RBAC, best-effort; tela só gerente; namespacing de `type`.
