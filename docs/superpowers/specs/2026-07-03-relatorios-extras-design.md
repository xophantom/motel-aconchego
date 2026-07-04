# Spec — Relatórios extras (movimento, estadias, bar, operador)

Data: 2026-07-03 · Status: aprovado p/ planejamento

## Contexto
O legado tinha um catálogo de relatórios (movimento entradas/saídas, total de estadias/pedidos,
estatística do bar, por funcionário/operador, etc.). O app novo só tem **ocupação mensal por apto**
(`/relatorios` + CSV/PDF). Esta fatia adiciona os relatórios operacionais que faltam. (Faturamento e
contas por centro de custo ficam na fatia **Financeiro** — não se repetem aqui.)

Base: `src/server/data/reports.ts` (`monthlyOccupancy`) + Route Handlers `/relatorios/csv|pdf`
(`@react-pdf/renderer`) já estabelecem o padrão a reusar.

## Decisões (travadas)
- **Relatórios desta fatia (4):**
  1. **Movimento do período** — entradas (check-ins) e saídas (check-outs) entre duas datas: lista
     (quarto, entrada, saída, duração, estadia, consumo, total, operador) + totais.
  2. **Estadias & pedidos por período** — agregado: nº de estadias, total estadia, ticket médio, nº de
     vendas avulsas (pedido casa) e total de consumo, no período.
  3. **Produtos do bar** — consumo por produto num período: qtd vendida, receita, por categoria; + total.
  4. **Por operador** — no período, por funcionário que **recebeu**: nº de aptos, total recebido
     (estadia+consumo), ticket médio. (Mesma regra do caixa: conta por quem recebeu o pagamento.)
- **UI:** um seletor de relatório em `/relatorios` (a ocupação mensal vira uma das opções). Filtro de
  período por relatório (mês/ano para ocupação; de/até para os novos). Cada um com **CSV + PDF**.
- **RBAC:** tudo `report:view` (gerente), como já é.
- Sem persistência; tudo computado por query (igual `monthlyOccupancy`). Sem e-mail (descopado).

## DAL — `src/server/data/reports.ts` (adiciona)
Todas `report:view`, recebem período e retornam `{ rows, totals }` serializável (Decimal→number):
- `movementReport(from, to)` — estadias `room` com `checkIn` **ou** `checkOut` no período (marca se é
  entrada/saída/ambos), campos por linha acima. Ordena por horário.
- `staysOrdersReport(from, to)` — agregados de estadias `closed` (`type=room`) + vendas avulsas
  (`type=walkin`) no período.
- `barReport(from, to)` — agrupa `consumption` (join produto) por produto/categoria no período: soma
  `qty` e `qty*unitPrice`.
- `operatorReport(from, to)` — agrupa por `paymentEmployeeId` das estadias fechadas no período:
  contagem + soma recebida + ticket médio; junta nome do operador.
Helpers de data (início/fim do dia, clamp) reutilizados do módulo.

## Route Handlers — CSV/PDF
- Generaliza os handlers atuais: `/relatorios/csv` e `/relatorios/pdf` passam a aceitar `?type=<slug>`
  (`occupancy` default, `movement`, `stays_orders`, `bar`, `operator`) + os params de período. Cada
  `type` monta suas colunas. PDF reusa o componente base com título/colunas por tipo.
- Mantém compatibilidade: sem `type` → ocupação mensal (comportamento atual).

## UI — `/relatorios` (gerente)
- `PageHeader` "Relatórios" + um **select "Relatório"** (5 opções). Ao trocar, mostra o form de período
  adequado (GET) e a tabela correspondente. Botões **CSV**/**PDF** montam a URL com `type` + período.
- Tabelas com `.tnum`, linha TOTAL destacada (padrão já usado). Empty-state por relatório.
- Reusa a página atual; a ocupação mensal continua funcionando idêntica.

## RBAC
`report:view` (gerente) — sem ação nova.

## Testes
- Cada função de DAL com um cenário montado (fixtures) conferindo linhas e totais:
  `movementReport` separa entrada/saída no período; `staysOrdersReport` conta estadias vs avulsas;
  `barReport` soma por produto; `operatorReport` agrupa por quem recebeu (regra do pagamento).
- Route handlers: `?type=` inválido → 400/ocupação default; cada `type` responde 200 CSV/PDF; respeita
  `report:view`.
- Períodos-borda (mesmo dia; mês sem dados → totais zero).
- Build + smoke do seletor.

## Não-objetivos
Relatórios de folha/ponto (descartados) · faturamento e contas por CC (ficam no Financeiro) ·
gráficos/dashboards · agendamento/e-mail · relatório de situação em tempo real (o painel já é isso) ·
exportar Excel nativo (CSV basta).

## Decomposição (→ 2 planos)
1. DAL dos 4 relatórios em `reports.ts` + testes.
2. Generalização dos Route Handlers CSV/PDF por `type` + UI seletor em `/relatorios` + testes.

## Pontos confirmados
- 4 relatórios (movimento, estadias&pedidos, bar, operador). Computados. CSV/PDF por `type`. Gerente.
  Faturamento/CC no Financeiro.
