# Tarifa automática por data — Plano 1 (Núcleo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulos puros que derivam a tabela de tarifa (`normal`/`special`) a partir da data (dia da semana + feriado nacional + véspera), mais a tabela/DAL da política de dias especiais.

**Architecture:** Duas libs puras sem I/O (`holidays.ts`, `tariff-day.ts`) operando sobre data civil `{year,month,day}`, testáveis 100% e determinísticas. Uma tabela de linha única `TariffPolicy` guarda os dias-da-semana especiais (default Sex+Sáb), lida/escrita por DAL `server-only` com authz. Nada na estrutura de `Rate` muda.

**Tech Stack:** TypeScript, Next 16, Prisma 7 (`@/generated/prisma/client`, `@prisma/adapter-pg`), Vitest (DB-backed no banco de teste), Postgres (local dev + Neon prod).

## Global Constraints

- **Prisma 7:** importe client/models/enums/namespace de `@/generated/prisma/client` — **nunca** `@prisma/client`. Singleton do DB: `@/server/db`.
- **Tests:** rode `pnpm test` (o `vitest.config.ts` injeta `DATABASE_URL_TEST` como `DATABASE_URL`, sempre no banco de teste). Mock de `server-only` já é global em `tests/setup.ts`.
- **Migração:** criar **contra o banco LOCAL** (o `.env` hoje aponta `DATABASE_URL` pro Neon), depois `migrate deploy` no **banco de teste** e no **Neon**. URLs literais estáticos (não usar `$VAR`/`$(...)`).
- **Camadas:** leituras via DAL (`src/server/data/*`, `'server-only'`, authz dentro de cada função). RBAC via `can(role, action)` de `@/lib/rbac`.
- **Commits:** Conventional Commits. **Nunca** trailer `Co-Authored-By`.
- **TZ:** data civil sempre em `America/Sao_Paulo`. Funções puras nunca leem "agora".
- **Numeração de dia-da-semana:** `0=Dom … 6=Sáb` (igual `Date.getUTCDay`).

---

### Task 1: Cálculo da Páscoa (`easterSunday`)

**Files:**
- Create: `src/lib/holidays.ts`
- Test: `tests/lib/holidays.test.ts`

**Interfaces:**
- Produces: `easterSunday(year: number): { month: number; day: number }` (mês 1–12).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/holidays.test.ts
import { describe, it, expect } from 'vitest'
import { easterSunday } from '@/lib/holidays'

describe('easterSunday', () => {
  it('computes Gregorian Easter for known years', () => {
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 })
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 })
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 })
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/holidays.test.ts`
Expected: FAIL — `easterSunday` não existe / módulo não encontrado.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/holidays.ts

// Meeus/Jones/Butcher Gregorian algorithm. Returns Easter Sunday (month 1-12, day).
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/holidays.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/holidays.ts tests/lib/holidays.test.ts
git commit -m "feat(tarifas): easterSunday (Meeus) para feriados móveis"
```

---

### Task 2: Feriados nacionais (`nationalHolidayList` / `nationalHolidays` / `isNationalHoliday`)

**Files:**
- Modify: `src/lib/holidays.ts`
- Test: `tests/lib/holidays.test.ts`

**Interfaces:**
- Consumes: `easterSunday` (Task 1).
- Produces:
  - `nationalHolidayList(year: number): { date: string; name: string }[]` — `date` no formato `'MM-DD'`, ordenado.
  - `nationalHolidays(year: number): Set<string>` — chaves `'MM-DD'`.
  - `isNationalHoliday(d: { year: number; month: number; day: number }): boolean`.

- [ ] **Step 1: Write the failing test** (append ao arquivo)

```ts
// tests/lib/holidays.test.ts (append)
import { nationalHolidays, isNationalHoliday, nationalHolidayList } from '@/lib/holidays'

describe('nationalHolidays', () => {
  it('includes fixed national holidays', () => {
    const h = nationalHolidays(2026)
    for (const d of ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']) {
      expect(h.has(d)).toBe(true)
    }
  })
  it('includes movable holidays derived from Easter 2026 (05/04)', () => {
    const h = nationalHolidays(2026)
    expect(h.has('04-03')).toBe(true) // Sexta-feira Santa
    expect(h.has('02-16')).toBe(true) // Carnaval segunda
    expect(h.has('02-17')).toBe(true) // Carnaval terça
    expect(h.has('06-04')).toBe(true) // Corpus Christi
  })
  it('isNationalHoliday matches by civil date', () => {
    expect(isNationalHoliday({ year: 2026, month: 9, day: 7 })).toBe(true)
    expect(isNationalHoliday({ year: 2026, month: 9, day: 8 })).toBe(false)
  })
  it('nationalHolidayList is sorted and named', () => {
    const list = nationalHolidayList(2026)
    expect(list[0]).toEqual({ date: '01-01', name: 'Confraternização Universal' })
    expect(list.some((x) => x.name === 'Corpus Christi')).toBe(true)
    expect(list.map((x) => x.date)).toEqual([...list.map((x) => x.date)].sort())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/holidays.test.ts`
Expected: FAIL — funções não existem.

- [ ] **Step 3: Write minimal implementation** (append ao `holidays.ts`)

```ts
// src/lib/holidays.ts (append)

const MS_DAY = 86_400_000

function mmdd(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const FIXED: { date: string; name: string }[] = [
  { date: '01-01', name: 'Confraternização Universal' },
  { date: '04-21', name: 'Tiradentes' },
  { date: '05-01', name: 'Dia do Trabalho' },
  { date: '09-07', name: 'Independência' },
  { date: '10-12', name: 'Nossa Senhora Aparecida' },
  { date: '11-02', name: 'Finados' },
  { date: '11-15', name: 'Proclamação da República' },
  { date: '11-20', name: 'Consciência Negra' },
  { date: '12-25', name: 'Natal' },
]

export function nationalHolidayList(year: number): { date: string; name: string }[] {
  const e = easterSunday(year)
  const base = Date.UTC(year, e.month - 1, e.day)
  const movable: { offset: number; name: string }[] = [
    { offset: -2, name: 'Sexta-feira Santa' },
    { offset: -48, name: 'Carnaval (segunda)' },
    { offset: -47, name: 'Carnaval (terça)' },
    { offset: 60, name: 'Corpus Christi' },
  ]
  const list = [
    ...FIXED,
    ...movable.map((m) => ({ date: mmdd(new Date(base + m.offset * MS_DAY)), name: m.name })),
  ]
  return list.sort((a, b) => a.date.localeCompare(b.date))
}

export function nationalHolidays(year: number): Set<string> {
  return new Set(nationalHolidayList(year).map((h) => h.date))
}

export function isNationalHoliday(d: { year: number; month: number; day: number }): boolean {
  const key = `${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
  return nationalHolidays(d.year).has(key)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/holidays.test.ts`
Expected: PASS (todos os grupos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/holidays.ts tests/lib/holidays.test.ts
git commit -m "feat(tarifas): feriados nacionais (fixos + móveis) e isNationalHoliday"
```

---

### Task 3: Derivação do dia (`resolveDay`, `dayReasonLabel`, `civilDateInSaoPaulo`)

**Files:**
- Create: `src/lib/tariff-day.ts`
- Test: `tests/lib/tariff-day.test.ts`

**Interfaces:**
- Consumes: `isNationalHoliday` (Task 2).
- Produces:
  - `type DayType = 'normal' | 'special'`
  - `type DayReason = 'holiday' | 'holiday_eve' | 'weekend' | 'weekday'`
  - `type CivilDate = { year: number; month: number; day: number }`
  - `resolveDay(d: CivilDate, specialWeekdays: number[]): { day: DayType; reason: DayReason }`
  - `dayReasonLabel(reason: DayReason): string`
  - `civilDateInSaoPaulo(date: Date): CivilDate`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/tariff-day.test.ts
import { describe, it, expect } from 'vitest'
import { resolveDay, dayReasonLabel, civilDateInSaoPaulo } from '@/lib/tariff-day'

const FRI_SAT = [5, 6]

describe('resolveDay', () => {
  it('normal on a plain weekday', () => {
    // 2026-09-08 is a Tuesday, no holiday nearby
    expect(resolveDay({ year: 2026, month: 9, day: 8 }, FRI_SAT)).toEqual({ day: 'normal', reason: 'weekday' })
  })
  it('special by configured weekday (Saturday)', () => {
    // 2026-09-05 is a Saturday
    expect(resolveDay({ year: 2026, month: 9, day: 5 }, FRI_SAT)).toEqual({ day: 'special', reason: 'weekend' })
  })
  it('special on a national holiday (07/09, Monday)', () => {
    expect(resolveDay({ year: 2026, month: 9, day: 7 }, FRI_SAT)).toEqual({ day: 'special', reason: 'holiday' })
  })
  it('special on a holiday eve (06/09, Sunday, eve of 07/09)', () => {
    expect(resolveDay({ year: 2026, month: 9, day: 6 }, FRI_SAT)).toEqual({ day: 'special', reason: 'holiday_eve' })
  })
  it('holiday wins over weekend when both apply', () => {
    // 01/05/2026 (Dia do Trabalho) is a Friday → holiday, not weekend
    expect(resolveDay({ year: 2026, month: 5, day: 1 }, FRI_SAT)).toEqual({ day: 'special', reason: 'holiday' })
  })
  it('treats 31/12 as eve of 01/01 across the year boundary', () => {
    expect(resolveDay({ year: 2026, month: 12, day: 31 }, [])).toEqual({ day: 'special', reason: 'holiday_eve' })
  })
})

describe('dayReasonLabel', () => {
  it('maps reasons to PT-BR labels', () => {
    expect(dayReasonLabel('holiday')).toBe('feriado')
    expect(dayReasonLabel('holiday_eve')).toBe('véspera de feriado')
    expect(dayReasonLabel('weekend')).toBe('fim de semana')
    expect(dayReasonLabel('weekday')).toBe('dia de semana')
  })
})

describe('civilDateInSaoPaulo', () => {
  it('converts a UTC instant to the São Paulo civil date', () => {
    // 2026-09-07T02:00:00Z → São Paulo (UTC-3) is 2026-09-06 23:00
    expect(civilDateInSaoPaulo(new Date('2026-09-07T02:00:00Z'))).toEqual({ year: 2026, month: 9, day: 6 })
    expect(civilDateInSaoPaulo(new Date('2026-09-07T12:00:00Z'))).toEqual({ year: 2026, month: 9, day: 7 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/tariff-day.test.ts`
Expected: FAIL — módulo/funções não existem.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/tariff-day.ts
import { isNationalHoliday } from './holidays'

export type DayType = 'normal' | 'special'
export type DayReason = 'holiday' | 'holiday_eve' | 'weekend' | 'weekday'
export type CivilDate = { year: number; month: number; day: number }

const MS_DAY = 86_400_000

function weekday(d: CivilDate): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()
}

function nextDay(d: CivilDate): CivilDate {
  const n = new Date(Date.UTC(d.year, d.month - 1, d.day) + MS_DAY)
  return { year: n.getUTCFullYear(), month: n.getUTCMonth() + 1, day: n.getUTCDate() }
}

// Precedence: holiday > holiday_eve > weekend > weekday.
export function resolveDay(d: CivilDate, specialWeekdays: number[]): { day: DayType; reason: DayReason } {
  if (isNationalHoliday(d)) return { day: 'special', reason: 'holiday' }
  if (isNationalHoliday(nextDay(d))) return { day: 'special', reason: 'holiday_eve' }
  if (specialWeekdays.includes(weekday(d))) return { day: 'special', reason: 'weekend' }
  return { day: 'normal', reason: 'weekday' }
}

export function dayReasonLabel(reason: DayReason): string {
  switch (reason) {
    case 'holiday': return 'feriado'
    case 'holiday_eve': return 'véspera de feriado'
    case 'weekend': return 'fim de semana'
    case 'weekday': return 'dia de semana'
  }
}

export function civilDateInSaoPaulo(date: Date): CivilDate {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
  const [year, month, day] = s.split('-').map(Number)
  return { year, month, day }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/tariff-day.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tariff-day.ts tests/lib/tariff-day.test.ts
git commit -m "feat(tarifas): resolveDay (dia da semana + feriado/véspera) + helpers TZ"
```

---

### Task 4: Migração `TariffPolicy` (linha única + seed) e sync test DB / Neon

**Files:**
- Modify: `prisma/schema.prisma` (add model)
- Create: `prisma/migrations/<timestamp>_tariff_policy/migration.sql` (gerado + seed manual)
- Modify: `tests/setup.ts:30-34` (add `'tariff_policy'` ao `APP_TABLES`)

**Interfaces:**
- Produces: tabela `tariff_policy(id int pk default 1, special_weekdays int[])` com linha `id=1 → {5,6}`; model Prisma `TariffPolicy` disponível em `db.tariffPolicy`.

- [ ] **Step 1: Add the model to the schema**

Append em `prisma/schema.prisma`:

```prisma
model TariffPolicy {
  id              Int   @id @default(1)
  specialWeekdays Int[] @map("special_weekdays") // 0=Dom … 6=Sáb
  @@map("tariff_policy")
}
```

- [ ] **Step 2: Generate the migration against the LOCAL db (create-only)**

Run:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac?schema=public" pnpm prisma migrate dev --create-only --name tariff_policy
```
Expected: cria `prisma/migrations/<ts>_tariff_policy/migration.sql` com o `CREATE TABLE "tariff_policy"`, sem aplicar ainda.

- [ ] **Step 3: Append the seed row to the generated migration.sql**

Edite o `migration.sql` recém-criado e adicione ao final:

```sql
INSERT INTO "tariff_policy" ("id", "special_weekdays") VALUES (1, '{5,6}') ON CONFLICT DO NOTHING;
```

- [ ] **Step 4: Apply to LOCAL + regenerate client**

Run:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac?schema=public" pnpm prisma migrate dev
```
Expected: aplica a migração no banco local e roda `prisma generate` (o client passa a ter `db.tariffPolicy`).

- [ ] **Step 5: Apply to the TEST db**

Run:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test?schema=public" pnpm prisma migrate deploy
```
Expected: `1 migration applied` no banco de teste.

- [ ] **Step 6: Add `tariff_policy` to the test truncation list**

Em `tests/setup.ts`, adicione `'tariff_policy'` ao array `APP_TABLES` (sem dependências de FK; a CASCADE cobre). Ex.: incluir no bloco:

```ts
const APP_TABLES = [
  'stock_movement', 'event_log', 'wake_up_call', 'loyalty_redemption', 'consumption',
  'cash_movement', 'stay', 'ledger_entry', 'rate', 'shift', 'room', 'room_category',
  'product', 'loyalty_tier', 'cost_center', 'customer', 'employee', 'tariff_policy',
]
```

- [ ] **Step 7: Verify the suite still boots green**

Run: `pnpm test tests/lib/tariff-day.test.ts`
Expected: PASS (garante que schema/generate/setup continuam válidos).

- [ ] **Step 8: Apply to Neon (produção) — mantém paridade**

Run (endpoint **direto**, não-pooler):
```bash
DATABASE_URL="postgresql://neondb_owner:npg_2fOXtIKN4xuQ@ep-mute-breeze-ac583hg2.sa-east-1.aws.neon.tech/neondb?sslmode=require" pnpm prisma migrate deploy
```
Expected: `1 migration applied`. (Additivo e seguro; a UI nova ainda não está no ar.) Se preferir adiar o Neon pro deploy do app, pule este passo — mas registre.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/setup.ts
git commit -m "feat(tarifas): tabela TariffPolicy (dias especiais) + seed Sex/Sáb"
```

---

### Task 5: DAL da política (`getTariffPolicy` / `updateTariffPolicy`)

**Files:**
- Modify: `src/server/data/tariff.ts` (add duas funções + constante)
- Test: `tests/server/data/tariff-policy.test.ts`

**Interfaces:**
- Consumes: `db.tariffPolicy` (Task 4); `requireTariffManager` e `getCurrentUser` já no arquivo; `logEvent`.
- Produces:
  - `getTariffPolicy(): Promise<{ specialWeekdays: number[] }>` — autenticado; fallback `[5,6]` se linha ausente.
  - `updateTariffPolicy(specialWeekdays: number[]): Promise<{ specialWeekdays: number[] }>` — `tariff:manage`; sanitiza (inteiros 0–6, dedup, ordena) e faz upsert em `id=1`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/data/tariff-policy.test.ts
import { vi, describe, it, expect } from 'vitest'
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { getTariffPolicy, updateTariffPolicy } from '@/server/data/tariff'

const manager = { id: 1, name: 'Boss', role: 'manager' }
const reception = { id: 2, name: 'Rec', role: 'reception' }

describe('tariff policy DAL', () => {
  it('getTariffPolicy returns default [5,6] when no row exists', async () => {
    session.current = manager
    expect(await getTariffPolicy()).toEqual({ specialWeekdays: [5, 6] })
  })

  it('updateTariffPolicy upserts, sanitizes and sorts', async () => {
    session.current = manager
    const out = await updateTariffPolicy([6, 0, 6, 5])
    expect(out).toEqual({ specialWeekdays: [0, 5, 6] })
    expect(await getTariffPolicy()).toEqual({ specialWeekdays: [0, 5, 6] })
  })

  it('updateTariffPolicy drops out-of-range values', async () => {
    session.current = manager
    const out = await updateTariffPolicy([1, 9, -1, 3])
    expect(out).toEqual({ specialWeekdays: [1, 3] })
  })

  it('updateTariffPolicy is manager-only', async () => {
    session.current = reception
    await expect(updateTariffPolicy([5, 6])).rejects.toThrow(/forbidden/i)
  })

  it('getTariffPolicy rejects anonymous', async () => {
    session.current = null
    await expect(getTariffPolicy()).rejects.toThrow(/forbidden/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/server/data/tariff-policy.test.ts`
Expected: FAIL — `getTariffPolicy`/`updateTariffPolicy` não exportados.

- [ ] **Step 3: Write minimal implementation** (append em `src/server/data/tariff.ts`)

```ts
// src/server/data/tariff.ts (append)
const DEFAULT_SPECIAL_WEEKDAYS = [5, 6]

export async function getTariffPolicy(): Promise<{ specialWeekdays: number[] }> {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  const row = await db.tariffPolicy.findUnique({ where: { id: 1 } })
  return { specialWeekdays: row?.specialWeekdays ?? DEFAULT_SPECIAL_WEEKDAYS }
}

export async function updateTariffPolicy(specialWeekdays: number[]): Promise<{ specialWeekdays: number[] }> {
  await requireTariffManager()
  const clean = [...new Set(specialWeekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
  const row = await db.tariffPolicy.upsert({
    where: { id: 1 },
    update: { specialWeekdays: clean },
    create: { id: 1, specialWeekdays: clean },
  })
  await logEvent({ type: 'tariff.policy', description: `Dias especiais: [${clean.join(', ')}]`, entity: 'tariff_policy', entityId: '1' })
  return { specialWeekdays: row.specialWeekdays }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/server/data/tariff-policy.test.ts`
Expected: PASS (5 casos).

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: tudo verde (a truncation de `tariff_policy` isola cada teste).

- [ ] **Step 6: Commit**

```bash
git add src/server/data/tariff.ts tests/server/data/tariff-policy.test.ts
git commit -m "feat(tarifas): DAL getTariffPolicy/updateTariffPolicy (tariff:manage)"
```

---

## Self-Review

- **Spec coverage:** módulos puros `holidays.ts`/`tariff-day.ts` (Tasks 1–3) ✓; `TariffPolicy` + seed + deploy test/Neon (Task 4) ✓; DAL `getTariffPolicy`/`updateTariffPolicy` com RBAC (Task 5) ✓; TZ São Paulo (Task 3) ✓; numeração 0–6 ✓. A integração de UI (check-in + `/tarifas` + action) fica no **Plano 2**.
- **Placeholders:** nenhum — todo passo tem código real.
- **Type consistency:** `DayType`/`DayReason`/`CivilDate` definidos na Task 3 e reusados; `resolveDay` retorna `{day,reason}` consistente com os testes; `specialWeekdays: number[]` idêntico em DAL e testes.
- **Datas verificadas:** Páscoa 2024–2027 (31/03, 20/04, 05/04, 28/03); móveis 2026 (Sexta Santa 03/04, Carnaval 16–17/02, Corpus 04/06); 07/09/2026 = segunda, véspera 06/09 = domingo.
