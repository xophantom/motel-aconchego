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
2. **[Financeiro](2026-07-03-financeiro-design.md)** — contas/custos/faturamento; destrava relatórios.
3. **[Cancelamento](2026-07-03-cancelamento-design.md)** — cancelar entrada/saída com estorno.
4. **[Ticket térmico](2026-07-03-ticket-termico-design.md)** — comprovante 80mm na saída + reimpressão.
5. **[Reposição de estoque](2026-07-03-reposicao-estoque-design.md)** — entrada/ajuste com histórico.
6. **[Relatórios extras](2026-07-03-relatorios-extras-design.md)** — movimento, estadias&pedidos, bar, operador.

## Novas ações RBAC introduzidas
`audit:view` (gerente) · `finance:manage` (gerente) · `stay:cancel` (recepção+gerente, janela de turno)
· `stock:adjust` (recepção+gerente).

## Fora de escopo (o cliente/você descartou)
E-mail do relatório · despertador · métrica de tempo de limpeza · cadastro rico de cliente (só placa)
· ponto/folha/vale-transporte/combos.
