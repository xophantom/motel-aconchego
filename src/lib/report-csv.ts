import type { MonthlyReport } from '@/server/data/reports'

export function toCsv(report: MonthlyReport): string {
  const n = (v: number) => v.toFixed(2)
  const header = 'Apto;Categoria;Locações;Total estadia;Ticket médio;Total consumo'
  const lines = report.rows.map((r) => [r.roomNumber, r.categoryCode ?? '', r.rentals, n(r.totalStay), n(r.avgTicket), n(r.totalConsumption)].join(';'))
  const total = ['TOTAL', '', report.totals.rentals, n(report.totals.totalStay), n(report.totals.avgTicket), n(report.totals.totalConsumption)].join(';')
  return [header, ...lines, total].join('\n')
}
