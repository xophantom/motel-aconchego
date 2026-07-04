import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listEvents, listEventTypes, listEventOperators, type EventFilter } from '@/server/data/audit'
import { eventTypeLabel } from '@/lib/audit-labels'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PageHeader } from '@/components/page-header'

const PAGE = 100

function todayISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function Trail({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection()
  const sp = await searchParams
  const now = new Date()
  const fromStr = sp.from || todayISO(now)
  const toStr = sp.to || todayISO(now)
  const skip = Math.max(0, Number(sp.skip) || 0)

  const filter: EventFilter = {
    from: new Date(`${fromStr}T00:00:00`),
    to: new Date(`${toStr}T23:59:59.999`),
    type: sp.type || undefined,
    employeeId: sp.employeeId ? Number(sp.employeeId) : undefined,
    q: sp.q || undefined,
    take: PAGE,
    skip,
  }

  let data, types, operators
  try {
    ;[data, types, operators] = await Promise.all([listEvents(filter), listEventTypes(), listEventOperators()])
  } catch (e) {
    if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/')
    throw e
  }

  const { events, total } = data
  const hasPrev = skip > 0
  const hasNext = skip + PAGE < total
  const qsBase = new URLSearchParams()
  qsBase.set('from', fromStr); qsBase.set('to', toStr)
  if (sp.type) qsBase.set('type', sp.type)
  if (sp.employeeId) qsBase.set('employeeId', sp.employeeId)
  if (sp.q) qsBase.set('q', sp.q)
  const pageHref = (s: number) => { const p = new URLSearchParams(qsBase); p.set('skip', String(s)); return `/auditoria?${p}` }

  const fmt = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle className="font-display">Filtros</CardTitle></CardHeader>
        <CardContent>
          <form method="GET" className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1"><Label htmlFor="from">De</Label><Input id="from" name="from" type="date" defaultValue={fromStr} /></div>
            <div className="grid gap-1"><Label htmlFor="to">Até</Label><Input id="to" name="to" type="date" defaultValue={toStr} /></div>
            <div className="grid gap-1">
              <Label htmlFor="type">Tipo</Label>
              <NativeSelect id="type" name="type" defaultValue={sp.type ?? ''} className="w-44">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {types.map((t) => <NativeSelectOption key={t} value={t}>{eventTypeLabel(t)}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="employeeId">Operador</Label>
              <NativeSelect id="employeeId" name="employeeId" defaultValue={sp.employeeId ?? ''} className="w-44">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {operators.map((o) => <NativeSelectOption key={o.id} value={String(o.id)}>{o.name}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className="grid gap-1"><Label htmlFor="q">Busca</Label><Input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="descrição…" /></div>
            <Button type="submit">Filtrar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display">Eventos <span className="text-sm font-normal text-muted-foreground">({total})</span></CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>Hora</TableHead><TableHead>Operador</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Quarto</TableHead></TableRow></TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Nenhum evento no período.</TableCell></TableRow>
              )}
              {events.map((e) => (
                <TableRow key={String(e.id)}>
                  <TableCell className="tnum whitespace-nowrap">{fmt(e.occurredAt)}</TableCell>
                  <TableCell>{e.operatorName ?? '—'}</TableCell>
                  <TableCell><Badge variant="secondary" className="font-normal">{eventTypeLabel(e.type)}</Badge></TableCell>
                  <TableCell>{e.description ?? '—'}</TableCell>
                  <TableCell className="tnum">{e.roomNumber ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between">
            {hasPrev
              ? <Button asChild variant="outline"><a href={pageHref(Math.max(0, skip - PAGE))}>← Anterior</a></Button>
              : <Button variant="outline" disabled>← Anterior</Button>}
            <span className="text-xs text-muted-foreground">{total === 0 ? '0' : `${skip + 1}–${Math.min(skip + PAGE, total)}`} de {total}</span>
            {hasNext
              ? <Button asChild variant="outline"><a href={pageHref(skip + PAGE)}>Próxima →</a></Button>
              : <Button variant="outline" disabled>Próxima →</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Auditoria" subtitle="Trilha de eventos por operador." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Trail searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
