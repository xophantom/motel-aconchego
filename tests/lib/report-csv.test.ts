import { describe, it, expect } from 'vitest'
import { toCsv } from '@/lib/report-csv'
import type { MonthlyReport } from '@/server/data/reports'

const report: MonthlyReport = {
  year: 2026, month: 6,
  rows: [
    { roomNumber: '01', categoryCode: 'C', rentals: 2, totalStay: 150, totalConsumption: 20, avgTicket: 75 },
    { roomNumber: '02', categoryCode: 'A', rentals: 1, totalStay: 100, totalConsumption: 0, avgTicket: 100 },
  ],
  totals: { rentals: 3, totalStay: 250, totalConsumption: 20, avgTicket: 83.33 },
}

describe('toCsv', () => {
  it('has the header, one line per row, and a TOTAL line', () => {
    const lines = toCsv(report).split('\n')
    expect(lines[0]).toBe('Apto;Categoria;Locações;Total estadia;Ticket médio;Total consumo')
    expect(lines[1]).toBe('01;C;2;150.00;75.00;20.00')
    expect(lines[2]).toBe('02;A;1;100.00;100.00;0.00')
    expect(lines[3]).toBe('TOTAL;;3;250.00;83.33;20.00')
  })
})
