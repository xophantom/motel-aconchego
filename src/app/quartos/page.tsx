import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listRoomsWithCurrentStay } from '@/server/data/rooms'
import { listProducts } from '@/server/data/products'
import { listConsumptionForStays } from '@/server/data/consumption'
import { RoomGrid } from './room-grid'

async function Board() {
  await connection()
  let rooms
  try { rooms = await listRoomsWithCurrentStay() } catch { redirect('/login') }
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
  const data = rooms.map((r) => ({
    number: r.number,
    status: r.status,
    maintenanceReason: r.maintenanceReason,
    category: r.category ? { code: r.category.code, description: r.category.description } : null,
    currentStay: r.currentStay ? { id: String(r.currentStay.id), checkIn: r.currentStay.checkIn.toISOString(), guests: r.currentStay.guests, day: r.currentStay.day } : null,
    consumption: r.currentStay ? (byStay.get(String(r.currentStay.id)) ?? []) : [],
  }))
  return <RoomGrid rooms={data} products={products.map((p) => ({ code: p.code, description: p.description, price: Number(p.price) }))} />
}

export default function QuartosPage() {
  return (
    <main className="mx-auto mt-8 max-w-5xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Quartos</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Board />
      </Suspense>
    </main>
  )
}
