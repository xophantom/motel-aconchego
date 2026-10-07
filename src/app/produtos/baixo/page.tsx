import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { lowStockProducts } from '@/server/data/products'
import { MOTEL_NAME } from '@/lib/config'
import { AutoPrint, PrintButton } from '@/components/ticket-controls'
import { MOTEL_TZ } from '@/lib/time'

async function Content({ searchParams }: { searchParams: Promise<{ auto?: string }> }) {
  await connection()
  const { auto } = await searchParams
  let rows
  try { rows = await lowStockProducts() }
  catch { redirect('/login') }
  return (
    <div className="ticket-page">
      {auto === '1' && <AutoPrint />}
      <div id="ticket" className="ticket">
        <div className="t-center t-bold">{MOTEL_NAME}</div>
        <div className="t-center">Produtos em falta (baixo)</div>
        <div className="t-center t-small">{new Date().toLocaleString('pt-BR', { timeZone: MOTEL_TZ })}</div>
        <div className="t-sep" />
        <div className="t-row t-small t-bold"><span>Produto</span><span>Estoque/Mín</span></div>
        {rows.length === 0 && <div className="t-center t-small">Nenhum produto abaixo do mínimo.</div>}
        {rows.map((p) => (
          <div className="t-row t-small" key={p.code}>
            <span>{p.code} · {p.description}</span>
            <span className="tnum">{p.stockQty}/{p.minStock}</span>
          </div>
        ))}
        <div className="t-sep" />
        <div className="t-row t-bold"><span>Itens</span><span className="tnum">{rows.length}</span></div>
      </div>
      <div className="ticket-actions"><PrintButton /></div>
    </div>
  )
}

export default function LowStockPrintPage({ searchParams }: { searchParams: Promise<{ auto?: string }> }) {
  return <Suspense fallback={null}><Content searchParams={searchParams} /></Suspense>
}
