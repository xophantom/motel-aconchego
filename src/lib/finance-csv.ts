import type { StatementRange } from '@/server/data/finance'

export function toFinanceCsv(range: StatementRange): string {
  const n = (v: number) => v.toFixed(2)
  const header = 'Data;Estadias;Consumo;Caixa entra;Caixa sai;Despesas;Receitas;Líquido'
  const lines = range.days.map((d) =>
    [d.date, n(d.stays), n(d.consumption), n(d.cashIn), n(d.cashOut), n(d.expenses), n(d.income), n(d.net)].join(';'))
  const t = range.totals
  const total = ['TOTAL', n(t.stays), n(t.consumption), n(t.cashIn), n(t.cashOut), n(t.expenses), n(t.income), n(t.net)].join(';')
  return [header, ...lines, total].join('\n')
}
