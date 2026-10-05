import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listRoomsWithCurrentStay } from '@/server/data/rooms'
import { canCancelNow } from '@/server/data/stays'
import { listProducts } from '@/server/data/products'
import { listConsumptionForStays } from '@/server/data/consumption'
import { listCategoriesForBoard, getTariffPolicy, listRegionalHolidays } from '@/server/data/tariff'
import { resolveDay, civilDateInSaoPaulo } from '@/lib/tariff-day'
import { availableTiers } from '@/server/data/loyalty'
import { getCurrentUser } from '@/server/session'
import { currentShiftSummary } from '@/server/data/shifts'
import { RoomGrid } from './room-grid'

async function Board() {
  await connection()
  let rooms, cats
  try {
    ;[rooms, cats] = await Promise.all([listRoomsWithCurrentStay(), listCategoriesForBoard()])
  } catch { redirect('/login') }
  const me = await getCurrentUser()
  const canCash = me?.role === 'manager' || me?.role === 'reception'
  const openStayIds = rooms.filter((r) => r.currentStay).map((r) => r.currentStay!.id)
  // Independent reads: fetch them together instead of one round-trip after another.
  const [products, canCancel, sum, policy, regional, allCons] = await Promise.all([
    listProducts(),
    canCancelNow(),
    canCash ? currentShiftSummary().catch(() => null) : null,
    getTariffPolicy(),
    listRegionalHolidays(),
    listConsumptionForStays(openStayIds),
  ])
  let currentShiftId: string | null = null
  let shiftSaldo = 0, retiradoDinheiro = 0, retiradoCartao = 0
  if (sum && !sum.closed && sum.shift && sum.metrics) {
    currentShiftId = String(sum.shift.id)
    shiftSaldo = sum.metrics.saldo; retiradoDinheiro = sum.metrics.retiradoDinheiro; retiradoCartao = sum.metrics.retiradoCartao
  }
  const suggested = resolveDay(civilDateInSaoPaulo(new Date()), policy.specialWeekdays, regional.map((h) => h.monthDay))
  const byStay = new Map<string, { id: string; description: string; qty: number; unitPrice: number }[]>()
  for (const c of allCons) {
    const key = String(c.stayId)
    const arr = byStay.get(key) ?? []
    arr.push({ id: String(c.id), description: c.product?.description ?? c.productCode ?? '?', qty: c.qty, unitPrice: Number(c.unitPrice) })
    byStay.set(key, arr)
  }
  const catById = new Map(cats.map((c) => [c.id, c]))
  const catByCode = new Map(cats.map((c) => [c.code, c]))
  const tariffOf = (code: string | undefined) => {
    const cat = code ? catByCode.get(code) : undefined
    if (!cat) return null
    const rateOf = (day: 'normal' | 'special') => cat.rates.find((rr) => rr.day === day)
    const n = rateOf('normal'), sp = rateOf('special')
    return {
      normal: { base: n?.basePrice ?? 0, overnight: n?.overnightPrice ?? 0 },
      special: { base: sp?.basePrice ?? 0, overnight: sp?.overnightPrice ?? 0 },
    }
  }
  const data = await Promise.all(rooms.map(async (r) => {
    const s = r.currentStay
    let pricing = null
    if (s?.categoryId != null) {
      const cat = catById.get(s.categoryId)
      const rate = cat?.rates.find((rr) => rr.day === s.day)
      if (cat && rate) pricing = { billing: cat.billing, minPeriodMin: cat.minPeriodMin, maxPeriodMin: cat.maxPeriodMin, includedGuests: cat.includedGuests, ...rate }
    }
    let loyalty = null
    if (s?.customerId && s.customer?.plate) {
      const av = await availableTiers(s.customerId, s.id)
      loyalty = { plate: s.customer.plate, visits: av.visits, tiers: av.tiers.map((t) => ({ id: t.id, minVisits: t.minVisits, discountPercent: t.discountPercent })), appliedDiscount: s.discountPercent }
    }
    return {
      number: r.number,
      status: r.status,
      maintenanceReason: r.maintenanceReason,
      category: r.category ? { code: r.category.code, description: r.category.description } : null,
      currentStay: s ? { id: String(s.id), checkIn: s.checkIn.toISOString(), guests: s.guests, day: s.day, chargeMode: s.chargeMode, prepaid: Number(s.prepaidAmount), consumptionAmount: Number(s.consumptionAmount), discountPercent: s.discountPercent } : null,
      pricing,
      tariff: tariffOf(r.category?.code),
      consumption: s ? (byStay.get(String(s.id)) ?? []) : [],
      loyalty,
      lastClosedStayId: r.lastClosedStayId != null ? String(r.lastClosedStayId) : null,
    }
  }))
  return <RoomGrid rooms={data} products={products.map((p) => ({ code: p.code, description: p.description, price: Number(p.price) }))} canCancel={canCancel} suggestedDay={suggested.day} suggestedReason={suggested.reason} currentShiftId={currentShiftId} canCash={canCash} shiftSaldo={shiftSaldo} retiradoDinheiro={retiradoDinheiro} retiradoCartao={retiradoCartao} />
}

export default function QuartosPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Painel de quartos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Toque num quarto para entrada, consumo ou saída.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Board />
      </Suspense>
    </main>
  )
}
