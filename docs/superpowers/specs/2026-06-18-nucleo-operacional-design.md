# Spec — Núcleo operacional (tarifa + painel de quartos + entrada/saída)

Data: 2026-06-18 · Status: aprovado p/ planejamento

## Contexto

Segunda fatia sobre a base do MotelAconchego (auth/RBAC/Prisma/shadcn já prontos). Entrega o **coração
da operação diária**: tarifação configurável, painel de quartos e entrada/saída com cálculo de estadia
**por duração**. Usa os modelos Prisma já existentes e **populados com dados migrados**
(`room`, `room_category`, `rate`, `stay`, `cash_movement`, `customer`). Regras de negócio em
`/Users/leosperandio/Git/MotelAc/docs/analise/` (03 regras, 08 decisões, 09 modelo).

## Objetivos
- **Engine de cálculo** (pura, testada): por duração, modos motel + hotel.
- **Tarifação CRUD** (gerente): categorias + tarifas (normal/especial).
- **Painel de quartos** em `/quartos`: grid colorido, 4 estados.
- **Entrada/saída** via modal a partir do painel; transições de estado.

## Não-objetivos (esta fatia)
- UI de consumo no checkout (campo `consumptionAmount` já soma no total; lançar produtos = fatia Estoque/Consumo).
- Fechamento de turno / sangria (fatia Caixa) — aqui só grava `cash_movement` + operador do pagamento.
- Impressão de ticket; push em tempo real (usa `revalidatePath`); fidelidade; despertador.

## Decisões (travadas)
- `day_type`: **manual** no check-in (normal/especial).
- **Hotel incluído**: `billing` por categoria (`motel` | `hotel`).
- Fluxo: **modal a partir do painel**.
- Tarifa: **CRUD editável**.
- Layout: **grid colorido uniforme**.
- Rota: painel em **`/quartos`**; `/` continua home com nav.

## Engine de cálculo — `src/lib/billing.ts` (PURA, sem `server-only`; usável no client)
```ts
export type BillingInput = {
  billing: 'motel' | 'hotel'
  minPeriodMin: number
  maxPeriodMin: number
  includedGuests: number
  rate: { basePrice: number; excessPrice30m: number; overnightPrice: number; extraGuestPrice: number }
  checkIn: Date
  checkOut: Date
  guests: number
}
export function computeStayAmount(i: BillingInput): number
```
Algoritmo (duração real — **nunca** data civil):
```
durMin = max(0, (checkOut - checkIn) / 60000)
hotel:  days = max(1, ceil(durMin/1440)); stay = days * overnightPrice
motel:  if durMin <= minPeriodMin: stay = basePrice
        else: extra30 = ceil((durMin - minPeriodMin)/30)
               stay = min(basePrice + extra30*excessPrice30m, overnightPrice)   // teto = pernoite
stay += max(0, guests - includedGuests) * extraGuestPrice
return round2(stay)
```
- `Decimal` do Prisma → `number` na fronteira; arredonda a 2 casas.
- `maxPeriodMin`: motel já tem teto no pernoite (informativo); hotel = bloco de 24h.
- **Total** (`stay + consumo − antecipado`) é calculado na action de checkout, não na engine pura.

## DAL (`src/server/data/*`, `server-only`, authz dentro)
- `tariff.ts`: `listCategories()`, `getCategoryWithRates(id)`, `updateCategory(id, …)`, `updateRate(categoryId, day, …)` — **gerente**.
- `rooms.ts`: `listRoomsWithCurrentStay()` (leitura do painel), `setRoomStatus(number, status, reason?)`.
- `stays.ts`: `checkIn(input)`, `checkOut(roomNumber)`, `getOpenStay(roomNumber)` — **recepção/gerente**.

### Transições de estado (`setRoomStatus`)
- recepção/gerente: qualquer transição (`free`↔`occupied`(via check-in/out)↔`cleaning`↔`maintenance`).
- **camareira**: só `cleaning → free` (liberar) e `→ cleaning`. Nada de occupied/maintenance.
- `maintenance` exige `reason`.

### checkIn / checkOut
- `checkIn`: cria `stay` (status `open`, `roomNumber`, `categoryId`, `checkIn=now`, `day`, `guests`,
  `prepaidAmount`, `entryEmployeeId=me`, `customerId?`); `room.status='occupied'`, `room.currentStayId=stay.id`.
- `checkOut`: `stay.checkOut=now`; `stayAmount=computeStayAmount(...)`; `status='closed'`;
  `paymentEmployeeId=me`; cria `cash_movement` (type `stay`, amount `stayAmount+consumptionAmount`, operador=me);
  `room.status='cleaning'`, `room.currentStayId=null`.

## Server Actions
- `src/app/quartos/actions.ts`: `checkInAction`, `checkOutAction`, `setRoomStatusAction` — Zod, chamam DAL, `revalidatePath('/quartos')`.
- `src/app/tarifas/actions.ts`: `updateCategoryAction`, `updateRateAction` — Zod, gerente, `revalidatePath('/tarifas')`.

## Telas / componentes
- `src/app/quartos/page.tsx` (server, `Suspense`+`connection()`): lê `listRoomsWithCurrentStay()` → `<RoomGrid>`.
- `RoomGrid` (client): cards coloridos por estado (shadcn — cor de fundo + `Badge`). Clique abre `Dialog`
  com o form certo (entrada/saída/liberar/manutenção) via `useActionState`.
  - **Saída**: calcula o valor **ao vivo no client** importando `computeStayAmount` (pura) com tempo
    decorrido atualizando a cada minuto.
- `src/app/tarifas/page.tsx` (server, gerente — DAL lança `Forbidden`→`redirect('/')`): lista categorias+tarifas, forms de edição.
- `src/app/page.tsx` (home): adicionar nav (Painel `/quartos`, Tarifas `/tarifas`[gerente], Funcionários[gerente], tema, sair).

## RBAC
Estender `Action` em `src/lib/rbac.ts`: `'tariff:manage'` (manager), `'stay:manage'` (reception, manager).
`'room:status'` já existe (todos) — limites de transição da camareira são reforçados em `setRoomStatus`.

## Cache
Tudo dinâmico (auth/estado). `revalidatePath` após mutações. Sem `'use cache'`.

## Testes
- `billing.ts` (TDD, exaustivo): motel base/excedente/teto, pessoa adicional, hotel diária; bordas
  (exatamente o mínimo, 1 min além, duração 0, acima do máximo).
- DAL: check-in cria estadia aberta + quarto ocupado; check-out calcula + fecha + quarto limpeza +
  `cash_movement` + operador; transições + limites da camareira; update de tarifa; authz
  (camareira não faz check-in; recepção não edita tarifa).
- Actions: integração (Zod; `revalidatePath` mockado).
- Build + smoke runtime (`/quartos` renderiza o grid).

## Decomposição (ordem de build → 3 planos)
1. **Engine de cálculo** (pura, TDD).
2. **Tarifação** (DAL + actions + `/tarifas` + RBAC).
3. **Painel + entrada/saída + status** (usa a engine; `/quartos` + modais + nav na home).

## Pontos confirmados
- Hotel = **blocos de 24h a partir do check-in** (`ceil(dur/24h)`). Variante "horário fixo de checkout" fica pra depois.
- Excedente = por bloco de 30 min iniciado (`ceil`), conforme legado ("a cada meia hora").
