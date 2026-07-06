import type { ReportView } from '@/server/data/reports'
import { formatCell } from '@/lib/report-format'

export function toReportCsv(view: ReportView): string {
  const header = view.columns.map((c) => c.label).join(';')
  const line = (row: Record<string, unknown>) => view.columns.map((c) => formatCell(row[c.key], c.kind, 'csv')).join(';')
  const body = view.rows.map(line)
  const lines = [header, ...body]
  if (view.total) lines.push(line(view.total))
  return lines.join('\n')
}
