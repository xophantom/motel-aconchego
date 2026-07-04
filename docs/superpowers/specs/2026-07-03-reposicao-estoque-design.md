# Spec — Reposição / Depósito de estoque

Data: 2026-07-03 · Status: aprovado p/ planejamento

## Contexto
O legado tinha `Frm1Reposicao` ("Soma ao existente") e `Frm6Deposito` (estoque do almoxarifado). O
doc 08 confirmou: **depósito = estoque da recepção**; o **frigobar do quarto não tem saldo próprio**
(consumo do frigobar é venda, sem controle de saldo no quarto). Hoje o app tem `product.stockQty`
(estoque da recepção) que o **consumo já dá baixa**, mas **não há como dar entrada** de mercadoria
com registro — só editar o número na mão no cadastro. Esta fatia adiciona **entrada/ajuste de estoque
com histórico**.

## Decisões (travadas)
- **Depósito = `product.stockQty`** (o que já existe). **Sem** entidade de almoxarifado separada (YAGNI).
- **Reposição = movimento de estoque `+qty`** que soma ao existente, com registro (`StockMovement`):
  quem, quando, quantidade, custo unitário opcional, motivo. Também cobre **ajuste** (`+/−`, ex.:
  perda/quebra/inventário) num só mecanismo.
- **Consumo continua como está** — a baixa por consumo já acontece no `consumption` DAL; **não** vira
  `StockMovement` (evita dupla contagem; a venda já é rastreada na tabela `consumption`).
  `StockMovement` é só o lado de **entradas/ajustes manuais**.
- **Autorização:** nova ação `stock:adjust` (**recepção + gerente**) — repor é tarefa de recepção.
  O CRUD de produto segue `product:manage` (gerente).
- Emite auditoria (`stock.entry`, `stock.adjust`) via `logEvent`.

## Modelo (Prisma)
- `enum StockMovementReason { restock; loss; inventory; correction; @@map("stock_movement_reason") }`.
- `model StockMovement {`
  - `id BigInt @id @default(autoincrement())`
  - `productCode String @map("product_code")` (relação `Product`)
  - `qty Int` (positivo = entrada, negativo = baixa/ajuste)
  - `reason StockMovementReason`
  - `unitCost Decimal? @db.Decimal(10,2) @map("unit_cost")` (opcional; atualiza `product.cost` se informado)
  - `note String?`
  - `employeeId Int? @map("employee_id")` (relação `Employee`)
  - `createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz`
  - `@@index([productCode]) @@map("stock_movement")` `}`
- `Product` ganha `movements StockMovement[]`. Migração Prisma.

## DAL — `src/server/data/stock.ts` (`server-only`)
- `addStockMovement({ productCode, qty, reason, unitCost?, note? })` — **stock:adjust**. Numa transação:
  cria o `StockMovement`, aplica `product.stockQty += qty` (permite chegar a negativo? **não** para
  ajuste que zeraria abaixo de 0 em `inventory`? — regra: entrada soma livre; ajuste negativo não deixa
  `stockQty < 0`, erro `insufficient stock`). Se `unitCost` informado numa entrada, atualiza
  `product.cost`. `logEvent`. Retorna o produto atualizado.
- `listStockMovements({ productCode?, from?, to?, take? })` — **stock:adjust** (recepção vê o próprio
  histórico de reposição). Join produto + operador, ordenado desc, paginado (default 50).

## Server Actions — `src/app/produtos/actions.ts` (adiciona)
- `stockMovementAction(prev, fd)` — Zod (`productCode`, `qty` inteiro ≠ 0, `reason`, `unitCost?`, `note?`),
  `revalidatePath('/produtos')`, `ActionState`; `mapErr` ganha `insufficient stock`→"Estoque
  insuficiente pro ajuste."

## UI — `/produtos` (nova seção)
- Card **"Reposição / ajuste de estoque"** (visível a recepção **e** gerente — a página `/produtos`
  hoje é gerente-only; **abrir a rota** também pra recepção, mas o CRUD de produto continua gerente):
  form inline — produto (select), quantidade (+ entrada / − ajuste), motivo (select: reposição, perda,
  inventário, correção), custo unit. (opcional), obs. Botão "Registrar".
- **Histórico** recente de movimentos (tabela: data · produto · qtd · motivo · operador), com filtro
  por produto. `.tnum`.
- Ajuste na página: recepção vê só a seção de reposição + histórico; gerente vê tudo (cadastro +
  tabela de produtos + reposição). A nav mostra **Produtos** pra recepção também (hoje só gerente).

## RBAC
Nova ação `stock:adjust` (`reception` + `manager`). `product:manage` (CRUD produto) segue gerente.
Ajustar `proxy.ts`/guarda da rota `/produtos` pra permitir recepção (a página condiciona as seções).

## Testes
- `addStockMovement`: entrada soma `stockQty` e cria registro; `unitCost` atualiza `product.cost`;
  ajuste negativo além do saldo → `insufficient stock`; recepção autorizada, camareira → Forbidden.
- `listStockMovements`: filtra por produto/período, ordena desc.
- Consumo **não** cria `StockMovement` (garante não-dupla-contagem) — baixa continua via `consumption`.
- Auditoria: reposição/ajuste gera `EventLog`.
- Actions: Zod (qty ≠ 0), `mapErr`.

## Não-objetivos
Almoxarifado/depósito como entidade separada · transferência depósito→frigobar com saldo no quarto ·
ordem de compra/fornecedor · custo médio ponderado (só sobrescreve `cost` na entrada) · inventário
cíclico com contagem congelada · unidade de medida/fração.

## Decomposição (→ 2 planos)
1. Migração (`StockMovement` + enum) + DAL `stock.ts` + testes.
2. Actions + UI seção reposição/histórico em `/produtos` + abrir rota p/ recepção + RBAC `stock:adjust`
   + nav + auditoria + testes.

## Pontos confirmados
- Depósito = stockQty. Reposição = movimento +qty com histórico. Consumo não vira StockMovement.
  Recepção pode repor.
