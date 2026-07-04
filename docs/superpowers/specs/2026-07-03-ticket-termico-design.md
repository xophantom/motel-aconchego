# Spec — Impressão de ticket térmico (80mm)

Data: 2026-07-03 · Status: aprovado p/ planejamento

## Contexto
No legado (VB6 nativo) a saída imprimia um comprovante numa **térmica USB** — direto na porta, com
corte de papel. O app novo roda no **navegador**, que não fala USB cru. Decisão travada: usar
**`window.print()`** sobre um layout **80mm** em CSS, que sai na mesma impressora USB pelo **driver
do Windows**. Sem instalar agente. (Seam deixado para trocar por QZ Tray/ESC/POS depois, se quiserem
impressão silenciosa + corte automático.)

## Decisões (travadas)
- **Método:** página/relatório 80mm + `window.print()` com `@page { size: 80mm auto; margin: 0 }` e
  `@media print`. Impressora térmica = a padrão do Windows (ou escolhida no diálogo).
- **Quando:** (a) **na saída** — após o check-out confirmar, abre a impressão do ticket; (b)
  **reimpressão** — botão "Imprimir ticket" numa estadia já fechada (histórico), pro caso de papel
  atolar. Reimpressão gera evento de auditoria (`ticket.reprint`).
- **Fonte dos dados:** a estadia **fechada** (`stayAmount`, `consumptionAmount`, `prepaidAmount`,
  `discountPercent`, entrada/saída, categoria, itens de consumo, operador). Nada é recalculado — o
  ticket reflete o que foi cobrado.
- **Sem schema novo.** Sem PDF. Sem persistir o ticket.

## Arquitetura
- **Rota de impressão:** `/ticket/[stayId]` (App Router, server component). Lê a estadia via DAL
  (`stay:manage`), renderiza o recibo 80mm. Um pequeno client component dispara `window.print()` no
  load (com `?auto=1`) e fecha/volta depois; sem `?auto` só mostra (pra conferência).
- **Layout `TicketReceipt`** (`src/app/ticket/receipt.tsx`, server-render puro + estilos print):
  cabeçalho (nome do motel + "Comprovante"), quarto + categoria, entrada/saída + duração, tabela de
  consumo (item · qtd · valor), bloco de valores (estadia, desconto se houver, consumo, antecipado,
  **total**), rodapé (operador, data/hora de emissão). Fonte monoespaçada, largura 80mm, `.tnum`.
- **Disparo na saída:** o `CheckOut` do modal, ao receber `ok` com o `stayId`, abre
  `window.open('/ticket/<id>?auto=1')` (nova janela pequena) além de fechar o modal. Se o popup for
  bloqueado, cai num link "Imprimir ticket" visível.
- **Reimpressão:** no histórico (ver spec de Relatórios) ou numa lista de últimas saídas, um link
  "Imprimir" → `/ticket/<id>` (sem auto, o operador clica imprimir).

## DAL — `src/server/data/stays.ts` (leitura)
- `getStayForTicket(stayId)` — **stay:manage**. Retorna a estadia (qualquer status; ideal `closed`)
  com quarto, categoria, itens de consumo (`consumption` + produto) e operadores (entrada/pagamento).
  Números já em `Decimal→number` no formato do ticket.

## Server Action
- `logTicketReprintAction(stayId)` — registra `ticket.reprint` via `logEvent` (chamado pelo botão de
  reimpressão). Impressão da saída não precisa de action (só abre a rota).

## UI / estilos
- `globals.css` (ou arquivo próprio) ganha um bloco `@media print` que **esconde a nav e tudo** exceto
  o `#ticket`, e a regra `@page`. A rota `/ticket` não usa o `AppNav` (layout próprio mínimo, sem
  `PageHeader`), então na tela ela aparece isolada e no papel sai limpa.
- Nome do motel: constante `MOTEL_NAME` em config (`src/lib/config.ts`), default "Motel Aconchego".

## RBAC
Reusa `stay:manage` (recepção + gerente) para ver/imprimir o ticket. Sem ação nova.

## Testes
- `getStayForTicket` retorna os campos certos (estadia + consumo + operador); respeita `stay:manage`.
- `TicketReceipt` renderiza (render de componente): mostra total, itens e desconto quando há;
  omite bloco de desconto quando `discountPercent=0`.
- Rota `/ticket/[id]` responde 200 pra estadia existente; 404/redirect pra inexistente.
- Auditoria: reimpressão gera `EventLog` `ticket.reprint`.
- Smoke: `@media print` esconde a nav (checar presença da classe/estrutura).

## Não-objetivos
ESC/POS/QZ Tray/corte automático/gaveta (seam pra depois) · impressão silenciosa sem diálogo ·
segunda via com marca d'água · logotipo/imagem no ticket · escolher impressora dentro do app ·
ticket de entrada (só saída).

## Decomposição (→ 2 planos)
1. `getStayForTicket` DAL + `TicketReceipt` layout + rota `/ticket/[id]` + `@media print` + testes.
2. Disparo na saída (popup + fallback) + botão reimpressão + `logTicketReprintAction` + auditoria + testes.

## Pontos confirmados
- `window.print()` 80mm via driver Windows. Dispara na saída + reimpressão. Lê a estadia fechada.
  Seam pra ESC/POS depois.
