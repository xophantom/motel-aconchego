import { Suspense } from 'react'
import { connection } from 'next/server'
import { notFound, redirect } from 'next/navigation'
import { shiftReport } from '@/server/data/shifts'
import { ShiftReceipt } from './receipt'
import { AutoPrint } from './auto-print'
import { PrintButton } from './print-button'

export async function ShiftTicketContent({ params, searchParams }: { params: Promise<{ shiftId: string }>; searchParams: Promise<{ auto?: string }> }) {
  await connection()
  const { shiftId } = await params
  const { auto } = await searchParams
  let data
  try { data = await shiftReport(BigInt(shiftId)) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/'); notFound() }
  return (
    <div className="ticket-page">
      {auto === '1' && <AutoPrint />}
      <ShiftReceipt data={data} />
      <div className="ticket-actions"><PrintButton /></div>
    </div>
  )
}

export default function ShiftTicketPage({ params, searchParams }: { params: Promise<{ shiftId: string }>; searchParams: Promise<{ auto?: string }> }) {
  return <Suspense fallback={null}><ShiftTicketContent params={params} searchParams={searchParams} /></Suspense>
}
