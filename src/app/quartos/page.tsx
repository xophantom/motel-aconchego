import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listRoomsWithCurrentStay } from '@/server/data/rooms'
import { RoomGrid } from './room-grid'

async function Board() {
  await connection()
  let rooms
  try { rooms = await listRoomsWithCurrentStay() } catch { redirect('/login') }
  const data = rooms.map((r) => ({
    number: r.number,
    status: r.status,
    maintenanceReason: r.maintenanceReason,
    category: r.category ? { code: r.category.code, description: r.category.description } : null,
    currentStay: r.currentStay ? { checkIn: r.currentStay.checkIn.toISOString(), guests: r.currentStay.guests, day: r.currentStay.day } : null,
  }))
  return <RoomGrid rooms={data} />
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
