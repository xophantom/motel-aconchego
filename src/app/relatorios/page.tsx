import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { reportView, REPORT_TYPES } from '@/server/data/reports'
import { REPORT_LABELS, formatCell } from '@/lib/report-format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PageHeader } from '@/components/page-header'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function ReportBody({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection()
  const sp = await searchParams
  let view
  try { view = await reportView(sp) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/'); throw e }

  const qs = new URLSearchParams()
  qs.set('type', view.type)
  if (view.period.kind === 'month') { qs.set('year', String(view.period.year)); qs.set('month', String(view.period.month)) }
  else { qs.set('from', iso(view.period.from)); qs.set('to', iso(view.period.to)) }
  const q = qs.toString()

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle className="font-display">Relatório</CardTitle></CardHeader>
        <CardContent>
          <form method="GET" className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="type" className="text-xs">Tipo</Label>
              <NativeSelect id="type" name="type" defaultValue={view.type} className="w-52">
                {REPORT_TYPES.map((t) => <NativeSelectOption key={t} value={t}>{REPORT_LABELS[t]}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            {view.period.kind === 'month' ? (
              <>
                <div className="grid gap-1"><Label htmlFor="month" className="text-xs">Mês</Label><Input id="month" name="month" type="number" min="1" max="12" defaultValue={view.period.month} className="w-20" /></div>
                <div className="grid gap-1"><Label htmlFor="year" className="text-xs">Ano</Label><Input id="year" name="year" type="number" defaultValue={view.period.year} className="w-28" /></div>
              </>
            ) : (
              <>
                <div className="grid gap-1"><Label htmlFor="from" className="text-xs">De</Label><Input id="from" name="from" type="date" defaultValue={iso(view.period.from)} /></div>
                <div className="grid gap-1"><Label htmlFor="to" className="text-xs">Até</Label><Input id="to" name="to" type="date" defaultValue={iso(view.period.to)} /></div>
              </>
            )}
            <Button type="submit">Ver</Button>
            <Button asChild variant="outline"><a href={`/relatorios/csv?${q}`}>Baixar CSV</a></Button>
            <Button asChild variant="outline"><a href={`/relatorios/pdf?${q}`}>Baixar PDF</a></Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display">{view.title}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>{view.columns.map((c) => <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : undefined}>{c.label}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {view.rows.length === 0 && <TableRow><TableCell colSpan={view.columns.length} className="text-center text-sm text-muted-foreground">Sem dados no período.</TableCell></TableRow>}
              {view.rows.map((row, i) => (
                <TableRow key={i}>
                  {view.columns.map((c) => <TableCell key={c.key} className={`${c.align === 'right' ? 'text-right ' : ''}${c.kind === 'money' || c.kind === 'int' || c.kind === 'duration' ? 'tnum' : ''}`}>{formatCell(row[c.key], c.kind, 'screen')}</TableCell>)}
                </TableRow>
              ))}
              {view.total && (
                <TableRow className="border-t-2 border-primary/40 font-semibold">
                  {view.columns.map((c) => <TableCell key={c.key} className={`${c.align === 'right' ? 'text-right ' : ''}${c.kind === 'money' || c.kind === 'int' ? 'tnum' : ''}`}>{formatCell(view.total![c.key], c.kind, 'screen')}</TableCell>)}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function RelatoriosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Relatórios" subtitle="Ocupação, movimento, estadias, bar e operador — CSV ou PDF." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <ReportBody searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
