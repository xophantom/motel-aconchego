import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect, notFound } from 'next/navigation'
import { reportView, type ReportPeriod } from '@/server/data/reports'
import { formatCell } from '@/lib/report-format'
import { MOTEL_NAME } from '@/lib/config'
import { AutoPrint, PrintButton } from '@/components/ticket-controls'

const periodLabel = (p: ReportPeriod) =>
  p.kind === 'month'
    ? `${String(p.month).padStart(2, '0')}/${p.year}`
    : `${p.from.toLocaleDateString('pt-BR')} — ${p.to.toLocaleDateString('pt-BR')}`

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection()
  const sp = await searchParams
  let view
  try { view = await reportView(sp) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) redirect('/'); notFound() }
  return (
    <div className="ticket-page">
      {sp.auto === '1' && <AutoPrint />}
      <div id="ticket" className="ticket">
        <div className="t-center t-bold">{MOTEL_NAME}</div>
        <div className="t-center">{view.title}</div>
        <div className="t-center t-small">{periodLabel(view.period)}</div>
        <div className="t-sep" />
        {view.rows.length === 0 && <div className="t-center t-small">Sem dados no período.</div>}
        {view.rows.map((row, i) => (
          <div key={i}>
            {i > 0 && <div className="t-sep" />}
            {view.columns.map((c) => (
              <div className="t-row t-small" key={c.key}>
                <span>{c.label}</span>
                <span className="tnum">{formatCell(row[c.key], c.kind, 'screen')}</span>
              </div>
            ))}
          </div>
        ))}
        {view.total && (
          <>
            <div className="t-sep" />
            <div className="t-bold t-small">TOTAIS</div>
            {view.columns
              .filter((c) => (c.kind === 'money' || c.kind === 'int') && view.total![c.key] != null)
              .map((c) => (
                <div className="t-row" key={c.key}>
                  <span>{c.label}</span>
                  <span className="tnum">{formatCell(view.total![c.key], c.kind, 'screen')}</span>
                </div>
              ))}
          </>
        )}
        <div className="t-sep" />
        <div className="t-center t-small">Emitido {new Date().toLocaleString('pt-BR')}</div>
      </div>
      <div className="ticket-actions"><PrintButton /></div>
    </div>
  )
}

export default function ReportPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <Suspense fallback={null}><Content searchParams={searchParams} /></Suspense>
}
