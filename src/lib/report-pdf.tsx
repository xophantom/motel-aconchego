import 'server-only'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { ReportView } from '@/server/data/reports'
import { formatCell } from '@/lib/report-format'

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9 },
  title: { fontSize: 14, marginBottom: 12 },
  row: { flexDirection: 'row', borderBottom: '1 solid #ccc', paddingVertical: 3 },
  head: { flexDirection: 'row', borderBottom: '1 solid #000', paddingVertical: 3, fontWeight: 'bold' },
  cell: { flex: 1 }, cellRight: { flex: 1, textAlign: 'right' },
})

export function buildReportPdf(view: ReportView): Promise<Buffer> {
  const cellStyle = (align?: 'right') => (align === 'right' ? s.cellRight : s.cell)
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{view.title}</Text>
        <View style={s.head}>
          {view.columns.map((c) => <Text key={c.key} style={cellStyle(c.align)}>{c.label}</Text>)}
        </View>
        {view.rows.map((row, i) => (
          <View key={i} style={s.row}>
            {view.columns.map((c) => <Text key={c.key} style={cellStyle(c.align)}>{formatCell(row[c.key], c.kind, 'pdf')}</Text>)}
          </View>
        ))}
        {view.total && (
          <View style={s.head}>
            {view.columns.map((c) => <Text key={c.key} style={cellStyle(c.align)}>{formatCell(view.total![c.key], c.kind, 'pdf')}</Text>)}
          </View>
        )}
      </Page>
    </Document>
  )
  return renderToBuffer(doc)
}
