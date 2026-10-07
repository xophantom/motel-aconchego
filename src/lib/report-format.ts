import { MOTEL_TZ } from '@/lib/time'

export type CellKind = 'text' | 'int' | 'money' | 'datetime' | 'duration' | 'yesno'
export type ReportColumn = { key: string; label: string; kind: CellKind; align?: 'right' }

export const REPORT_LABELS: Record<string, string> = {
  occupancy: 'Ocupação mensal',
  movement: 'Movimento do período',
  stays_orders: 'Estadias & pedidos',
  bar: 'Produtos do bar',
  operator: 'Por operador',
}

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dtm = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: MOTEL_TZ })

export function formatCell(value: unknown, kind: CellKind, style: 'csv' | 'screen' | 'pdf'): string {
  if (value == null || value === '') return style === 'screen' ? '—' : ''
  switch (kind) {
    case 'money': {
      const n = Number(value)
      return style === 'screen' ? `R$ ${brl(n)}` : n.toFixed(2)
    }
    case 'int':
      return String(Math.trunc(Number(value)))
    case 'datetime': {
      const d = value instanceof Date ? value : new Date(String(value))
      return dtm(d)
    }
    case 'duration': {
      const min = Number(value)
      return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
    }
    case 'yesno':
      return value ? 'Sim' : (style === 'screen' ? '—' : '')
    default:
      return String(value)
  }
}
