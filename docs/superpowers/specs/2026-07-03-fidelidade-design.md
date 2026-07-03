# Spec — Fidelidade (placa + tiers configuráveis + desconto)

Data: 2026-07-03 · Status: aprovado p/ planejamento

## Contexto
O cliente quer um programa de fidelidade flexível. No motel, **o cliente é identificado pela placa do
carro** (anota a placa na entrada). Esta fatia: identifica o cliente por placa, conta visitas, permite
o gerente configurar faixas (Nx visitas → Y% de desconto), e aplica o desconto (só na estadia) no
checkout, com controle de resgate (cada faixa 1× por cliente). Base: `Customer` já existe;
`Stay.customerId` já existe; `computeStayAmount` (billing).

## Decisões (travadas)
- **Cliente = placa** (`Customer.plate`, normalizada em maiúsculas). Check-in: campo **Placa opcional**
  → find-or-create.
- **Contagem por cliente (total)**: estadias fechadas `type='room'` do cliente.
- **Tiers configuráveis** (gerente): `minVisits → discountPercent`.
- **Desconto só na estadia** (consumo cheio).
- **Resgate no checkout** (não na entrada): ao fechar, se o cliente tem faixa disponível, o operador
  escolhe aplicar → desconto + resgate registrado. Cada faixa resgatável **1×** por cliente.

## Modelo (Prisma)
- `Customer`: adicionar `plate String? @unique` (normalizada UPPER, sem espaços). Mantém name/document/phone.
- `LoyaltyTier { id Int; minVisits Int @unique; discountPercent Int }` — faixas.
- `LoyaltyRedemption { id; customerId; tierId; stayId; createdAt } @@unique([customerId, tierId])`.
- `Stay`: adicionar `discountPercent Int @default(0) @map("discount_percent")`.
- Migração Prisma.

## DAL — `src/server/data/loyalty.ts` (`server-only`)
- `listTiers()` — qualquer logado (usado no checkout). `upsertTier({ minVisits, discountPercent })`,
  `deleteTier(id)` — **loyalty:manage** (gerente).
- `customerByPlate(plate)` — find-or-create por placa normalizada (**stay:manage**). Retorna o customer.
- `customerVisits(customerId, excludeStayId?)` — count de estadias fechadas `type='room'` do cliente
  (excluindo a estadia atual no checkout).
- `availableTiers(customerId, excludeStayId?)` — faixas com `minVisits ≤ visits` **e** sem redemption
  para o cliente. Ordenadas por `minVisits`.
- `redeemTier({ customerId, tierId, stayId })` — cria `LoyaltyRedemption` (respeita o unique) e retorna
  o `discountPercent` da faixa. **stay:manage**.

## Mudanças no fluxo existente
- **check-in** (`stays.checkIn`): aceita `plate?`. Se informado → `customerByPlate` → grava
  `stay.customerId`. (`checkInSchema` ganha `plate` opcional.)
- **checkout** (`stays.checkOut`): calcula a estadia; **aplica `stay.discountPercent`**:
  `estadia = round2(computeStayAmount(...) × (1 − discountPercent/100))`. Consumo inalterado. O saldo
  e o `stayAmount` já refletem o desconto.
- **Aplicar benefício no checkout** (nova action): dado o `roomNumber`, o operador escolhe uma faixa
  disponível → `redeemTier` + grava `stay.discountPercent` na estadia aberta (antes de confirmar a
  saída). O checkout então usa esse desconto.

## UI
- **Check-in** (modal do quarto livre): campo **Placa** (opcional).
- **Checkout** (modal do quarto ocupado): se a estadia tem cliente e `availableTiers` > 0, mostra
  "Placa XXX · N visitas · benefício disponível: Y%" + botão **Aplicar Y%**. Após aplicar, o breakdown
  mostra o desconto e o total recalculado.
- **`/fidelidade`** (gerente): CRUD das faixas (minVisits → %), lista ordenada.
- Nav: link **Fidelidade** (gerente).

## RBAC
`loyalty:manage` (gerente) p/ config de faixas. Placa/resgate = `stay:manage`. `listTiers` qualquer logado.

## Dados pro client
O modal de checkout recebe, por quarto ocupado com cliente: `{ plate, visits, availableTiers: [{id, minVisits, discountPercent}], appliedDiscount }`.

## Testes
- loyalty DAL: `customerByPlate` cria/reusa por placa normalizada; `customerVisits` conta só fechadas
  do cliente (exclui a atual); `availableTiers` = ganhas − resgatadas; `redeemTier` respeita 1×/cliente
  (segundo resgate da mesma faixa falha); authz.
- billing/checkout: `checkOut` aplica `discountPercent` só na estadia (ex: 50% em R$160 → R$80; consumo cheio).
- tiers CRUD: gerente edita; recepção `Forbidden`.
- actions: integração (Zod, revalidate mockado). build + smoke.

## Não-objetivos
Por-quarto · cartão físico/pontos acumulados · desconto no consumo · cadastro rico de cliente
(placa basta; name/phone ficam opcionais e sem tela dedicada).

## Decomposição (ordem → 3 planos)
1. Schema (tiers, redemption, `Customer.plate`, `stay.discountPercent`) + loyalty DAL + desconto no checkout (TDD).
2. Placa no check-in + aplicar-benefício no checkout (DAL wire + UI no modal).
3. `/fidelidade` config + nav.

## Pontos confirmados
- Cliente por placa (find-or-create). Contagem por cliente total.
- Tiers configuráveis; desconto só na estadia; cada faixa 1× por cliente.
- Resgate no checkout (mudou de "entrada" por causa do fluxo de placa — mais natural no pagamento).
