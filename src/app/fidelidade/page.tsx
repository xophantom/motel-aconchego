import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listLoyaltyCustomers, loyaltyCustomerDetail, type LoyaltyVisit } from '@/server/data/loyalty'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { formatDayHm } from '@/lib/time'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/page-header'
import { LoyaltyPolicyForm } from './policy-form'

const MAX_ROWS = 200
const money = (n: number | null) => (n == null ? '—' : `R$ ${n.toFixed(2)}`)
const rewardLabel = (pct: number) => (pct >= 100 ? '1 estadia grátis' : `${pct}% numa estadia`)
const lastVisitLabel = (d: Date | null) => (d ? formatDayHm(d) : '—')

type SP = { q?: string; placa?: string }

async function Loyalty({ searchParams }: { searchParams: Promise<SP> }) {
  await connection()
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'loyalty:view')) redirect('/')
  const canEditRule = can(me.role, 'loyalty:manage')
  const sp = await searchParams
  const q = sp.q?.trim() || undefined
  const [{ policy, rows }, detail] = await Promise.all([listLoyaltyCustomers(q), sp.placa ? loyaltyCustomerDetail(sp.placa) : null])
  const withBenefit = rows.filter((r) => r.available > 0).length
  const listHref = (extra: Record<string, string>) => `/fidelidade?${new URLSearchParams({ ...(q ? { q } : {}), ...extra })}`
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Regra</CardTitle>
          <CardDescription>
            A cada <strong>{policy.everyVisits}</strong> visitas pagas, o cliente ganha <strong>{rewardLabel(policy.discountPercent)}</strong>.
            A estadia com o benefício não conta como visita; benefícios não usados acumulam.
          </CardDescription>
        </CardHeader>
        {canEditRule && <CardContent><LoyaltyPolicyForm everyVisits={policy.everyVisits} discountPercent={policy.discountPercent} /></CardContent>}
      </Card>

      {sp.placa && (detail ? <DetailCard detail={detail} closeHref={listHref({})} /> : (
        <Card><CardContent><p className="text-sm text-muted-foreground">Placa {sp.placa} não encontrada.</p></CardContent></Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Placas</CardTitle>
          <CardDescription>{rows.length} {rows.length === 1 ? 'placa' : 'placas'}{withBenefit ? ` · ${withBenefit} com benefício disponível` : ''}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="flex gap-2" action="/fidelidade">
            <Input name="q" defaultValue={q} placeholder="Buscar placa" className="w-48 uppercase" />
            <Button type="submit" variant="outline">Buscar</Button>
            {q && <Button asChild variant="ghost"><Link href="/fidelidade">Limpar</Link></Button>}
          </form>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{q ? 'Nenhuma placa encontrada.' : 'Nenhuma placa ainda. A placa é informada na entrada do quarto.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placa</TableHead><TableHead className="text-right">Visitas pagas</TableHead><TableHead>Progresso</TableHead>
                  <TableHead className="text-right">Disponíveis</TableHead><TableHead className="text-right">Usados</TableHead><TableHead>Última visita</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, MAX_ROWS).map((r) => (
                  <TableRow key={r.plate} data-state={detail?.plate === r.plate ? 'selected' : undefined}>
                    <TableCell className="tnum font-semibold">{r.plate}</TableCell>
                    <TableCell className="tnum text-right">{r.paidVisits}</TableCell>
                    <TableCell><Progress done={r.everyVisits - r.nextIn} of={r.everyVisits} /></TableCell>
                    <TableCell className="tnum text-right">{r.available > 0 ? <Badge>🎁 {r.available}</Badge> : '0'}</TableCell>
                    <TableCell className="tnum text-right">{r.used}</TableCell>
                    <TableCell className="tnum text-muted-foreground">{lastVisitLabel(r.lastVisit)}</TableCell>
                    <TableCell className="text-right"><Button asChild size="sm" variant="ghost"><Link href={listHref({ placa: r.plate })}>Ver</Link></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {rows.length > MAX_ROWS && <p className="text-xs text-muted-foreground">Mostrando as {MAX_ROWS} mais recentes de {rows.length}. Use a busca para achar outras.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function Progress({ done, of }: { done: number; of: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(done / of) * 100}%` }} /></div>
      <span className="tnum text-xs text-muted-foreground">{done}/{of}</span>
    </div>
  )
}

const VISIT_STATUS: Record<LoyaltyVisit['status'], string> = { open: 'Em aberto', closed: 'Paga', canceled: 'Cancelada' }

function DetailCard({ detail, closeHref }: { detail: NonNullable<Awaited<ReturnType<typeof loyaltyCustomerDetail>>>; closeHref: string }) {
  const s = detail.status
  return (
    <Card>
      <CardHeader>
        <CardTitle>Placa {detail.plate}</CardTitle>
        <CardDescription>
          {s.paidVisits} visitas pagas · {s.available > 0 ? `🎁 ${s.available} benefício(s) disponível(is)` : `faltam ${s.nextIn} para o próximo benefício`} · {s.used} usado(s)
        </CardDescription>
        <CardAction><Button asChild size="sm" variant="ghost"><Link href={closeHref}>Fechar</Link></Button></CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entrada</TableHead><TableHead>Saída</TableHead><TableHead>Quarto</TableHead>
              <TableHead className="text-right">Estadia</TableHead><TableHead className="text-right">Consumo</TableHead><TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.visits.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="tnum">{formatDayHm(v.checkIn)}</TableCell>
                <TableCell className="tnum text-muted-foreground">{formatDayHm(v.checkOut)}</TableCell>
                <TableCell className="tnum">{v.roomNumber ?? '—'}</TableCell>
                <TableCell className="tnum text-right">{money(v.stayAmount)}</TableCell>
                <TableCell className="tnum text-right">{money(v.consumptionAmount)}</TableCell>
                <TableCell>
                  {v.benefitPercent != null && v.status !== 'canceled'
                    ? <Badge variant="secondary">🎁 {v.benefitPercent >= 100 ? 'Grátis' : `${v.benefitPercent}%`}</Badge>
                    : <span className="text-sm text-muted-foreground">{VISIT_STATUS[v.status]}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {detail.visits.length >= 100 && <p className="mt-2 text-xs text-muted-foreground">Mostrando as 100 visitas mais recentes.</p>}
      </CardContent>
    </Card>
  )
}

export default function FidelidadePage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Fidelidade" subtitle="Clientes identificados pela placa. A cada N visitas pagas, um benefício na estadia." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}><Loyalty searchParams={searchParams} /></Suspense>
    </main>
  )
}
