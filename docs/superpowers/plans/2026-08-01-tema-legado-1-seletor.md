# Tema Legado — Plano 1 (Mecanismo + Seletor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um terceiro tema nomeado (`legacy`) ao `next-themes` e um menu de seleção de tema (Moderno·Claro / Moderno·Escuro / Legado) no header, no lugar do toggle sol/lua.

**Architecture:** Uma fonte única de verdade (`src/lib/themes.ts`) lista os 3 temas; o `ThemeProvider` recebe `themes={[...THEME_VALUES]}` e um `ThemeMenu` (shadcn `DropdownMenu`) chama `setTheme`. Selecionar "Legado" já escreve a classe `.legacy` no `<html>` (a pele visual vem no Plano 2). Zero mudança de token nesta fatia.

**Tech Stack:** Next 16 (App Router, cacheComponents), React 19, `next-themes` (estratégia de classe), shadcn `DropdownMenu` (Radix), lucide-react, Vitest (env `node`).

## Global Constraints

- **Ambiente de teste é `node`** (sem DOM): testes por dados puros ou `renderToStaticMarkup` (react-dom/server). **Sem** simular cliques/abrir menu Radix. Não adicionar jsdom/@testing-library.
- **`next-themes` já instalado** com `attribute="class"`, `defaultTheme="dark"`. O `<html>` tem `suppressHydrationWarning`. A classe = valor do tema (`dark`→`.dark`, `light`→`:root`, `legacy`→`.legacy`).
- **Componentes client** levam `'use client'`. Seguir o padrão de `src/components/mode-toggle.tsx`.
- **Copy PT-BR** com acentos corretos. Rótulos exatos: `Moderno · Claro`, `Moderno · Escuro`, `Legado` (com o separador `·`, U+00B7).
- **Tests:** `pnpm test`. **Build:** `pnpm build`. Commits: Conventional Commits, **sem** `Co-Authored-By`.
- **Shell:** `rg <pattern> <abs-path>`; nunca `cd <path> && ...`.

---

### Task 1: Fonte única dos temas (`src/lib/themes.ts`)

**Files:**
- Create: `src/lib/themes.ts`
- Test: `tests/lib/themes.test.ts`

**Interfaces:**
- Produces:
  - `THEME_OPTIONS: readonly { value: 'light' | 'dark' | 'legacy'; label: string }[]` — na ordem light, dark, legacy.
  - `THEME_VALUES: readonly ('light' | 'dark' | 'legacy')[]` — só os valores, p/ o `ThemeProvider`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/themes.test.ts
import { describe, it, expect } from 'vitest'
import { THEME_OPTIONS, THEME_VALUES } from '@/lib/themes'

describe('theme catalog', () => {
  it('offers exactly the three named themes, in order', () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(['light', 'dark', 'legacy'])
  })
  it('labels them in PT-BR', () => {
    expect(THEME_OPTIONS.map((o) => o.label)).toEqual(['Moderno · Claro', 'Moderno · Escuro', 'Legado'])
  })
  it('THEME_VALUES mirrors the option values (single source of truth)', () => {
    expect(THEME_VALUES).toEqual(THEME_OPTIONS.map((o) => o.value))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/themes.test.ts`
Expected: FAIL — módulo `@/lib/themes` não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/themes.ts
export type ThemeValue = 'light' | 'dark' | 'legacy'

export const THEME_OPTIONS: readonly { value: ThemeValue; label: string }[] = [
  { value: 'light', label: 'Moderno · Claro' },
  { value: 'dark', label: 'Moderno · Escuro' },
  { value: 'legacy', label: 'Legado' },
] as const

export const THEME_VALUES: readonly ThemeValue[] = THEME_OPTIONS.map((o) => o.value)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/themes.test.ts`
Expected: PASS (3 casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/themes.ts tests/lib/themes.test.ts
git commit -m "feat(tema): catálogo único de temas (moderno claro/escuro + legado)"
```

---

### Task 2: `ThemeMenu` + fiação no layout e no header

**Files:**
- Create: `src/components/theme-menu.tsx`
- Modify: `src/app/layout.tsx:37` (props do `ThemeProvider`)
- Modify: `src/components/app-nav.tsx:6,45` (troca `ModeToggle` → `ThemeMenu`)
- Delete: `src/components/mode-toggle.tsx` (se ficar órfão — checar antes)

**Interfaces:**
- Consumes: `THEME_OPTIONS`, `THEME_VALUES` (Task 1); `useTheme` de `next-themes`; `DropdownMenu*` de `@/components/ui/dropdown-menu`; `Button` de `@/components/ui/button`.
- Produces: `ThemeMenu()` — componente client sem props.

- [ ] **Step 1: Create the `ThemeMenu` component**

```tsx
// src/components/theme-menu.tsx
'use client'
import { useTheme } from 'next-themes'
import { Palette, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { THEME_OPTIONS } from '@/lib/themes'

export function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" suppressHydrationWarning aria-label="Tema">
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_OPTIONS.map((opt) => (
          <DropdownMenuItem key={opt.value} onClick={() => setTheme(opt.value)} className="gap-2">
            <Check className={`size-4 ${theme === opt.value ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Wire the ThemeProvider to the named themes**

In `src/app/layout.tsx`, add the import and pass `themes`/`enableSystem`. Replace line 37's `<ThemeProvider ...>` opening tag:

```tsx
// add near the other imports (line ~5-7):
import { THEME_VALUES } from '@/lib/themes'
```
```tsx
// replace the ThemeProvider opening tag (line 37):
<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} themes={[...THEME_VALUES]} disableTransitionOnChange>
```
Rationale: `themes` whitelists `light|dark|legacy`; `enableSystem={false}` drops the hidden `system` theme so the menu's three explicit choices are the whole set; `defaultTheme="dark"` keeps Moderno·Escuro as first load.

- [ ] **Step 3: Swap `ModeToggle` for `ThemeMenu` in the header**

In `src/components/app-nav.tsx`:
- line 6: change `import { ModeToggle } from '@/components/mode-toggle'` → `import { ThemeMenu } from '@/components/theme-menu'`
- line 45: change `<ModeToggle />` → `<ThemeMenu />`

- [ ] **Step 4: Remove the orphaned `ModeToggle` (only if unreferenced)**

Run: `rg "mode-toggle|ModeToggle" /Users/leosperandio/Git/MotelAconchego/src`
Expected: only the (now-updated) `app-nav.tsx` should have referenced it; after Step 3 there should be **no** remaining references.
If there are zero references, delete the file:
```bash
git rm src/components/mode-toggle.tsx
```
If any reference remains, STOP and report it instead of deleting.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: all green (no test imported `mode-toggle`; the theme catalog test still passes).

- [ ] **Step 6: Build (validates cacheComponents/PPR + no dangling imports)**

Run: `pnpm build`
Expected: build OK, no TypeScript error, no unresolved `mode-toggle` import.

- [ ] **Step 7: Commit**

```bash
git add src/components/theme-menu.tsx src/app/layout.tsx src/components/app-nav.tsx
git rm --cached src/components/mode-toggle.tsx 2>/dev/null; true
git commit -m "feat(tema): menu de seleção de tema no header (moderno/legado)"
```

---

## Self-Review

- **Spec coverage:** 3 temas nomeados no next-themes (Task 2 Step 2) ✓; menu de 3 opções no header substituindo o sol/lua (Task 2) ✓; persistência por navegador = comportamento nativo do next-themes ✓; fonte única `THEME_VALUES` compartilhada entre provider e menu (Task 1) ✓. A pele `.legacy` fica no **Plano 2** (selecionar Legado já aplica a classe, sem estilo ainda).
- **Placeholders:** nenhum — código real em todos os passos.
- **Type consistency:** `ThemeValue = 'light'|'dark'|'legacy'` definido na Task 1 e reusado; `THEME_OPTIONS`/`THEME_VALUES` idênticos no menu e no provider; rótulos com `·` (U+00B7) iguais no código e no teste.
- **Env note:** teste é por dados (env `node`), sem render Radix/cliques — decisão consciente registrada nos Global Constraints.
