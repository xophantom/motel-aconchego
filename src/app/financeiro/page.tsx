import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listEntries, listCostCenters, statementRange, costCenterMonthly } from '@/server/data/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PageHeader } from '@/components/page-header'
import { EntryForm, EntryRowActions, CostCenterForm, DeleteCostCenter } from './finance-forms'
import { civilDate, civilIso, parseCivilDate, todayCivil } from '@/lib/time'

const money = (n: number) => `R$ ${n.toFixed(2)}`
// filters and @db.Date values are civil dates (UTC midnight)
const iso = civilIso
const dbIso = civilIso

async function Finance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection()
  const sp = await searchParams
  const today = todayCivil()
  const from = parseCivilDate(sp.from) ?? civilDate(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)
  const to = parseCivilDate(sp.to) ?? today
  const fromStr = iso(from), toStr = iso(to)
  const costCenterFilter = sp.costCenter || undefined

  let entries, centers, range, monthly
  try {
    ;[entries, centers, range, monthly] = await Promise.all([
      listEntries({ from, to, costCenter: costCenterFilter }),
      listCostCenters(),
      statementRange(from, to),
      costCenterMonthly(from.getUTCFullYear(), from.getUTCMonth() + 1),
    ])
  } catch (e) {
    if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/')
    throw e
  }

  const qs = `from=${fromStr}&to=${toStr}`
  const centerOptions = centers.map((c) => ({ code: c.code, description: c.description }))

  return (
    <div className="grid gap-6">
      {/* Section 1: entries */}
      <Card>
        <CardHeader><CardTitle className="font-display">Lançar conta</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <EntryForm centers={centerOptions} />
          <form method="GET" className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="grid gap-1"><Label htmlFor="from" className="text-xs">De</Label><Input id="from" name="from" type="date" defaultValue={fromStr} /></div>
            <div className="grid gap-1"><Label htmlFor="to" className="text-xs">Até</Label><Input id="to" name="to" type="date" defaultValue={toStr} /></div>
            <div className="grid gap-1">
              <Label htmlFor="costCenter" className="text-xs">Centro</Label>
              <NativeSelect id="costCenter" name="costCenter" defaultValue={costCenterFilter ?? ''} className="w-40">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {centers.map((c) => <NativeSelectOption key={c.code} value={c.code}>{c.code}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <Button type="submit" variant="outline">Filtrar</Button>
          </form>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Centro</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {entries.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Nenhum lançamento no período.</TableCell></TableRow>}
              {entries.map((e) => (
                <TableRow key={String(e.id)}>
                  <TableCell className="tnum">{dbIso(e.entryDate)}</TableCell>
                  <TableCell>{e.kind === 'income' ? 'Receita' : 'Despesa'}</TableCell>
                  <TableCell>{e.costCenter ?? '—'}</TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell className={`tnum text-right font-medium ${e.kind === 'income' ? 'text-[var(--room-free)]' : 'text-destructive'}`}>{e.kind === 'income' ? '+' : '−'}{money(e.amount)}</TableCell>
                  <TableCell className="text-right"><EntryRowActions id={String(e.id)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 2: cost centers */}
      <Card>
        <CardHeader><CardTitle className="font-display">Centros de custo</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <CostCenterForm />
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Lançamentos</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {centers.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Nenhum centro ainda.</TableCell></TableRow>}
              {centers.map((c) => (
                <TableRow key={c.code}>
                  <TableCell className="font-medium">{c.code}</TableCell>
                  <TableCell>{c.description}</TableCell>
                  <TableCell className="tnum text-right">{c.entryCount}</TableCell>
                  <TableCell className="text-right"><DeleteCostCenter code={c.code} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 3: faturamento */}
      <Card>
        <CardHeader><CardTitle className="font-display">Faturamento <span className="text-sm font-normal text-muted-foreground">{fromStr} → {toStr}</span></CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><a href={`/financeiro/csv?${qs}`}>Baixar CSV</a></Button>
            <Button asChild variant="outline" size="sm"><a href={`/financeiro/pdf?${qs}`}>Baixar PDF</a></Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead className="text-right">Estadias</TableHead><TableHead className="text-right">Consumo</TableHead><TableHead className="text-right">Caixa+</TableHead><TableHead className="text-right">Caixa−</TableHead><TableHead className="text-right">Despesas</TableHead><TableHead className="text-right">Receitas</TableHead><TableHead className="text-right">Líquido</TableHead></TableRow></TableHeader>
            <TableBody>
              {range.days.map((d) => (
                <TableRow key={d.date}>
                  <TableCell className="tnum">{d.date}</TableCell>
                  <TableCell className="tnum text-right">{money(d.stays)}</TableCell>
                  <TableCell className="tnum text-right">{money(d.consumption)}</TableCell>
                  <TableCell className="tnum text-right">{money(d.cashIn)}</TableCell>
                  <TableCell className="tnum text-right">{money(d.cashOut)}</TableCell>
                  <TableCell className="tnum text-right text-destructive">{money(d.expenses)}</TableCell>
                  <TableCell className="tnum text-right text-[var(--room-free)]">{money(d.income)}</TableCell>
                  <TableCell className="tnum text-right font-semibold">{money(d.net)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-primary/40 font-semibold">
                <TableCell className="font-display">TOTAL</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.stays)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.consumption)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.cashIn)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.cashOut)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.expenses)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.income)}</TableCell>
                <TableCell className="tnum text-right">{money(range.totals.net)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <h3 className="mt-2 font-display text-sm">Por centro de custo — {String(monthly.month).padStart(2, '0')}/{monthly.year}</h3>
          <Table>
            <TableHeader><TableRow><TableHead>Centro</TableHead><TableHead className="text-right">Receitas</TableHead><TableHead className="text-right">Despesas</TableHead><TableHead className="text-right">Líquido</TableHead></TableRow></TableHeader>
            <TableBody>
              {monthly.rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Sem lançamentos no mês.</TableCell></TableRow>}
              {monthly.rows.map((r) => (
                <TableRow key={r.code ?? '—'}>
                  <TableCell>{r.code ? `${r.code} · ${r.description ?? ''}` : 'Sem centro'}</TableCell>
                  <TableCell className="tnum text-right text-[var(--room-free)]">{money(r.income)}</TableCell>
                  <TableCell className="tnum text-right text-destructive">{money(r.expense)}</TableCell>
                  <TableCell className="tnum text-right font-medium">{money(r.net)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-primary/40 font-semibold">
                <TableCell className="font-display">TOTAL</TableCell>
                <TableCell className="tnum text-right">{money(monthly.totals.income)}</TableCell>
                <TableCell className="tnum text-right">{money(monthly.totals.expense)}</TableCell>
                <TableCell className="tnum text-right">{money(monthly.totals.net)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function FinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Financeiro" subtitle="Contas por centro de custo e faturamento diário consolidado." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Finance searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
