import { describe, it, expect } from 'vitest'
import { toReportCsv } from '@/lib/report-csv'
import type { ReportView } from '@/server/data/reports'

const view: ReportView = {
  type: 'occupancy',
  title: 'Ocupação 06/2026',
  columns: [
    { key: 'roomNumber', label: 'Apto', kind: 'text' },
    { key: 'categoryCode', label: 'Categoria', kind: 'text' },
    { key: 'rentals', label: 'Locações', kind: 'int', align: 'right' },
    { key: 'totalStay', label: 'Total estadia', kind: 'money', align: 'right' },
    { key: 'avgTicket', label: 'Ticket médio', kind: 'money', align: 'right' },
    { key: 'totalConsumption', label: 'Total consumo', kind: 'money', align: 'right' },
  ],
  rows: [
    { roomNumber: '01', categoryCode: 'C', rentals: 2, totalStay: 150, avgTicket: 75, totalConsumption: 20 },
    { roomNumber: '02', categoryCode: 'A', rentals: 1, totalStay: 100, avgTicket: 100, totalConsumption: 0 },
  ],
  total: { roomNumber: 'TOTAL', rentals: 3, totalStay: 250, avgTicket: 83.33, totalConsumption: 20 },
  period: { kind: 'month', year: 2026, month: 6 },
}

describe('toReportCsv', () => {
  it('has the header, one line per row, and a TOTAL line', () => {
    const lines = toReportCsv(view).split('\n')
    expect(lines[0]).toBe('Apto;Categoria;Locações;Total estadia;Ticket médio;Total consumo')
    expect(lines[1]).toBe('01;C;2;150.00;75.00;20.00')
    expect(lines[2]).toBe('02;A;1;100.00;100.00;0.00')
    expect(lines[3]).toBe('TOTAL;;3;250.00;83.33;20.00')
  })
})
