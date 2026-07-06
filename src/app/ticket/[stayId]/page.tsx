import { Suspense } from 'react'
import { connection } from 'next/server'
import { notFound } from 'next/navigation'
import { getStayForTicket } from '@/server/data/stays'
import { TicketReceipt } from '../receipt'
import { AutoPrint } from './auto-print'

export async function TicketContent({ params, searchParams }: { params: Promise<{ stayId: string }>; searchParams: Promise<{ auto?: string }> }) {
  await connection()
  const { stayId } = await params
  const { auto } = await searchParams
  let data
  try { data = await getStayForTicket(BigInt(stayId)) } catch { notFound() }
  if (!data) notFound()
  return (
    <div className="ticket-page">
      {auto === '1' && <AutoPrint />}
      <TicketReceipt data={data} />
      <div className="ticket-actions">
        <button type="button" data-print className="ticket-print-btn">Imprimir</button>
      </div>
    </div>
  )
}

export default function TicketPage({ params, searchParams }: { params: Promise<{ stayId: string }>; searchParams: Promise<{ auto?: string }> }) {
  return (
    <Suspense fallback={null}>
      <TicketContent params={params} searchParams={searchParams} />
    </Suspense>
  )
}
