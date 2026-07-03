# Spec — Painel de quartos: modo de cobrança + redesenho do card e modal

Data: 2026-07-03 · Status: aprovado p/ planejamento

## Contexto
Refino da tela mais usada (`/quartos`). Hoje o card é cru (só número, estado e a **letra** da
categoria) e o modal é mínimo. Esta fatia: (1) adiciona **modo de cobrança na entrada** (pernoite fixo
× período por duração) — mudança de backend; (2) **redesenha o card** (mais bonito e informativo,
com stats do quarto ocupado); (3) **amplia o modal** com mais informação e um **breakdown de valores**
no checkout. Base atual: `stay`, `room`, `room_category`, `rate`, `computeStayAmount` (duração),
`consumption`. Escrito no repo do app.

## Decisões (travadas)
- **Modo de cobrança** por estadia: `period` (default, por duração — como hoje) | `overnight`
  (valor de pernoite fixo, ignora o tempo). Escolhido na entrada.
- **Mantém modal central**, porém **maior e mais rico** (sem drawer lateral).
- **Card redesenhado**: bonito, informativo, com stats no ocupado. Mantém a cor por estado
  (escaneável), mas com conteúdo estruturado.

## 1. Modo de cobrança (backend)
- **Schema**: adicionar enum `ChargeMode { period overnight }` e coluna `stay.charge_mode`
  (`@map`, default `period`). Migração Prisma.
- **Engine** `src/lib/billing.ts`: `BillingInput` ganha `chargeMode: 'period' | 'overnight'`.
  - `overnight` → `stay = rate.overnightPrice`; **ignora duração**; soma pessoa adicional normalmente.
  - `period` → fórmula atual (base até mínimo + excedente/30min, teto no pernoite).
- **DAL** `stays.ts`:
  - `checkIn` recebe `chargeMode` (validação Zod `checkInSchema` + `chargeMode`), grava em `stay`.
  - `checkOut` lê `stay.chargeMode` e passa para `computeStayAmount`.
- **Migração de dados**: coluna default `period` cobre estadias existentes.

## 2. Card do quarto (redesenho visual)
Direção estética (mantendo o tema Stone/shadcn, claro+escuro):
- Card `rounded-xl`, leve sombra/`ring`, hover com elevação sutil; grid responsivo.
- **Cor por estado** como faixa/realce (livre=emerald, ocupado=red, limpeza=amber, manutenção=stone)
  — manter escaneável, mas com hierarquia tipográfica (número grande, estado como `Badge`).
- **Livre**: número (destaque) · `Badge` estado · **nome da categoria** (não só a letra).
- **Ocupado**: + rodapé com **⏱ tempo decorrido · 👤 hóspedes · R$ total corrente** (estadia estimada
  + consumo, ao vivo). Para estimar ao vivo, o painel passa a tarifa+config da categoria por quarto ocupado.
- Não usar cores/ícones que quebrem no dark mode; usar tokens (`bg-*`, `text-*`) do tema.

## 3. Modal ampliado + breakdown
- Largura maior (`sm:max-w-lg`), seções com títulos claros.
- **Cabeçalho**: `Quarto NN` · nome da categoria · `Badge` de estado.
- **Ocupado**: seção **Consumo** (lista + adicionar/remover, total) → seção **Fechamento** com
  **breakdown ao vivo**: Estadia (calc, conforme o modo) · Consumo · Antecipado (−) · **Total a pagar**,
  com nota "valor final confirmado no servidor". Botão de saída em destaque.
- **Livre**: entrada com **Modo** (Período/Pernoite) + tabela (normal/especial) + hóspedes + antecipado.

## Dados passados ao client (para estimativas ao vivo)
`listRoomsWithCurrentStay` (ou a página) passa, por quarto ocupado: `chargeMode`, `checkIn`, `guests`,
`day`, `consumptionAmount`, e a **tarifa da categoria** (`{ billing, minPeriodMin, maxPeriodMin,
includedGuests, basePrice, excessPrice30m, overnightPrice, extraGuestPrice }`) para `computeStayAmount`
rodar no client (a engine é pura). Ids como `String`.

## RBAC / cache
Sem novos papéis (recepção+gerente já operam). Dinâmico; `revalidatePath('/quartos')` após mutações.

## Testes
- `billing.ts`: modo `overnight` cobra pernoite fixo (ignora duração, + pessoa adicional); `period`
  mantém o comportamento atual (testes existentes seguem verdes).
- `stays.ts`: `checkIn` grava `chargeMode`; `checkOut` usa o modo gravado (overnight → pernoite fixo).
- UI: verificação de build; render do card/modal (smoke). Estimativa ao vivo é client puro (a engine
  já é testada).

## Decomposição (ordem → 2 planos)
1. **Backend do modo**: schema `chargeMode` + migração + engine + DAL (check-in/checkout) + validação (TDD).
2. **UI**: redesenho do card (stats + visual) + modal ampliado (breakdown) + select de modo na entrada.

## Pontos confirmados
- Pernoite = valor fixo; Período = por duração. Modo gravado na estadia.
- Modal maior/rico (sem drawer). Card bonito + informativo com stats.
- Estimativas no client (engine pura); valor final autoritativo no servidor no checkout.
