import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { monthlyOccupancy } from '@/server/data/reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/page-header'

const money = (n: number) => `R$ ${n.toFixed(2)}`

async function Report({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  await connection()
  const sp = await searchParams
  const now = new Date()
  const year = Number(sp.year) || now.getFullYear()
  const month = Number(sp.month) || now.getMonth() + 1
  let rep
  try { rep = await monthlyOccupancy(year, month) } catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/'); throw e }
  const qs = `year=${year}&month=${month}`
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle className="font-display">Ocupação {String(month).padStart(2, '0')}/{year}</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <form method="GET" className="flex items-end gap-2">
            <div className="grid gap-1"><Label htmlFor="month">Mês</Label><Input id="month" name="month" type="number" min="1" max="12" defaultValue={month} className="w-20" /></div>
            <div className="grid gap-1"><Label htmlFor="year">Ano</Label><Input id="year" name="year" type="number" defaultValue={year} className="w-28" /></div>
            <Button type="submit">Ver</Button>
            <Button asChild variant="outline"><a href={`/relatorios/csv?${qs}`}>Baixar CSV</a></Button>
            <Button asChild variant="outline"><a href={`/relatorios/pdf?${qs}`}>Baixar PDF</a></Button>
          </form>
          <Table>
            <TableHeader><TableRow><TableHead>Apto</TableHead><TableHead>Categoria</TableHead><TableHead>Locações</TableHead><TableHead>Total estadia</TableHead><TableHead>Ticket médio</TableHead><TableHead>Total consumo</TableHead></TableRow></TableHeader>
            <TableBody>
              {rep.rows.map((r) => (
                <TableRow key={r.roomNumber}>
                  <TableCell className="tnum font-medium">{r.roomNumber}</TableCell><TableCell>{r.categoryCode ?? '—'}</TableCell>
                  <TableCell className="tnum">{r.rentals}</TableCell><TableCell className="tnum">{money(r.totalStay)}</TableCell>
                  <TableCell className="tnum">{money(r.avgTicket)}</TableCell><TableCell className="tnum">{money(r.totalConsumption)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-primary/40 font-semibold">
                <TableCell className="font-display">TOTAL</TableCell><TableCell></TableCell><TableCell className="tnum">{rep.totals.rentals}</TableCell>
                <TableCell className="tnum">{money(rep.totals.totalStay)}</TableCell><TableCell className="tnum">{money(rep.totals.avgTicket)}</TableCell>
                <TableCell className="tnum">{money(rep.totals.totalConsumption)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function RelatoriosPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Relatórios" subtitle="Ocupação mensal por apartamento. Baixe em CSV ou PDF." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Report searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
