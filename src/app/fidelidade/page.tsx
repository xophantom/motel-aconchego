import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listTiers } from '@/server/data/loyalty'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { TierForm, DeleteTier } from './tier-form'

async function Loyalty() {
  await connection()
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'loyalty:manage')) redirect('/')
  const tiers = await listTiers()
  return (
    <div className="grid gap-6">
      <Card><CardHeader><CardTitle>Nova faixa</CardTitle></CardHeader><CardContent><TierForm /><p className="mt-2 text-xs text-muted-foreground">Ex.: 5 visitas → 50%, 10 visitas → 100%. Salvar de novo com as mesmas visitas atualiza o desconto.</p></CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Faixas de fidelidade</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Visitas</TableHead><TableHead>Desconto</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {tiers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="tnum">{t.minVisits}</TableCell>
                  <TableCell className="tnum font-semibold text-primary">{t.discountPercent}%</TableCell>
                  <TableCell className="text-right"><DeleteTier id={t.id} /></TableCell>
                </TableRow>
              ))}
              {!tiers.length && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">Nenhuma faixa ainda. Crie a primeira acima.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function FidelidadePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Fidelidade" subtitle="Faixas por número de visitas do cliente → desconto na estadia." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}><Loyalty /></Suspense>
    </main>
  )
}
