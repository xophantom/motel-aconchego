# Spec — Tarifa automática por data (dia da semana + feriado/véspera)

Data: 2026-07-31 · Status: aprovado p/ planejamento

## Contexto
Feedback do cliente (Lucio, 24/07): *"pela data o software poderia identificar o dia da semana, e se
é véspera de feriado, que aí já identifica a tabela automaticamente."*

Hoje a estrutura de tarifa dupla **já existe**: `Rate` é chaveado por `[categoryId, day]` com
`day DayType { normal | special }`, e a `Stay` grava o `day` escolhido. O problema: esse `day` é
escolhido **na mão** pelo operador no check-in (dropdown "Semana / Fim de semana" em
`src/app/quartos/room-grid.tsx:171`). Não existe **nenhuma** noção de data, dia-da-semana ou feriado
no sistema (grep confirmou zero ocorrências de feriado/holiday/getDay/weekend). O checkout busca o rate
com `stay.day` (`src/server/data/stays.ts:74`), então **basta gravar o `day` certo no check-in** que o
resto já funciona.

Esta fatia adiciona a **derivação automática do `DayType` pela data de entrada**, mantendo a escolha
manual como override.

## Decisões (travadas)
- **Estrutura de `Rate` não muda.** Continua `normal`/`special` por categoria. Nada de coluna nova de
  dia-da-semana ou tabela de feriado por tarifa.
- **Feriados: só nacionais, calculados** (fixos + móveis via Páscoa). **Sem** cadastro manual de datas.
  Inclui Carnaval (seg+ter) e Corpus Christi — *ponto facultativo*, mas pesam no movimento de motel.
- **Dia especial = configurável pelo gerente:** um conjunto global de dias-da-semana marcados como
  especiais (não é por categoria). Default `[Sex, Sáb]`.
- **Véspera + feriado, ambos especiais:** o dia do feriado E o dia anterior usam a tabela especial.
- **Auto-sugere, não impõe:** o seletor do check-in passa a vir **pré-marcado** no valor derivado, com
  um rótulo do motivo, mas **continua editável**. O que fica gravado na `Stay.day` é o valor final
  (sugerido ou trocado pelo operador).
- **A data que decide é a de entrada** (check-in). Uma estadia que cruza a meia-noite pra um feriado
  **não** muda de tabela — o motel cobra pela entrada. (Sem recomputo no checkout.)
- **RBAC:** sem ação nova. Editar a política usa `tariff:manage` (gerente, já existe). Ler a política é
  liberado a autenticado (recepção precisa pra sugestão no check-in).

## Módulos puros (100% testáveis, sem I/O, sem timezone interno)
Operam sobre **data civil** `{ year, month (1–12), day }` — o caller extrai a data civil em
`America/Sao_Paulo` (ver seção TZ). Assim as funções são determinísticas e livres de fuso.

**`src/lib/holidays.ts`**
- `easterSunday(year): { month, day }` — algoritmo de Meeus (Gregoriano). Ex.: 2024→31/03, 2025→20/04,
  2026→05/04, 2027→28/03.
- `nationalHolidays(year): Set<string>` — datas `'MM-DD'` do ano. **Fixos:** 01-01, 04-21, 05-01, 09-07,
  10-12, 11-02, 11-15, 11-20 (Consciência Negra, nacional desde 2024), 12-25. **Móveis (base Páscoa):**
  Sexta-feira Santa (Páscoa−2), Carnaval segunda (−48) e terça (−47), Corpus Christi (+60).
- `nationalHolidayList(year): { date: 'MM-DD', name }[]` — mesma coisa, com nome, ordenada, p/ exibir
  em `/tarifas` como referência.
- `isNationalHoliday({ year, month, day }): boolean` — calcula o set do ano da data e testa.

**`src/lib/tariff-day.ts`**
- `resolveDay({ year, month, day }, specialWeekdays: number[]): { day: DayType, reason: DayReason }`
  - `weekday = new Date(Date.UTC(y, m-1, d)).getUTCDay()` (0=Dom … 6=Sáb — tz-free, determinístico).
  - `especial` se: `weekday ∈ specialWeekdays` **OU** `isNationalHoliday(hoje)` **OU**
    `isNationalHoliday(amanhã)` (véspera; `amanhã` trata virada de mês/ano — ex.: 31/12 é véspera de
    01/01).
  - `reason` (precedência quando vários se aplicam): `holiday` > `holiday_eve` > `weekend` > `weekday`.
  - `DayReason = 'holiday' | 'holiday_eve' | 'weekend' | 'weekday'`.

## Modelo (Prisma)
Tabela de linha única pra política global.
```prisma
model TariffPolicy {
  id              Int   @id @default(1)
  specialWeekdays Int[] @map("special_weekdays") // 0=Dom … 6=Sáb
  @@map("tariff_policy")
}
```
Migração Prisma + **INSERT manual** da linha default no SQL da migração:
`INSERT INTO tariff_policy (id, special_weekdays) VALUES (1, '{5,6}') ON CONFLICT DO NOTHING;`
Aplicar no **test DB** e no **Neon** (produção) — `prisma migrate deploy`.

## DAL — `src/server/data/tariff.ts` (estende o existente, `server-only`)
- `getTariffPolicy(): { specialWeekdays: number[] }` — autenticado (recepção+gerente). Lê a linha id=1;
  se ausente (defesa), retorna `[5,6]`.
- `updateTariffPolicy(specialWeekdays: number[])` — **tariff:manage**. Valida cada item inteiro 0–6,
  dedup/ordena, `upsert` id=1. `logEvent('tariff.policy')`.

## Server Actions — `src/app/tarifas/actions.ts` (adiciona)
- `updateTariffPolicyAction(prev, fd)` — Zod: `specialWeekdays` = `fd.getAll('weekday')` → array de ints
  0–6 (checkboxes). Chama `updateTariffPolicy`. `revalidatePath('/tarifas')` **e** `revalidatePath('/quartos')`
  (a sugestão do check-in depende da política). `ActionState`.

## Integração no check-in — `src/app/quartos/`
- `page.tsx` (server): busca `getTariffPolicy()`, extrai a **data civil de hoje** em `America/Sao_Paulo`,
  computa `suggested = resolveDay(hoje, policy.specialWeekdays)` e passa `suggestedDay = suggested.day` +
  `suggestedReason = suggested.reason` pro `room-grid`.
- `room-grid.tsx` (client): o seletor "Semana / Fim de semana" (hoje default fixo `normal`) passa a
  **default = `suggestedDay`**. Abaixo/ao lado, um rótulo do motivo, ex.:
  `"sugerido: Fim de semana — véspera de feriado"` (mapa `reason → texto`). Continua editável; o valor
  submetido é o do seletor (nada muda na action de check-in nem na validação `stay.ts`).

## UI — `/tarifas` (novo card)
- Card **"Política de dia especial"** (perm `tariff:manage`): 7 checkboxes (Dom…Sáb) marcando os dias
  especiais, botão "Salvar". Abaixo, **lista dos feriados nacionais do ano corrente** (via
  `nationalHolidayList`) como referência — só leitura, deixa claro que Carnaval/Corpus entram.

## Timezone
Toda extração de data civil usa `America/Sao_Paulo` via
`Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })` → `YYYY-MM-DD` → split em `{y,m,d}`.
As funções puras nunca criam `Date` a partir de "agora"; só recebem `{y,m,d}`. Segue o cuidado que o
projeto já tem com `@db.Date` (round-trip UTC-meia-noite).

## Testes
- `holidays.test.ts`: `easterSunday` p/ 2024–2027; `nationalHolidays(2026)` contém fixos + Sexta Santa
  (03/04), Carnaval ter (17/02), Corpus Christi (04/06); `isNationalHoliday` true/false; virada de ano.
- `tariff-day.test.ts`: terça comum + `[5,6]` → `{normal, weekday}`; sábado → `{special, weekend}`;
  feriado fixo (07/09/2026, seg) → `{special, holiday}`; véspera (06/09/2026, dom) → `{special,
  holiday_eve}`; precedência (feriado que cai no sábado → `reason=holiday`); 31/12 → véspera de 01/01.
- `tariff.ts` DAL: `getTariffPolicy` devolve default seedado; `updateTariffPolicy` valida faixa 0–6,
  dedup, upsert; gerente ok, recepção → Forbidden; ausência de linha → `[5,6]`.
- action: `updateTariffPolicyAction` faz parse de múltiplos `weekday`, rejeita valor fora de 0–6.
- board: `page.tsx` passa `suggestedDay` derivado; o seletor do `room-grid` vem com esse default.

## Não-objetivos
Dias especiais por categoria · feriados municipais/estaduais · toggle por-feriado de ponto facultativo ·
recomputo de tarifa ao cruzar meia-noite · recomputo de estadias passadas · múltiplas tabelas além de
normal/especial · calendário editável de feriados.

## Decomposição (→ 2 planos)
1. **Núcleo:** módulos puros `holidays.ts` + `tariff-day.ts` + migração/seed `TariffPolicy` + DAL
   `getTariffPolicy`/`updateTariffPolicy` + testes. Deploy da migração no test DB e no Neon.
2. **Integração:** default sugerido no check-in (`quartos/page.tsx` + `room-grid.tsx` + rótulo do motivo)
   + card "Política de dia especial" em `/tarifas` + `updateTariffPolicyAction` + auditoria + testes.

## Pontos confirmados
- Estrutura de Rate intacta. Feriados só nacionais calculados (com Carnaval+Corpus). Dias especiais
  configuráveis pelo gerente (default Sex+Sáb). Véspera e feriado ambos especiais. Sugere no check-in,
  editável. Decide pela data de entrada.

## Fora de escopo desta spec (feedback separado)
"Lista de consumos" — o cliente e o Leo não sabem ainda o que exatamente ele quis. **Parado** até o
cliente esclarecer (agrupar itens iguais? mostrar no ticket? detalhar no fechamento?).
