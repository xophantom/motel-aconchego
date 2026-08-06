# Tema Legado — Plano 2 (Pele VB6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao tema `legacy` a aparência do sistema VB6/Windows clássico — cinza 3D, cantos retos, fonte de sistema, alto contraste — sem tocar em nenhum componente.

**Architecture:** Um único bloco `.legacy` em `src/app/globals.css` que (1) sobrescreve os tokens de cor/raio, (2) troca a fonte via seletores de elemento, (3) achata a "pele moderna" (glow/sombra/arredondado/animação) e (4) aplica bevel 3D clássico a botões/campos/painéis/tabelas/header. Tudo escopado sob `.legacy`, então o Moderno fica intacto. A paleta é um primeiro rascunho fiel; o ajuste fino é feito ao vivo no navegador depois.

**Tech Stack:** Tailwind v4 CSS-first (tokens em `globals.css`), CSS puro escopado por classe.

## Global Constraints

- **Depende do Plano 1** (mergeado): o tema `legacy` já existe no `next-themes` e o menu já aplica a classe `.legacy` no `<html>`.
- **Tudo escopado sob `.legacy`** — nenhuma regra nova pode vazar pro Moderno. Cada seletor novo começa com `.legacy`.
- **Zero edição de componente** — só `src/app/globals.css`.
- **CSS puro** (Tailwind processa o arquivo no build; `pnpm build` pega erro de sintaxe).
- **Fidelidade:** "Windows clássico fiel porém usável"; os valores abaixo são ponto de partida, ajustados ao vivo depois.
- Commits: Conventional Commits, **sem** `Co-Authored-By`. Tests: `pnpm test`. Build: `pnpm build`.

---

### Task 1: Bloco `.legacy` (tokens + normalização + 3D) em `globals.css`

**Files:**
- Modify: `src/app/globals.css` (inserir após a regra `.dark body {}`, linha ~166, antes da seção `/* ---- Thermal ticket ---- */`)

**Interfaces:**
- Consumes: os mesmos nomes de token do `:root`/`.dark` (`--background`, `--primary`, `--radius`, `--room-*`, `--font-*`…) e as classes utilitárias que os componentes já usam (`bg-card`, `bg-popover`).
- Produces: a aparência do tema `legacy`. Nada importável por outro código.

- [ ] **Step 1: Insert the `.legacy` block**

Insira o bloco abaixo em `src/app/globals.css`, logo após a regra `.dark body { … }` (linha ~166) e antes de `/* ---- Thermal ticket (80mm) ---- */`:

```css
/* ── Legado · Windows/VB6 clássico (cinza 3D, chapado, alto contraste) ─── */
.legacy {
  --background: #d4d0c8;
  --foreground: #000000;
  --card: #ffffff;
  --card-foreground: #000000;
  --popover: #ffffff;
  --popover-foreground: #000000;
  --primary: #000080;
  --primary-foreground: #ffffff;
  --secondary: #d4d0c8;
  --secondary-foreground: #000000;
  --muted: #ece9d8;
  --muted-foreground: #404040;
  --accent: #000080;
  --accent-foreground: #ffffff;
  --destructive: #a80000;
  --border: #808080;
  --input: #ffffff;
  --ring: #000080;
  --radius: 0rem;
  --chart-1: #000080;
  --chart-2: #808000;
  --chart-3: #008000;
  --chart-4: #808080;
  --chart-5: #800000;

  --room-free: #008000;
  --room-occupied: #a80000;
  --room-cleaning: #808000;
  --room-maintenance: #606060;

  --sidebar: #d4d0c8;
  --sidebar-foreground: #000000;
  --sidebar-primary: #000080;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #ece9d8;
  --sidebar-accent-foreground: #000000;
  --sidebar-border: #808080;
  --sidebar-ring: #000080;
}

/* Fonte de sistema, sem display font, sem tracking negativo */
.legacy { font-family: Tahoma, "Segoe UI", Verdana, Geneva, sans-serif; }
.legacy h1, .legacy h2, .legacy h3, .legacy .font-display {
  font-family: Tahoma, "Segoe UI", Verdana, Geneva, sans-serif;
  letter-spacing: normal;
}

/* Achatar a pele moderna: sem glow/sombra/arredondado/animação */
.legacy *, .legacy *::before, .legacy *::after {
  border-radius: 0 !important;
  box-shadow: none !important;
  text-shadow: none !important;
  animation: none !important;
  transition: none !important;
  backdrop-filter: none !important;
}
.legacy body { background-image: none !important; }

/* Botões: bevel 3D clássico (claro em cima/esq, escuro em baixo/dir) */
.legacy button {
  border-style: solid !important;
  border-width: 2px !important;
  border-top-color: #ffffff !important;
  border-left-color: #ffffff !important;
  border-right-color: #404040 !important;
  border-bottom-color: #404040 !important;
}
.legacy button:active {
  border-top-color: #404040 !important;
  border-left-color: #404040 !important;
  border-right-color: #ffffff !important;
  border-bottom-color: #ffffff !important;
}

/* Campos afundados (sunken): inputs, textarea, selects */
.legacy input, .legacy textarea, .legacy select {
  border-style: solid !important;
  border-width: 2px !important;
  border-top-color: #808080 !important;
  border-left-color: #808080 !important;
  border-right-color: #ffffff !important;
  border-bottom-color: #ffffff !important;
  background-color: #ffffff !important;
}

/* Painéis (cards/diálogos/popovers) como caixas brancas elevadas */
.legacy .bg-card, .legacy .bg-popover {
  border: 2px solid !important;
  border-top-color: #ffffff !important;
  border-left-color: #ffffff !important;
  border-right-color: #404040 !important;
  border-bottom-color: #404040 !important;
}

/* Tabelas densas com gridlines e header cinza */
.legacy table { border-collapse: collapse !important; }
.legacy th, .legacy td { border: 1px solid #808080 !important; }
.legacy thead, .legacy th { background-color: #d4d0c8 !important; }

/* Foco pontilhado clássico */
.legacy :focus-visible { outline: 1px dotted #000000 !important; outline-offset: -3px; }

/* Header como barra de título azul */
.legacy header { background: #000080 !important; border-bottom-color: #000040 !important; }
.legacy header a, .legacy header span, .legacy header button { color: #ffffff !important; }
```

- [ ] **Step 2: Verify every new rule is scoped under `.legacy`**

Run: `rg -n "^\.[a-z]" /Users/leosperandio/Git/MotelAconchego/src/app/globals.css`
Expected: toda regra recém-adicionada começa com `.legacy` (ou `.legacy ` descendente). Nenhuma regra nova sem o prefixo `.legacy` — garante que o Moderno não é afetado.

- [ ] **Step 3: Build (Tailwind processa o CSS; pega erro de sintaxe)**

Run: `pnpm build`
Expected: build OK, sem erro de CSS.

- [ ] **Step 4: Run the full suite (garante que nada quebrou)**

Run: `pnpm test`
Expected: tudo verde (CSS não afeta os testes).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(tema): pele Legado (Windows/VB6 clássico) sob .legacy"
```

- [ ] **Step 6: Verificação visual + ajuste ao vivo (interativo, pós-implementação)**

Subir o app (skill `run`) e, com o tema **Legado** selecionado no menu, conferir no navegador:
- `/quartos`: tiles de quarto chapados (sem glow), cinza 3D, cantos retos; header azul.
- `/tarifas` e `/relatorios`: cards como caixas brancas com borda 3D; tabelas com gridlines.
- Botões com bevel; inputs afundados; foco pontilhado.
- Alternar de volta pra **Moderno · Escuro/Claro** e confirmar que **nada** mudou no tema moderno.
Ajustar a paleta (tons de cinza, azul da title bar, cor dos estados de quarto) ao vivo até ficar fiel-porém-usável. _Este passo é interativo com o usuário; commits de ajuste seguem o mesmo padrão._

---

## Self-Review

- **Spec coverage:** tokens VB6 (cores/`--radius:0`/fonte) ✓; normalização de glow/sombra/arredondado/animação ✓ (mata o `text-shadow` inline dos números de quarto via `.legacy * { text-shadow:none }`); restyle 3D de botões/campos/painéis/tabelas/header ✓; tudo escopado sob `.legacy` (Step 2 verifica) ✓; ajuste de paleta ao vivo (Step 6) ✓.
- **Placeholders:** nenhum — o bloco CSS é concreto e aplicável; "ajuste ao vivo" é passo de verificação intencional, não um TBD de código.
- **Escopo/isolamento:** cada regra começa com `.legacy`; o Moderno não tem nenhuma regra nova aplicável. Step 2 é o guardrail.
- **Consistência:** nomes de token idênticos aos do `:root`/`.dark`; classes-alvo (`.bg-card`, `.bg-popover`, `button`, `input`, `table`) são as que os componentes já usam (confirmado no mapa de theming).
- **Risco anotado:** o bevel usa `border-*-color` (não `box-shadow`), então o reset `box-shadow:none` não o apaga. Selects nativos podem ignorar parte do estilo de borda no macOS/Chrome — aceitável e ajustável no Step 6.
