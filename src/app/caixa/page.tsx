import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { currentShiftSummary, listClosedShifts, shiftLines, shiftReport, type ShiftMetrics, type ShiftReportLine } from '@/server/data/shifts'
import { getCashPolicy } from '@/server/data/cash-policy'
import { getCurrentUser } from '@/server/session'
import { formatDayHm, formatHm } from '@/lib/time'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { CloseShiftForm, MovementForm } from './caixa-forms'
import { CashPolicyForm } from './policy-form'

const money = (n: number) => `R$ ${n.toFixed(2)}`
const periodLabel = (p: string) => (p === 'day_07_19' ? 'Diurno (07–19)' : 'Noturno (19–07)')
const dateLabel = (d: Date) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
const MOVE_LABEL: Record<string, string> = { stay: 'Estadia', consumption: 'Consumo', withdrawal: 'Retirada', supply: 'Suprimento', correction: 'Correção' }

type SelectedShift = { id: string; period: string; businessDate: Date; open: boolean; lines: ShiftReportLine[]; metrics: ShiftMetrics }

function parseShiftId(v: string | undefined): bigint | null {
  return v && /^\d+$/.test(v) ? BigInt(v) : null
}

async function Caixa({ searchParams }: { searchParams: Promise<{ turno?: string }> }) {
  await connection()
  const me = await getCurrentUser()
  const requested = parseShiftId((await searchParams).turno)
  let summary, closed, policy
  try { ;[summary, closed, policy] = await Promise.all([currentShiftSummary(), listClosedShifts(10), getCashPolicy()]) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/'); throw e }
  const isManager = me?.role === 'manager'
  const openShift = summary.shift

  // Which shift's stays to list: the one picked in the history, else the open one.
  let selected: SelectedShift = { id: String(openShift.id), period: openShift.period, businessDate: openShift.businessDate, open: true, lines: [], metrics: summary.metrics }
  if (requested != null && requested !== openShift.id) {
    const rep = await shiftReport(requested).catch(() => null)
    if (rep) selected = { id: rep.shift.id, period: rep.shift.period, businessDate: rep.shift.businessDate, open: !rep.shift.closedAt, lines: rep.lines, metrics: rep.metrics }
  }
  if (selected.id === String(openShift.id)) selected.lines = await shiftLines(openShift.id)
  const isCurrent = selected.id === String(openShift.id)

  const m = summary.metrics
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Caixa aberto — {periodLabel(openShift.period)} · {dateLabel(openShift.businessDate)}</CardTitle>
          <CardDescription>Aberto em {formatDayHm(openShift.openedAt)} · continua aberto até alguém fechar.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric label="Nº aptos" value={String(m.nAptos)} />
            <Metric label="Ticket médio" value={money(m.ticketMedio)} />
            <Metric label="Estadias" value={money(m.totalEstadias)} />
            <Metric label="Consumo" value={money(m.totalConsumo)} />
            <Metric label="Retirado dinheiro" value={money(m.retiradoDinheiro)} />
            <Metric label="Retirado cartão" value={money(m.retiradoCartao)} />
            <Metric label="Saldo" value={money(m.saldo)} />
          </div>
          {m.openingDifference !== 0 && (
            <p className="text-sm text-destructive">⚠ Diferença de abertura: {money(m.openingDifference)} (vs. fundo esperado da manhã)</p>
          )}
          <div className="grid gap-2 border-t pt-3">
            <MovementForm type="withdrawal" label="Retirada" canUse />
            <MovementForm type="supply" label="Suprimento" canUse />
            <MovementForm type="correction" label="Correção" canUse={isManager} />
          </div>
          <div className="border-t pt-3"><CloseShiftForm shiftId={String(openShift.id)} saldo={m.saldo} /></div>
        </CardContent>
      </Card>
      <ShiftStaysCard shift={selected} isCurrent={isCurrent} />
      <Card>
        <CardHeader><CardTitle>Movimentos do turno</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Hora</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Descrição</TableHead></TableRow></TableHeader>
            <TableBody>
              {summary.movements.map((mv) => (
                <TableRow key={String(mv.id)}>
                  <TableCell className="tnum text-muted-foreground">{formatHm(mv.occurredAt)}</TableCell>
                  <TableCell>{MOVE_LABEL[mv.type] ?? mv.type}{mv.method ? ` · ${mv.method === 'cash' ? 'dinheiro' : 'cartão'}` : ''}</TableCell>
                  <TableCell className="tnum font-medium">{money(Number(mv.amount))}</TableCell>
                  <TableCell className="text-muted-foreground">{mv.description ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {isManager && <CashPolicyCard value={policy.expectedOpeningBalance} />}
      <ClosedHistory closed={closed} selectedId={selected.id} />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tnum mt-0.5 font-display text-xl font-bold">{value}</div>
    </div>
  )
}

// Apto-a-apto list of the shift (stays closed in it), with the totals underneath.
function ShiftStaysCard({ shift, isCurrent }: { shift: SelectedShift; isCurrent: boolean }) {
  const { lines, metrics: m } = shift
  const sum = (f: (l: ShiftReportLine) => number) => lines.reduce((a, l) => a + f(l), 0)
  const totEstadia = sum((l) => l.stayAmount)
  const totConsumo = sum((l) => l.consumptionAmount)
  return (
    <Card id="aptos" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>Aptos do turno</CardTitle>
        <CardDescription>
          {periodLabel(shift.period)} · {dateLabel(shift.businessDate)} · {shift.open ? 'em aberto' : 'fechado'}
        </CardDescription>
        <CardAction className="flex gap-2">
          {!isCurrent && <Button asChild size="sm" variant="ghost"><Link href="/caixa">Turno atual</Link></Button>}
          <Button asChild size="sm" variant="outline"><a href={`/caixa/turno/${shift.id}`}>Imprimir</a></Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma saída registrada neste turno ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Apto</TableHead><TableHead>Entrada</TableHead><TableHead>Saída</TableHead>
                <TableHead className="text-right">Estadia</TableHead><TableHead className="text-right">Consumo</TableHead><TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="tnum font-medium">{l.walkin ? 'Avulso' : l.room}</TableCell>
                  <TableCell className="tnum text-muted-foreground">{l.walkin ? '—' : formatHm(l.checkIn)}</TableCell>
                  <TableCell className="tnum text-muted-foreground">{formatHm(l.checkOut)}</TableCell>
                  <TableCell className="tnum text-right">{money(l.stayAmount)}</TableCell>
                  <TableCell className="tnum text-right">{money(l.consumptionAmount)}</TableCell>
                  <TableCell className="tnum text-right font-medium">{money(l.stayAmount + l.consumptionAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">Total · {m.nAptos} {m.nAptos === 1 ? 'apto' : 'aptos'}</TableCell>
                <TableCell className="tnum text-right font-semibold">{money(totEstadia)}</TableCell>
                <TableCell className="tnum text-right font-semibold">{money(totConsumo)}</TableCell>
                <TableCell className="tnum text-right font-display text-base font-bold">{money(totEstadia + totConsumo)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
        <div className="mt-4 grid gap-1 border-t pt-3 text-sm">
          <SummaryRow label="Retirado em dinheiro" value={money(m.retiradoDinheiro)} />
          <SummaryRow label="Retirado em cartão" value={money(m.retiradoCartao)} />
          <SummaryRow label={shift.open ? 'Saldo atual' : 'Saldo no fechamento'} value={money(m.saldo)} strong />
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className={`tnum ${strong ? 'font-display text-base font-bold' : ''}`}>{value}</span>
    </div>
  )
}

function CashPolicyCard({ value }: { value: number }) {
  return (
    <Card>
      <CardHeader><CardTitle>Fundo de caixa</CardTitle></CardHeader>
      <CardContent><CashPolicyForm value={value} /></CardContent>
    </Card>
  )
}

function ClosedHistory({ closed, selectedId }: { closed: Awaited<ReturnType<typeof listClosedShifts>>; selectedId?: string }) {
  if (!closed.length) return null
  return (
    <Card>
      <CardHeader><CardTitle>Histórico de turnos</CardTitle><CardDescription>Toque num turno para ver os aptos.</CardDescription></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Período</TableHead><TableHead>Nº aptos</TableHead><TableHead>Estadias</TableHead><TableHead>Saldo</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {closed.map(({ shift, metrics }) => {
              const id = String(shift.id)
              return (
                <TableRow key={id} data-state={id === selectedId ? 'selected' : undefined}>
                  <TableCell>{dateLabel(shift.businessDate)}</TableCell>
                  <TableCell>{periodLabel(shift.period)}</TableCell>
                  <TableCell>{metrics.nAptos}</TableCell>
                  <TableCell>{money(metrics.totalEstadias)}</TableCell>
                  <TableCell>{money(metrics.saldo)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost"><Link href={`/caixa?turno=${id}#aptos`}>Ver aptos</Link></Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export default function CaixaPage({ searchParams }: { searchParams: Promise<{ turno?: string }> }) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Caixa" subtitle="Turno automático por horário. Registre retiradas e feche o caixa." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Caixa searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
