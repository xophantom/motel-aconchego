# Spec — Estoque + Consumo (produtos, consumo na estadia, venda avulsa)

Data: 2026-06-19 · Status: aprovado p/ planejamento

## Contexto
Quarta fatia do MotelAconchego. Hoje o consumo entra **0** no checkout/caixa. Esta fatia adiciona:
cadastro de produtos (gerente), lançamento de consumo na estadia (baixa estoque), e venda avulsa
(Pedido Casa, quarto 99). Modelos `Product`, `Consumption`, `Stay.consumptionAmount` já existem;
68 produtos migrados; quarto `99` existe. Regras em `/Users/leosperandio/Git/MotelAc/docs/analise/`.

## Decisões (travadas)
- Consumo lançado **no modal do quarto ocupado**.
- **Venda avulsa = ação dedicada** (cria estadia walkin no quarto 99, já fechada + caixa).
- **CRUD de produtos** (gerente).
- Baixa de estoque ao vender: decrementa `stockQty` (se `trackStock`), **permite negativo**, alerta de mínimo.
- **Venda avulsa NÃO conta como apto** nas métricas — só como consumo + cash.

## DAL
### `src/server/data/products.ts` (`server-only`)
- `listProducts()` — qualquer logado (usado pelo picker de consumo). `Forbidden` se não logado.
- `createProduct(input)` / `updateProduct(code, input)` — **product:manage** (gerente).

### `src/server/data/consumption.ts` (`server-only`)
- `addConsumption({ stayId, productCode, qty })` — **stay:manage**. Em transação: busca o produto
  (preço atual), cria `Consumption` (`unitPrice = product.price`), incrementa `stay.consumptionAmount`
  em `qty*price`, e se `product.trackStock` decrementa `product.stockQty` em `qty` (permite negativo).
  Rejeita se a estadia não está `open`.
- `listConsumption(stayId)` — **stay:manage**. Itens + produto.
- `removeConsumption(id)` — **stay:manage**. Reverte: subtrai do `stay.consumptionAmount` e devolve o
  estoque (se trackStock). Só se a estadia ainda `open`.
- `walkinSale({ items: { productCode, qty }[] })` — **stay:manage**. Em transação: cria `Stay`
  `type='walkin'`, `roomNumber='99'`, `checkIn=checkOut=now`, `status='closed'`, `stayAmount=0`,
  `paymentEmployeeId=me`; cria os `Consumption`; soma `consumptionAmount`; baixa estoque; cria
  **`cash_movement`** (`type='consumption'`, `amount=total`, `shiftId=getOpenShiftFor(now)?.id ?? null`,
  operador=me, descrição "Venda avulsa"). Rejeita lista vazia.

## Ajuste em `src/server/data/shifts.ts` (`shiftMetrics`)
- `nAptos` e `totalEstadias` passam a filtrar **`type='room'`** (walkin não é apto).
- `totalConsumo` = Σ `consumptionAmount` de **todas** as estadias fechadas na janela (quarto + walkin).
- (Saldo já inclui o `cash_movement` da venda avulsa.)

## RBAC — `src/lib/rbac.ts`
Adicionar `Action` `'product:manage'` (apenas **manager**). Consumo/venda usam `'stay:manage'` (já existe).

## Validação — `src/lib/validation/product.ts`
- `productSchema`: `code` (1–3 chars), `description`, `category` enum, `price`≥0, `cost`≥0,
  `stockQty` int, `minStock` int, `trackStock` bool.
- `addConsumptionSchema`: `productCode`, `qty` int ≥1.

## Server Actions
- `src/app/produtos/actions.ts`: `saveProductAction` (create/update), Zod, gerente, `revalidatePath('/produtos')`.
- `src/app/quartos/actions.ts` (existente): `+addConsumptionAction`, `+removeConsumptionAction`,
  `+walkinSaleAction` — Zod, `revalidatePath('/quartos')`.

## UI
- **`/produtos`** (gerente — DAL `Forbidden`→`redirect('/')`): tabela de produtos (código, descrição,
  categoria, preço, estoque, mínimo) com linhas de **estoque baixo destacadas** (`stockQty<=minStock`);
  form criar/editar.
- **Modal do quarto ocupado** (`room-grid.tsx`): nova seção **Consumo** — `Select` de produto + `Input`
  qtd + "Lançar"; lista dos consumos com botão remover; total corrente. Acima do painel de saída.
  A página `/quartos` passa a carregar a lista de produtos e, por quarto ocupado, os consumos.
- **Venda avulsa**: botão no topo de `/quartos` → `Dialog` com carrinho (adiciona produto+qtd, lista,
  total) → "Registrar venda" (`walkinSaleAction`).
- Nav: link **Produtos** na home (gerente).

## Cache
Dinâmico; `revalidatePath('/quartos')` / `/produtos` após mutações.

## Testes
- products DAL: list (logado); create/update (gerente; recepção `Forbidden`).
- consumption DAL: add (cria item, soma `consumptionAmount`, baixa estoque, permite negativo, rejeita
  estadia fechada); remove (reverte valor+estoque); authz (housekeeper `Forbidden`).
- walkinSale: cria walkin fechada no 99 + consumos + `cash_movement` consumption + baixa estoque;
  rejeita vazio.
- shiftMetrics: walkin fechada na janela **não** soma em `nAptos`/`totalEstadias` mas soma em
  `totalConsumo`; estadia de quarto conta normal.
- actions: integração (Zod, revalidate mockado).
- build + smoke (`/produtos`, venda avulsa).

## Decomposição (ordem → 3 planos)
1. RBAC `product:manage` + validação + products DAL (TDD).
2. consumption DAL (add/list/remove) + walkinSale + tweak `shiftMetrics` (TDD).
3. Actions + `/produtos` + consumo no modal + venda avulsa + nav (UI).

## Pontos confirmados
- Venda avulsa = consumo + caixa, **não** conta como apto.
- Estoque permite negativo (não bloqueia venda); alerta visual de mínimo.
- `unitPrice` do consumo = preço do produto **no momento** do lançamento (snapshot).
