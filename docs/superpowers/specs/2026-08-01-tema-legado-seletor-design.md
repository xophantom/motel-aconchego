# Spec — Tema "Legado" (VB6) + seletor de tema

Data: 2026-08-01 · Status: aprovado p/ planejamento

## Contexto
O app usa **Tailwind v4 CSS-first**: todos os tokens de design são CSS custom properties em
`src/app/globals.css` (bloco `@theme inline` + `:root` "Aconchego Noturno · Light" + `.dark`), e os
componentes leem esses tokens (`bg-card`, `text-primary`, `var(--room-free)`, `--radius`…). Trocar os
valores dos tokens re-tematiza o app inteiro **sem tocar em componente**. Já existe `next-themes`
(estratégia de classe: `attribute="class"`, `defaultTheme="dark"`, escreve `.dark`/`.light` no `<html>`)
e um toggle sol/lua (`src/components/mode-toggle.tsx`) montado no header
(`src/components/app-nav.tsx:45`).

O cliente adora o tema moderno ("Aconchego Noturno" — néon rose, fontes Bricolage/Inter, com claro/escuro)
e quer um **segundo tema, "Legado"**, que recria a cara do **sistema VB6 original** (Windows clássico),
podendo alternar entre Moderno e Legado.

## Decisões (travadas)
- **Legado = recriação do visual VB6/Windows clássico:** cinza 3D, denso, alto contraste, cantos retos,
  fonte de sistema (Tahoma-like), azul-marinho como primary. **Aparência única** (sem claro/escuro).
- **Moderno permanece** com claro/escuro e como **default** (`dark`).
- **Terceiro tema nomeado no `next-themes`:** `legacy`, aditivo aos existentes `dark`/`light`. Persiste
  por navegador (localStorage), como hoje. Sem tema por-usuário no banco.
- **Seletor:** substituir o botão sol/lua por um **menu** (ícone de paleta) no mesmo lugar do header,
  com 3 opções: **Moderno · Claro**, **Moderno · Escuro**, **Legado**. Um controle só (sem "dois eixos").
- **A pele Legado vive só em `globals.css` sob `.legacy`** — token-swap + camada de normalização escopada.
  Zero edição de componente (fora o seletor). Moderno fica 100% intacto.
- **Fidelidade:** mirar "Windows clássico fiel porém usável"; a paleta é ajustada **ao vivo** no navegador
  após montar (não travar cada tom na spec).

## Mecanismo / estado (`next-themes`)
- `src/app/layout.tsx`: o `ThemeProvider` passa a declarar os temas nomeados
  `themes={['light','dark','legacy']}`, mantendo `attribute="class"` e `defaultTheme="dark"`
  (`enableSystem` pode ser removido — o menu expõe escolhas explícitas). O `<html>` já tem
  `suppressHydrationWarning`.
- `next-themes` escreve a classe = valor do tema no `<html>`: `dark` → `.dark` (existente),
  `light` → `.light` (o `:root` já é o claro), `legacy` → `.legacy` (bloco novo).
- `src/components/ui/sonner.tsx` já segue `useTheme()`; o toaster no legado cai no tema `light` do sonner
  (aceitável; não é objetivo estilizar o toast como VB6).

## Pele "Legado" — bloco `.legacy` em `src/app/globals.css`
Tudo escopado sob `.legacy` (descendentes), então o Moderno não muda.
1. **Tokens (override do `:root`):** fundo cinza clássico (~`#D4D0C8`), `--foreground` preto,
   `--card`/`--popover` branco, `--primary` azul-marinho (~`#000080`) com `--primary-foreground` branco,
   `--border`/`--input` cinza de alto contraste, `--secondary`/`--muted` cinza claro, `--destructive`
   vermelho clássico. Estados de quarto **chapados**: `--room-free` verde, `--room-occupied` vermelho,
   `--room-cleaning` amarelo/mostarda, `--room-maintenance` cinza. (Valores exatos ajustados ao vivo.)
2. **`--radius: 0`** (cantos retos; deriva todos os `--radius-*`).
3. **Fonte:** `--font-sans`/`--font-heading`/`--font-display` → `Tahoma, "Segoe UI", Verdana, sans-serif`;
   remover `letter-spacing` negativo dos títulos; densidade um tico menor.
4. **Camada de normalização (defeat dos utilitários "modernos", só sob `.legacy`, com `!important` onde
   necessário):** zerar `text-shadow`, `box-shadow` e glows (o brilho néon dos números de quarto é
   `text-shadow` inline em `room-grid.tsx`); zerar `animation`/`transition`; forçar `border-radius: 0`
   também nos `rounded-full`/arbitrários (badges/chips); remover os gradientes radiais de
   `.dark body` (não aplicam no legado, mas garantir fundo chapado).
5. **Restyle 3D/flat clássico (seletores-alvo sob `.legacy`):** botões e inputs com **bevel 3D**
   (borda clara top-left / escura bottom-right) ou, no mínimo, borda reta de alto contraste; painéis
   (`.bg-card`) como caixas brancas com borda 3D; tabelas com **gridlines** e header cinza; foco com
   **outline pontilhado** clássico; barra do header em azul (evocando a title bar). Escopo mínimo,
   sem tocar nos arquivos de componente.

## Seletor de tema — `src/components/theme-menu.tsx` (novo)
- Client component com `useTheme()` (`next-themes`): um botão com ícone de paleta abre um menu
  (padrão shadcn `DropdownMenu`, já disponível no kit) com 3 itens que chamam `setTheme('light')`,
  `setTheme('dark')`, `setTheme('legacy')`, marcando o ativo.
- Substitui `<ModeToggle />` em `src/components/app-nav.tsx:45`. O arquivo `mode-toggle.tsx` pode ser
  removido (ou mantido sem uso — decisão do plano; preferir remover se não referenciado).
- Rótulos PT-BR: "Moderno · Claro", "Moderno · Escuro", "Legado". Cabeçalho opcional "Tema".

## Testes
- `theme-menu.test.tsx`: mock de `next-themes` `useTheme` (retorna `setTheme` espião + `theme`
  atual); renderiza o menu, confere os 3 itens e que clicar em cada um chama `setTheme` com
  `'light'|'dark'|'legacy'`; confere o item ativo marcado. (Seguindo o padrão de render de componente
  já usado no projeto — `renderToStaticMarkup`/interações; abrir o menu pode exigir estado, então o
  teste pode renderizar os itens diretamente ou mockar o `DropdownMenu` aberto.)
- **Visual do `.legacy`:** valida no navegador via skill `run` — CSS não é testável por unidade;
  iteração da paleta ao vivo.

## Não-objetivos
Fonte bitmap exata (MS Sans Serif) · barra de título de janela do SO · claro/escuro pro Legado ·
tema salvo por usuário no banco (segue per-browser) · estilizar toasts/sonner como VB6 · animações no
Legado · temas adicionais além de Moderno/Legado.

## Decomposição (→ 2 planos)
1. **Mecanismo + seletor:** `ThemeProvider` com `themes=['light','dark','legacy']`; componente
   `ThemeMenu` (3 opções, ícone de paleta); troca no `app-nav`; remoção do `ModeToggle` se órfão;
   testes do menu. (Selecionar "Legado" já aplica a classe `.legacy`, mesmo antes da pele.)
2. **Pele Legado:** bloco `.legacy` em `globals.css` (tokens + normalização + restyle 3D); verificação
   visual no navegador (skill `run`) e ajuste da paleta ao vivo.

## Pontos confirmados
Legado = VB6 fiel-porém-usável, aparência única. Moderno intacto com claro/escuro, default. Menu de 3
opções no header. Skin só sob `.legacy` em globals.css, zero edição de componente fora o seletor.
Paleta ajustada ao vivo.
