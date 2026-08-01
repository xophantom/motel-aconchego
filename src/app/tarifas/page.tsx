import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listCategoriesWithRates, getTariffPolicy } from '@/server/data/tariff'
import { nationalHolidayList } from '@/lib/holidays'
import { civilDateInSaoPaulo } from '@/lib/tariff-day'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { RateForm } from './rate-form'
import { CategoryForm } from './category-form'
import { TariffPolicyForm } from './policy-form'

const BILLING_LABEL: Record<string, string> = { motel: 'Motel (por tempo)', hotel: 'Hotel (diária)' }

async function TariffList() {
  await connection()
  let cats
  try { cats = await listCategoriesWithRates() } catch { redirect('/') }
  const policy = await getTariffPolicy()
  const year = civilDateInSaoPaulo(new Date()).year
  const holidays = nationalHolidayList(year)
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle className="font-display">Política de dia especial</CardTitle></CardHeader>
        <CardContent>
          <TariffPolicyForm specialWeekdays={policy.specialWeekdays} year={year} holidays={holidays} />
        </CardContent>
      </Card>
      {cats.map((c) => (
        <Card key={c.id}>
          <CardHeader><CardTitle className="font-display">{c.code} — {c.description} <span className="text-muted-foreground text-sm font-normal">· {BILLING_LABEL[c.billing] ?? c.billing}</span></CardTitle></CardHeader>
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
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Tarifas" subtitle="Valores por categoria — tabela de semana e de fim de semana." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <TariffList />
      </Suspense>
    </main>
  )
}
