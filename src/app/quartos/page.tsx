import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listRoomsWithCurrentStay } from '@/server/data/rooms'
import { listProducts } from '@/server/data/products'
import { listConsumptionForStays } from '@/server/data/consumption'
import { listCategoriesForBoard } from '@/server/data/tariff'
import { availableTiers } from '@/server/data/loyalty'
import { RoomGrid } from './room-grid'

async function Board() {
  await connection()
  let rooms, cats
  try {
    rooms = await listRoomsWithCurrentStay()
    cats = await listCategoriesForBoard()
  } catch { redirect('/login') }
  const products = await listProducts()
  const openStayIds = rooms.filter((r) => r.currentStay).map((r) => r.currentStay!.id)
  const allCons = await listConsumptionForStays(openStayIds)
  const byStay = new Map<string, { id: string; description: string; qty: number; unitPrice: number }[]>()
  for (const c of allCons) {
    const key = String(c.stayId)
    const arr = byStay.get(key) ?? []
    arr.push({ id: String(c.id), description: c.product?.description ?? c.productCode ?? '?', qty: c.qty, unitPrice: Number(c.unitPrice) })
    byStay.set(key, arr)
  }
  const catById = new Map(cats.map((c) => [c.id, c]))
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
      consumption: s ? (byStay.get(String(s.id)) ?? []) : [],
      loyalty,
    }
  }))
  return <RoomGrid rooms={data} products={products.map((p) => ({ code: p.code, description: p.description, price: Number(p.price) }))} />
}

export default function QuartosPage() {
  return (
    <main className="mx-auto mt-8 max-w-6xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Quartos</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Board />
      </Suspense>
    </main>
  )
}
