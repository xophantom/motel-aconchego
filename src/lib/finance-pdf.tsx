import 'server-only'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { StatementRange } from '@/server/data/finance'

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9 },
  title: { fontSize: 14, marginBottom: 12 },
  row: { flexDirection: 'row', borderBottom: '1 solid #ccc', paddingVertical: 3 },
  head: { flexDirection: 'row', borderBottom: '1 solid #000', paddingVertical: 3, fontWeight: 'bold' },
  c: { flex: 1 }, cNum: { flex: 1, textAlign: 'right' },
})
const money = (n: number) => n.toFixed(2)

export function buildFinancePdf(range: StatementRange, label: string): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Faturamento {label}</Text>
        <View style={s.head}>
          <Text style={s.c}>Data</Text><Text style={s.cNum}>Estadias</Text><Text style={s.cNum}>Consumo</Text>
          <Text style={s.cNum}>Caixa+</Text><Text style={s.cNum}>Caixa−</Text><Text style={s.cNum}>Despesas</Text>
          <Text style={s.cNum}>Receitas</Text><Text style={s.cNum}>Líquido</Text>
        </View>
        {range.days.map((d) => (
          <View key={d.date} style={s.row}>
            <Text style={s.c}>{d.date}</Text><Text style={s.cNum}>{money(d.stays)}</Text><Text style={s.cNum}>{money(d.consumption)}</Text>
            <Text style={s.cNum}>{money(d.cashIn)}</Text><Text style={s.cNum}>{money(d.cashOut)}</Text><Text style={s.cNum}>{money(d.expenses)}</Text>
            <Text style={s.cNum}>{money(d.income)}</Text><Text style={s.cNum}>{money(d.net)}</Text>
          </View>
        ))}
        <View style={s.head}>
          <Text style={s.c}>TOTAL</Text><Text style={s.cNum}>{money(range.totals.stays)}</Text><Text style={s.cNum}>{money(range.totals.consumption)}</Text>
          <Text style={s.cNum}>{money(range.totals.cashIn)}</Text><Text style={s.cNum}>{money(range.totals.cashOut)}</Text><Text style={s.cNum}>{money(range.totals.expenses)}</Text>
          <Text style={s.cNum}>{money(range.totals.income)}</Text><Text style={s.cNum}>{money(range.totals.net)}</Text>
        </View>
      </Page>
    </Document>
  )
  return renderToBuffer(doc)
}
