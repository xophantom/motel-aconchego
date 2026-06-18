import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { currentShiftSummary, listClosedShifts } from '@/server/data/shifts'
import { getCurrentUser } from '@/server/session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { OpenShiftForm, CloseShiftForm, MovementForm } from './caixa-forms'

const money = (n: number) => `R$ ${n.toFixed(2)}`
const periodLabel = (p: string) => (p === 'day_07_19' ? 'Diurno (07–19)' : 'Noturno (19–07)')

async function Caixa() {
  await connection()
  const me = await getCurrentUser()
  let summary, closed
  try { summary = await currentShiftSummary(); closed = await listClosedShifts(10) } catch { redirect('/') }
  if (!summary.shift) {
    return (
      <div className="grid gap-6">
        <Card><CardHeader><CardTitle>Caixa fechado</CardTitle></CardHeader><CardContent><OpenShiftForm /></CardContent></Card>
        <ClosedHistory closed={closed} />
      </div>
    )
  }
  const m = summary.metrics!
  const isManager = me?.role === 'manager'
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle>Caixa aberto — {periodLabel(summary.shift.period)}</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric label="Nº aptos" value={String(m.nAptos)} />
            <Metric label="Ticket médio" value={money(m.ticketMedio)} />
            <Metric label="Estadias" value={money(m.totalEstadias)} />
            <Metric label="Sangrias" value={money(m.totalSangrias)} />
            <Metric label="Suprimentos" value={money(m.totalSuprimentos)} />
            <Metric label="Saldo" value={money(m.saldo)} />
          </div>
          <div className="grid gap-2 border-t pt-3">
            <MovementForm type="withdrawal" label="Sangria" canUse />
            <MovementForm type="supply" label="Suprimento" canUse />
            <MovementForm type="correction" label="Correção" canUse={isManager} />
          </div>
          <div className="border-t pt-3"><CloseShiftForm shiftId={String(summary.shift.id)} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Movimentos do turno</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Hora</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Descrição</TableHead></TableRow></TableHeader>
            <TableBody>
              {summary.movements.map((mv) => (
                <TableRow key={String(mv.id)}>
                  <TableCell>{new Date(mv.occurredAt).toLocaleTimeString('pt-BR')}</TableCell>
                  <TableCell>{mv.type}</TableCell>
                  <TableCell>{money(Number(mv.amount))}</TableCell>
                  <TableCell>{mv.description ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ClosedHistory closed={closed} />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>
}

function ClosedHistory({ closed }: { closed: Awaited<ReturnType<typeof listClosedShifts>> }) {
  if (!closed.length) return null
  return (
    <Card>
      <CardHeader><CardTitle>Histórico de turnos</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Período</TableHead><TableHead>Nº aptos</TableHead><TableHead>Estadias</TableHead><TableHead>Saldo</TableHead></TableRow></TableHeader>
          <TableBody>
            {closed.map(({ shift, metrics }) => (
              <TableRow key={String(shift.id)}>
                <TableCell>{new Date(shift.businessDate).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell>{periodLabel(shift.period)}</TableCell>
                <TableCell>{metrics.nAptos}</TableCell>
                <TableCell>{money(metrics.totalEstadias)}</TableCell>
                <TableCell>{money(metrics.saldo)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export default function CaixaPage() {
  return (
    <main className="mx-auto mt-8 max-w-4xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Caixa</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Caixa />
      </Suspense>
    </main>
  )
}
