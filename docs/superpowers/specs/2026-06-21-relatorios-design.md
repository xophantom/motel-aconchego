# Spec — Relatórios (ocupação mensal por apto: tela + CSV + PDF)

Data: 2026-06-21 · Status: aprovado p/ planejamento

## Contexto
Quinta fatia do MotelAconchego. O cliente pediu "relatório mensal dos aptos — quantas vezes foram
locados, ticket médio — com botão de enviar por e-mail". Esta fatia entrega o **relatório de ocupação
mensal por apartamento** na tela + download **CSV** e **PDF**. O envio por **e-mail fica para a
próxima fatia** (provider a escolher). Base de dados: `stay` (já com `checkOut`, `stayAmount`,
`consumptionAmount`, `type`, `status`).

## Objetivos
- DAL `monthlyOccupancy(year, month)` — por apto, no mês.
- Builder puro `toCsv` (testável).
- Página `/relatorios` (gerente): seletor de mês + tabela + downloads.
- Route Handlers de download **CSV** e **PDF** (gateados a gerente).

## Não-objetivos
- **E-mail** (próxima fatia — Resend/SMTP).
- Quebra por dia / por operador / gráficos.

## Decisões (travadas)
- Relatório = **resumo mensal por apto** (nº locações, total estadia, ticket médio, total consumo) + totais.
- Base: estadias `type='room'`, `status='closed'`, `checkOut` dentro do mês. (Venda avulsa fora;
  consumo do quarto entra no total consumo.)
- Downloads via **Route Handlers** (caso certo para arquivos — primeiro uso de `/api`-style no app).
- PDF via **`@react-pdf/renderer`** (server-side `renderToBuffer`).

## DAL — `src/server/data/reports.ts` (`server-only`)
```ts
export type ReportRow = {
  roomNumber: string
  categoryCode: string | null
  rentals: number       // nº locações (checkouts no mês)
  totalStay: number     // Σ stayAmount
  totalConsumption: number  // Σ consumptionAmount
  avgTicket: number     // totalStay / rentals (0 se rentals=0)
}
export type MonthlyReport = {
  year: number
  month: number         // 1-12
  rows: ReportRow[]
  totals: { rentals: number; totalStay: number; totalConsumption: number; avgTicket: number }
}
export async function monthlyOccupancy(year: number, month: number): Promise<MonthlyReport>
```
- **report:view** (gerente). Janela: `[new Date(year, month-1, 1), new Date(year, month, 1))` sobre
  `checkOut`. Filtra `type='room'`, `status='closed'`. Agrupa por `roomNumber` (ordenado). `avgTicket`
  por linha = `totalStay/rentals`. `totals` = somatórios; `totals.avgTicket = totalStay/rentals` geral.

## Builder — `src/lib/report-csv.ts` (PURO, TDD)
```ts
export function toCsv(report: MonthlyReport): string
```
Cabeçalho `Apto;Categoria;Locações;Total estadia;Ticket médio;Total consumo`, uma linha por `row`,
linha final `TOTAL;...`. Decimais com 2 casas, separador `;` (Excel pt-BR), valores numéricos sem `R$`.

## PDF — `src/lib/report-pdf.tsx`
`buildReportPdf(report): Promise<Buffer>` usando `@react-pdf/renderer` (`renderToBuffer` de um
`<Document>` com uma tabela simples: título "Ocupação MM/AAAA", linhas por apto, totais).

## Route Handlers (gate: sessão + `report:view`)
- `src/app/relatorios/csv/route.ts` — `GET ?year=&month=` → `toCsv(...)`, `Content-Type: text/csv;
  charset=utf-8`, `Content-Disposition: attachment; filename="ocupacao-AAAA-MM.csv"`. Não-gerente → 403.
- `src/app/relatorios/pdf/route.ts` — `GET ?year=&month=` → `buildReportPdf(...)`, `application/pdf`,
  attachment. Não-gerente → 403.

## Página — `src/app/relatorios/page.tsx` (server, Suspense+`connection()`, gate via DAL `Forbidden`→`redirect('/')`)
- Seletor de **mês/ano** (form GET com `searchParams`; default mês corrente — lembrar: `searchParams`
  é `Promise` no Next 16, `await`).
- Tabela: Apto · Categoria · Locações · Total estadia · Ticket médio · Total consumo + linha TOTAL.
- Botões **Baixar CSV** / **Baixar PDF** → `/relatorios/csv?year=&month=` e `/relatorios/pdf?...`.
- Nav: link **Relatórios** na home (gerente).

## RBAC — `src/lib/rbac.ts`
Adicionar `Action` `'report:view'` (apenas **manager**).

## Testes
- reports DAL: agrupa por apto; conta só `type='room'` `closed` no mês (exclui walkin, abertas, outro
  mês); `avgTicket` e totais corretos; authz (recepção `Forbidden`).
- `toCsv`: cabeçalho + linhas + TOTAL; formatação 2 casas; separador `;`.
- route handlers: gerente → 200 + content-type/disposition certos; não-gerente → 403.
- PDF: `buildReportPdf` retorna `Buffer` não-vazio (smoke).
- build + smoke (`/relatorios`).

## Decomposição (ordem → 2 planos)
1. RBAC `report:view` + reports DAL + `toCsv` (TDD).
2. dep `@react-pdf/renderer` + `report-pdf` + route handlers CSV/PDF + `/relatorios` page + nav.

## Pontos confirmados
- Relatório = resumo mensal por apto (sem quebra diária).
- E-mail adiado para a próxima fatia.
- Downloads via Route Handlers; PDF via `@react-pdf/renderer`.
