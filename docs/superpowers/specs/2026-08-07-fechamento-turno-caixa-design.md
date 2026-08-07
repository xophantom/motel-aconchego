# Spec — Fechamento de turno / Caixa

Data: 2026-08-07 · Status: aprovado p/ planejamento

## Contexto
Pedido do Lúcio (dono do motel), confirmado por WhatsApp (05–07/08) e por vídeos/fotos do **sistema
legado rodando** (levantamento completo em `../../2026-08-05-turno-caixa-levantamento.md`). No **painel de
quartos** deve haver **dois botões**: **"Caixa do turno"** (ver o relatório do turno) e **"Fechar turno"**.

O que **já existe** e reaproveita (`src/server/data/shifts.ts`, `src/lib/shift.ts`, `src/app/caixa/*`):
- Turno por **janela de horário** 07–19 / 19–07, chaveado por `(businessDate, period)` — `Shift`
  `@@unique([businessDate, period])`; `currentPeriod`/`businessDateFor` em `lib/shift.ts`.
- `shiftMetrics` já calcula Nº aptos, Total estadias, Total consumo, sangrias, suprimentos, ticket
  médio e **saldo** (`= saldo inicial + Σ movimentos`). Estadias (checkout/antecipado) e consumo (venda
  avulsa) já entram no caixa como `CashMovement` (`type: 'stay' | 'consumption'`).
- Infra de **impressão térmica 80mm** (rota `/ticket/[stayId]`, `receipt.tsx`, CSS `@media print` +
  `.ticket*` em `globals.css`).

O que **muda**: abertura de turno vira automática (hoje é manual, com saldo inicial digitado);
retirada ganha **método (dinheiro/cartão)**; fechamento **computa o saldo, imprime e carrega** pro
próximo turno; os botões passam a viver no **painel de quartos**; e entra uma **conferência de abertura**
(fundo de caixa esperado). **Novo:** método na retirada, `CashPolicy` (fundo configurável).

## Decisões (travadas)
- **Reformular a `/caixa`** pro novo modelo **e** adicionar os atalhos no painel de quartos (um modelo
  só, consistente).
- **Retirada = lançamento com método (dinheiro/cartão), a qualquer hora**; o fechamento permite uma
  retirada final. O relatório totaliza por método.
- **Receita não tem método** — estadia/consumo entram no caixa como hoje; o cartão é abatido via
  retirada (modelo do legado: soma tudo no caixa, retirada de cartão abate a parte eletrônica).
- **Saldo final** = `saldo inicial + estadias + consumos − retiradas` (confirmado no ticket legado:
  150 + 765 + 230 − 0 = 1.145). Carrega pro próximo turno.
- **Fundo de caixa:** valor esperado configurável pelo gerente (default **150**). No **diurno (07h)** o
  esperado = esse valor; no **noturno (19h)** = o próprio carry (sem divergência). O caixa **abre com o
  valor real** (carry) — **não trava, não força**; a **diferença** (`inicial − esperado`) vira **aviso
  no relatório**.
- **Sem campo "Outros"** (Pix = cartão). **Sem** estatísticas de camareira no relatório.
- **RBAC:** fechar/retirar = `cash:manage` (recepção + gerente — "qualquer um logado" que opera caixa;
  camareira não). Editar o fundo = `finance:manage` (gerente).
- A recepção **não digita** saldo inicial nem contagem — só confere de olho; a divergência é calculada
  do carry vs esperado.

## Modelo (Prisma)
- `enum CashMethod { cash; card; @@map("cash_method") }`.
- **`CashMovement`** ganha `method CashMethod? @map("method")` — preenchido **só** nas retiradas
  (`type: 'withdrawal'`); null nos demais.
- **`Shift`** ganha:
  - `closedById Int? @map("closed_by_id")` (quem fechou; relação nomeada nova com `Employee`).
  - `expectedOpeningBalance Decimal? @map("expected_opening_balance") @db.Decimal(10,2)` (snapshot do
    fundo esperado na abertura).
  - `openingBalance` deixa de ser digitado; `closingBalance` passa a ser **computado** no fechamento.
  - As duas relações `Employee↔Shift` (abertura `employeeId` e fechamento `closedById`) viram
    **relações nomeadas** (`@relation("shiftOpened")` / `@relation("shiftClosed")`); `Employee` ganha
    `shiftsClosed Shift[] @relation("shiftClosed")`.
- **`CashPolicy`** (tabela de 1 linha, padrão `TariffPolicy`):
  ```prisma
  model CashPolicy {
    id                     Int     @id @default(1)
    expectedOpeningBalance Decimal @default(150) @map("expected_opening_balance") @db.Decimal(10, 2)
    @@map("cash_policy")
  }
  ```
  Migração + seed `(1, 150)`; deploy no test DB e no Neon.

## Ciclo do turno — `src/server/data/shifts.ts`
- **`getOrOpenCurrentShift()`** (substitui `openShift` manual): resolve o turno aberto do período atual;
  se não houver, **abre automático** com:
  - `openingBalance` = `closingBalance` do **último turno fechado** (`findFirst closedAt≠null orderBy
    closedAt desc`); se não houver nenhum (1º turno), = `expectedOpeningBalance` do `CashPolicy`.
  - `expectedOpeningBalance` (snapshot) = `CashPolicy.expectedOpeningBalance` se `period=day_07_19`,
    senão = `openingBalance` (noturno não diverge).
  - `employeeId` = operador atual; `openedAt` = agora. `logEvent('shift.open')`.
  Chamado tanto ao criar movimento quanto ao abrir a visão do caixa/turno. Remove `OpenShiftForm`.
- **`addCashMovement`** passa a aceitar `method` para `withdrawal` (dinheiro/cartão) e resolve o turno
  via `getOrOpenCurrentShift()`. Suprimento/correção seguem iguais.
- **`closeShift(shiftId, { finalWithdrawCash?, finalWithdrawCard? })`**: (1) se informados, cria os
  lançamentos `withdrawal` finais com `method`; (2) computa `saldo = shiftMetrics.saldo`; (3) grava
  `closedAt=now`, `closedById=me`, `closingBalance=saldo`; (4) `logEvent('shift.close')`. O próximo turno
  abrirá com esse `closingBalance`.
- **`shiftMetrics`** ganha `retiradoDinheiro` / `retiradoCartao` (soma de `withdrawal` por `method`),
  `total` (= estadias + consumo) e `openingDifference` (= `openingBalance − expectedOpeningBalance`).
- **`shiftReport(shiftId)`** (novo): retorna `{ shift, metrics, lines }` onde `lines` = uma linha por
  **estadia com checkout na janela** (apto, entrada, saída, valor estadia, valor consumo) **+** vendas
  avulsas — a "Listagem do Movimento" detalhada.

## Retirada (método)
- Tela/ação de retirada com **método (dinheiro/cartão)** + valor, a qualquer hora → `withdrawal`
  negativo com `method`. No fechamento, campos opcionais de **retirada final** (dinheiro/cartão).
- Zod: `cashMovementSchema` ganha `method: z.enum(['cash','card']).optional()` (obrigatório quando
  `type='withdrawal'`). Novo `closeShiftSchema` com `finalWithdrawCash?/finalWithdrawCard?` (≥ 0).

## Relatório + impressão (80mm)
- Rota **`/caixa/turno/[shiftId]`** (client) que renderiza o relatório 80mm e dispara `window.print()`
  (mesmo padrão de `/ticket/[stayId]`; reusa o CSS `@media print`).
- **Conteúdo:**
  - Cabeçalho: nome do motel, turno (período + data), operador.
  - **Detalhe** (apto-a-apto): Apto · Entrada · Saída · Estadia · Consumo.
  - **Resumo:** Total em Estadia · Total em Consumo · Nº de Aptos · **Total** · Retirado em Dinheiro ·
    Retirado em Cartão · **nome + horário de quem fechou** · **Saldo atual (final)** · e, se houver,
    **aviso de diferença de abertura** (`inicial − esperado`).
- Botão "Imprimir" na visão "Caixa do turno"; no fechamento, redireciona pra essa rota (auto-print).

## Telas
- **Painel `/quartos`** (`room-grid.tsx` / novo componente no header do painel): 2 botões —
  **"Caixa do turno"** (abre o relatório do turno numa `Dialog`/rota, com imprimir) e **"Fechar turno"**
  (modal: resumo + retirada final dinheiro/cartão + "Confirmar e fechar" → fecha e imprime). Guardados
  por `cash:manage`.
- **`/caixa` reformulada** (`page.tsx` + `caixa-forms.tsx`): remove abertura manual; mostra o turno
  aberto (métricas incl. **retirado dinheiro/cartão** e **aviso de diferença**), lista de movimentos,
  **retirada com método**, suprimento/correção, **fechar turno**, histórico de turnos, e um card de
  **config do fundo de caixa** (gerente, `finance:manage`).

## RBAC
- `cash:manage` (recepção + gerente): abrir (implícito), retirar, suprimento, fechar, ver relatório.
- `correction` segue gerente-only (como hoje). Config do fundo (`CashPolicy`): `finance:manage` (gerente).
- Auditoria (`logEvent`) em `shift.open` / `cash.withdrawal` / `shift.close` / `cash.policy`.

## Testes
- `lib/shift.ts`: `currentPeriod`/`businessDateFor` (já cobertos; manter).
- `shifts.ts`: auto-abertura com carry (= último fechado; 1º = fundo); snapshot do esperado (diurno=config,
  noturno=carry); `openingDifference` (diurno diverge, noturno = 0); `addCashMovement` withdrawal com
  `method` soma em `retiradoDinheiro`/`retiradoCartao`; `closeShift` computa saldo, grava `closedById`,
  e o próximo turno abre com o `closingBalance`; retirada final no fechamento vira movimento.
- `shiftReport`: linhas apto-a-apto (estadias com checkout na janela + avulsas) + resumo batendo com
  `shiftMetrics`.
- `CashPolicy` DAL: get (default 150) / update (finance:manage; recepção → Forbidden).
- Actions: Zod (`method` obrigatório em withdrawal; `closeShiftSchema`).
- RBAC: recepção fecha/retira; camareira → Forbidden; correção só gerente.

## Não-objetivos
Forma de pagamento na **receita** (estadia/consumo por método) · campo "Outros" · Pix separado ·
estatísticas de camareira no relatório · contagem manual digitada na abertura (só confere de olho) ·
múltiplos caixas/terminais · fechamento por operador (é por janela) · relatório do "caixa do dia"
(`DI` do legado) — só turno.

## Decomposição (→ 4 planos)
1. **Modelo + ciclo:** `CashMethod`, `CashPolicy`, campos do `Shift` + migração/seed (test DB + Neon);
   `getOrOpenCurrentShift` (auto-abertura/carry/fundo), `shiftMetrics` estendido, DAL `CashPolicy`.
2. **Retirada + fechamento:** `addCashMovement` com `method`, `closeShift` (computa saldo, closedBy,
   carry, retirada final) + validação + actions.
3. **Relatório detalhado + impressão 80mm:** `shiftReport` + rota `/caixa/turno/[shiftId]` (print).
4. **UI:** botões no painel `/quartos` + rework da `/caixa` (retirada com método, fechar, config do fundo).

## Pontos confirmados
Dois botões no painel · turno por janela compartilhado · qualquer um logado (recepção+gerente) fecha,
relatório mostra quem fez · retirada dinheiro/cartão a qualquer hora (Pix=cartão, sem "Outros") · saldo
= inicial+estadias+consumos−retiradas, carrega · fundo esperado configurável (150), abertura não trava,
diferença vira aviso · relatório 80mm detalhado apto-a-apto + resumo (sem camareiras).
