import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listTiers } from '@/server/data/loyalty'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
                <TableRow key={t.id}><TableCell>{t.minVisits}</TableCell><TableCell>{t.discountPercent}%</TableCell><TableCell><DeleteTier id={t.id} /></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function FidelidadePage() {
  return (
    <main className="mx-auto mt-8 max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Fidelidade</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}><Loyalty /></Suspense>
    </main>
  )
}
