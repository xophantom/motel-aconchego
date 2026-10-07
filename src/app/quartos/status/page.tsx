import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listRoomsWithCurrentStay } from '@/server/data/rooms'
import { listCategoriesForBoard } from '@/server/data/tariff'
import { computeStayAmount } from '@/lib/billing'
import { MOTEL_NAME } from '@/lib/config'
import { AutoPrint, PrintButton } from '@/components/ticket-controls'
import { MOTEL_TZ } from '@/lib/time'

const STATUS_LABEL: Record<string, string> = { free: 'Livre', occupied: 'Ocupado', cleaning: 'Limpeza', maintenance: 'Manutenção' }
const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const elapsed = (checkIn: Date, now: number) => {
  const min = Math.max(0, Math.round((now - checkIn.getTime()) / 60000))
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

async function Content({ searchParams }: { searchParams: Promise<{ auto?: string }> }) {
  await connection()
  const { auto } = await searchParams
  let rooms, cats
  try { ;[rooms, cats] = await Promise.all([listRoomsWithCurrentStay(), listCategoriesForBoard()]) }
  catch { redirect('/login') }
  const catById = new Map(cats.map((c) => [c.id, c]))
  const now = Date.now()
  const counts: Record<string, number> = { free: 0, occupied: 0, cleaning: 0, maintenance: 0 }
  const lines = rooms.map((r) => {
    counts[r.status] = (counts[r.status] ?? 0) + 1
    let detail = ''
    const s = r.currentStay
    if (r.status === 'occupied' && s) {
      const cat = catById.get(s.categoryId ?? -1)
      const rate = cat?.rates.find((rr) => rr.day === s.day)
      let val = Number(s.consumptionAmount)
      if (cat && rate) {
        val += computeStayAmount({
          billing: cat.billing, chargeMode: s.chargeMode, minPeriodMin: cat.minPeriodMin, maxPeriodMin: cat.maxPeriodMin,
          includedGuests: cat.includedGuests, rate, checkIn: s.checkIn, checkOut: new Date(now), guests: s.guests,
        })
      }
      detail = `${elapsed(s.checkIn, now)} · R$ ${brl(val)}`
    }
    return { number: r.number, status: r.status, detail }
  })
  return (
    <div className="ticket-page">
      {auto === '1' && <AutoPrint />}
      <div id="ticket" className="ticket">
        <div className="t-center t-bold">{MOTEL_NAME}</div>
        <div className="t-center">Status dos quartos</div>
        <div className="t-center t-small">{new Date().toLocaleString('pt-BR', { timeZone: MOTEL_TZ })}</div>
        <div className="t-sep" />
        {lines.map((l) => (
          <div className="t-row t-small" key={l.number}>
            <span>{l.number} · {STATUS_LABEL[l.status]}</span>
            <span className="tnum">{l.detail}</span>
          </div>
        ))}
        <div className="t-sep" />
        <div className="t-row t-bold t-small"><span>Livre {counts.free} · Ocup {counts.occupied}</span><span>Limp {counts.cleaning} · Manut {counts.maintenance}</span></div>
      </div>
      <div className="ticket-actions"><PrintButton /></div>
    </div>
  )
}

export default function RoomsStatusPrintPage({ searchParams }: { searchParams: Promise<{ auto?: string }> }) {
  return <Suspense fallback={null}><Content searchParams={searchParams} /></Suspense>
}
