# Índice — Módulos pendentes (paridade com o legado)

Data: 2026-07-03

Specs das features que faltavam do escopo original (`../../../../MotelAc/docs/analise/06-inventario-paridade.md`
+ `08-decisoes-migracao.md`). Cada um é independente: spec → plano → build.

## Decisões travadas (valem p/ todos)
- **Ticket térmico:** `window.print()` 80mm via driver Windows (seam pra QZ Tray/ESC/POS depois).
- **Financeiro:** completo — contas + centros de custo + faturamento diário (computado).
- **Auditoria:** grava tudo (best-effort, sem RBAC na gravação) + tela `/auditoria` (gerente).
- **Cancelamento:** Gerente sempre; Recepção só com o turno/caixa aberto; estorno (não deleção).

## Ordem de build recomendada
1. ~~**[Auditoria](2026-07-03-auditoria-design.md)**~~ — ✅ **feito** (2026-07-04). Fundação `logEvent` + retrofit das mutações + tela `/auditoria` + `audit:view`. Planos: `../plans/2026-07-04-auditoria-fundacao.md`, `../plans/2026-07-04-auditoria-tela.md`.
2. ~~**[Financeiro](2026-07-03-financeiro-design.md)**~~ — ✅ **feito** (2026-07-04). Contas + centros de custo + faturamento computado (`net` = caixa + contas) + CSV/PDF + `finance:manage`. Planos: `../plans/2026-07-04-financeiro-1-contas-centros.md`, `-2-faturamento.md`, `-3-ui.md`.
3. ~~**[Cancelamento](2026-07-03-cancelamento-design.md)**~~ — ✅ **feito** (2026-07-04). Cancelar entrada/saída com estorno (movimento oposto), janela de turno p/ recepção, motivo obrigatório, `stay:cancel`. Planos: `../plans/2026-07-04-cancelamento-1-dal.md`, `-2-ui.md`.
4. ~~**[Ticket térmico](2026-07-03-ticket-termico-design.md)**~~ — ✅ **feito** (2026-07-06). Recibo 80mm `window.print()` na saída (popup+fallback) + reimpressão (`ticket.reprint`). Rota `/ticket/[id]`. Planos: `../plans/2026-07-06-ticket-1-layout-rota.md`, `-2-disparo-reimpressao.md`.
5. **[Reposição de estoque](2026-07-03-reposicao-estoque-design.md)** — entrada/ajuste com histórico.
6. **[Relatórios extras](2026-07-03-relatorios-extras-design.md)** — movimento, estadias&pedidos, bar, operador.

## Novas ações RBAC introduzidas
`audit:view` (gerente) · `finance:manage` (gerente) · `stay:cancel` (recepção+gerente, janela de turno)
· `stock:adjust` (recepção+gerente).

## Fora de escopo (o cliente/você descartou)
E-mail do relatório · despertador · métrica de tempo de limpeza · cadastro rico de cliente (só placa)
· ponto/folha/vale-transporte/combos.
