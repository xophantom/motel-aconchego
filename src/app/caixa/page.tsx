import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { currentShiftSummary, listClosedShifts } from '@/server/data/shifts'
import { getCashPolicy } from '@/server/data/cash-policy'
import { getCurrentUser } from '@/server/session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { CloseShiftForm, MovementForm } from './caixa-forms'
import { CashPolicyForm } from './policy-form'

const money = (n: number) => `R$ ${n.toFixed(2)}`
const periodLabel = (p: string) => (p === 'day_07_19' ? 'Diurno (07–19)' : 'Noturno (19–07)')
const MOVE_LABEL: Record<string, string> = { stay: 'Estadia', consumption: 'Consumo', withdrawal: 'Retirada', supply: 'Suprimento', correction: 'Correção' }

async function Caixa() {
  await connection()
  const me = await getCurrentUser()
  let summary, closed, policy
  try { ;[summary, closed, policy] = await Promise.all([currentShiftSummary(), listClosedShifts(10), getCashPolicy()]) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/'); throw e }
  const isManager = me?.role === 'manager'
  if (summary.closed || !summary.shift) {
    return (
      <div className="grid gap-6">
        <Card><CardHeader><CardTitle>Turno fechado</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">O turno deste período foi fechado. O próximo abre automaticamente.</p></CardContent></Card>
        {isManager && <CashPolicyCard value={policy.expectedOpeningBalance} />}
        <ClosedHistory closed={closed} />
      </div>
    )
  }
  const m = summary.metrics!
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle>Caixa aberto — {periodLabel(summary.shift.period)}</CardTitle></CardHeader>
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
          <div className="border-t pt-3"><CloseShiftForm shiftId={String(summary.shift.id)} saldo={m.saldo} /></div>
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
                  <TableCell className="tnum text-muted-foreground">{new Date(mv.occurredAt).toLocaleTimeString('pt-BR')}</TableCell>
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
      <ClosedHistory closed={closed} />
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

function CashPolicyCard({ value }: { value: number }) {
  return (
    <Card>
      <CardHeader><CardTitle>Fundo de caixa</CardTitle></CardHeader>
      <CardContent><CashPolicyForm value={value} /></CardContent>
    </Card>
  )
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
                <TableCell>{new Date(shift.businessDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</TableCell>
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
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Caixa" subtitle="Turno automático por horário. Registre retiradas e feche o caixa." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Caixa />
      </Suspense>
    </main>
  )
}
