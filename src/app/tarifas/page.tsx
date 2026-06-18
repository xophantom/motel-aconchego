import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listCategoriesWithRates } from '@/server/data/tariff'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RateForm } from './rate-form'
import { CategoryForm } from './category-form'

async function TariffList() {
  await connection()
  let cats
  try { cats = await listCategoriesWithRates() } catch { redirect('/') }
  return (
    <div className="grid gap-4">
      {cats.map((c) => (
        <Card key={c.id}>
          <CardHeader><CardTitle>{c.code} — {c.description} <span className="text-muted-foreground text-sm">({c.billing})</span></CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <CategoryForm categoryId={c.id} category={{ billing: c.billing, minPeriodMin: c.minPeriodMin, maxPeriodMin: c.maxPeriodMin, includedGuests: c.includedGuests }} />
            {c.rates.map((r) => (
              <RateForm key={r.day} categoryId={c.id} rate={{
                day: r.day, basePrice: String(r.basePrice), excessPrice30m: String(r.excessPrice30m),
                overnightPrice: String(r.overnightPrice), extraGuestPrice: String(r.extraGuestPrice),
              }} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function TarifasPage() {
  return (
    <main className="mx-auto mt-10 max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Tarifas</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <TariffList />
      </Suspense>
    </main>
  )
}
