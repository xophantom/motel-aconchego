# Spec — Financeiro (contas + centros de custo + faturamento)

Data: 2026-07-03 · Status: aprovado p/ planejamento

## Contexto
O legado (`Contas.mdb`, `MotelAc5.mdb=Fatura`) tinha lançamento de despesas/receitas por centro de
custo (`Frm5CtaI/LE/T`) e faturamento/fechamento diário (`Frm5FatI/LE/T`). O doc 08 marcou o
financeiro como **MANTER**. Os models `LedgerEntry` e `CostCenter` já existem no schema mas **sem
tela/DAL**. Esta fatia entrega o módulo financeiro **completo**: lançamentos, centros de custo e o
**faturamento diário** que consolida o dinheiro do dia (estadias + consumo + caixa + contas).

## Decisões (travadas)
- **Escopo completo:** Contas (despesa/receita c/ centro de custo) + CRUD de centros de custo +
  faturamento diário consolidado + relatório por centro de custo no mês.
- **Faturamento é computado, não persistido** (igual `monthlyOccupancy`): agrega por data civil a
  partir de `stay`, `consumption`, `cash_movement` e `ledger_entry`. Sem tabela de "fechamento" — não
  precisa e evita divergência (a verdade são os lançamentos). "Fechar o dia" fica como não-objetivo.
- **RBAC:** `finance:manage` (gerente) para lançar/editar contas e centros de custo e ver relatórios.
  (Recepção não lança conta nesta fatia; reavaliar se pedirem.)
- **Convenção de sinal:** `LedgerEntry.amount` sempre **positivo**; o sentido vem de `kind`
  (`expense`/`income`). Relatórios somam receitas − despesas.
- Emite eventos de auditoria (`finance.entry.*`, `finance.costcenter.*`) via `logEvent` (depende da
  fatia Auditoria).

## Modelo (Prisma)
- `enum LedgerKind { expense; income; @@map("ledger_kind") }`.
- `LedgerEntry` (já existe: `entryDate Date`, `description`, `amount Decimal`, `costCenter String?`,
  relação `center`): **adicionar** `kind LedgerKind`, `employeeId Int? @map("employee_id")` (quem
  lançou, relação `Employee`), `createdAt DateTime @default(now())`. Índice `@@index([entryDate])`.
- `CostCenter` (já existe: `code`, `description`, `entries`): sem mudança.
- Migração Prisma.

## DAL — `src/server/data/finance.ts` (`server-only`, tudo `finance:manage`)
- Centros de custo: `listCostCenters()`, `upsertCostCenter({ code, description })`, `deleteCostCenter(code)`
  (bloqueia delete se houver lançamentos — retorna erro claro).
- Contas: `listEntries({ from, to, costCenter?, kind? })` (join `center` + operador), `createEntry(input)`,
  `updateEntry(id, input)`, `deleteEntry(id)`. `input = { entryDate, kind, amount, description, costCenter? }`.
- **Faturamento (computado):** `dailyStatement(date)` → para uma data civil:
  `{ stays, consumption, cashIn, cashOut, expenses, income, net }` onde
  `stays` = soma de `stay.stayAmount` de estadias `closed` com `checkOut` na data;
  `consumption` = soma de `stay.consumptionAmount` dessas estadias + vendas avulsas do dia;
  `cashIn/cashOut` = movimentos de caixa do dia por sinal; `expenses/income` = `ledger_entry` da data;
  `net` = income + receita − expenses. `statementRange(from, to)` = lista de `dailyStatement` por dia + totais.
- `costCenterMonthly(year, month)` → total por centro de custo no mês (income/expense/net), + sem-centro.

## Server Actions — `src/app/financeiro/actions.ts`
CRUD de contas e centros de custo (Zod, `revalidatePath('/financeiro')`), padrão `ActionState`
(igual às outras telas). `entryDate` aceita `YYYY-MM-DD`. Amount > 0.

## UI — `/financeiro` (gerente)
Uma página com três seções (cards), `PageHeader` "Financeiro":
1. **Lançar conta** — form: data, tipo (despesa/receita), valor, centro de custo (select), descrição.
   Lista dos lançamentos do período (filtro de/até + centro), editar/excluir. Despesa em vermelho,
   receita em verde (tokens), `.tnum`.
2. **Centros de custo** — CRUD inline (código + descrição), como as faixas de fidelidade.
3. **Faturamento** — seletor de período (default mês atual); tabela por dia
   (Data · Estadias · Consumo · Caixa · Despesas · Receitas · Líquido) + linha TOTAL; e um resumo por
   centro de custo no mês. Download **CSV** e **PDF** via Route Handlers (`/financeiro/csv|pdf`),
   reusando o padrão de `/relatorios`.
- Nav: link **Financeiro** (gerente).

## RBAC
Nova ação `finance:manage` (só `manager`).

## Testes
- Centros de custo: CRUD; delete bloqueado com lançamentos vinculados; recepção → Forbidden.
- Contas: create/update/delete; `listEntries` filtra por período/centro/kind; sinal por `kind`.
- `dailyStatement`: cenário com 1 estadia fechada + 1 venda avulsa + 1 sangria + 1 despesa + 1 receita
  → confere cada campo e `net`. `statementRange` soma por dia. `costCenterMonthly` agrupa certo.
- Route handlers CSV/PDF respondem 200 e respeitam `finance:manage`.
- Auditoria: criar/editar/excluir lançamento gera `EventLog`.

## Não-objetivos
Fechamento diário persistido/travado · conciliação bancária · contas a pagar/receber com vencimento ·
anexos/notas fiscais · múltiplas moedas · lançamento por recepção (por ora só gerente).

## Decomposição (→ 3 planos)
1. Migração (`kind`, `employeeId`, `createdAt`, índice) + DAL centros de custo + contas (CRUD) + testes.
2. DAL faturamento (`dailyStatement`/`statementRange`/`costCenterMonthly`) + testes.
3. UI `/financeiro` (3 seções) + actions + CSV/PDF + nav + RBAC `finance:manage` + auditoria + testes.

## Pontos confirmados
- Completo (contas+custos+faturamento). Faturamento computado. Sinal por `kind`. Gerente-only.
