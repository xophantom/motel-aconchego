import 'server-only'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { MonthlyReport } from '@/server/data/reports'

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 10 },
  title: { fontSize: 14, marginBottom: 12 },
  row: { flexDirection: 'row', borderBottom: '1 solid #ccc', paddingVertical: 3 },
  head: { flexDirection: 'row', borderBottom: '1 solid #000', paddingVertical: 3, fontWeight: 'bold' },
  c: { flex: 1 }, cNum: { flex: 1, textAlign: 'right' },
})
const money = (n: number) => `R$ ${n.toFixed(2)}`

export function buildReportPdf(report: MonthlyReport): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Ocupação {String(report.month).padStart(2, '0')}/{report.year}</Text>
        <View style={s.head}>
          <Text style={s.c}>Apto</Text><Text style={s.c}>Cat</Text><Text style={s.cNum}>Locações</Text>
          <Text style={s.cNum}>Estadia</Text><Text style={s.cNum}>Ticket méd.</Text><Text style={s.cNum}>Consumo</Text>
        </View>
        {report.rows.map((r) => (
          <View key={r.roomNumber} style={s.row}>
            <Text style={s.c}>{r.roomNumber}</Text><Text style={s.c}>{r.categoryCode ?? '—'}</Text>
            <Text style={s.cNum}>{r.rentals}</Text><Text style={s.cNum}>{money(r.totalStay)}</Text>
            <Text style={s.cNum}>{money(r.avgTicket)}</Text><Text style={s.cNum}>{money(r.totalConsumption)}</Text>
          </View>
        ))}
        <View style={s.head}>
          <Text style={s.c}>TOTAL</Text><Text style={s.c}></Text><Text style={s.cNum}>{report.totals.rentals}</Text>
          <Text style={s.cNum}>{money(report.totals.totalStay)}</Text><Text style={s.cNum}>{money(report.totals.avgTicket)}</Text>
          <Text style={s.cNum}>{money(report.totals.totalConsumption)}</Text>
        </View>
      </Page>
    </Document>
  )
  return renderToBuffer(doc)
}
