import type { ShiftReport } from '@/server/data/shifts'
import { MOTEL_NAME } from '@/lib/config'

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const hm = (d: Date | null) => (d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')
const periodLabel = (p: string) => (p === 'day_07_19' ? 'Diurno (07–19)' : 'Noturno (19–07)')

export function ShiftReceipt({ data }: { data: ShiftReport }) {
  const m = data.metrics
  return (
    <div id="ticket" className="ticket">
      <div className="t-center t-bold">{MOTEL_NAME}</div>
      <div className="t-center">Relatório de turno · {periodLabel(data.shift.period)}</div>
      <div className="t-center t-small">{data.shift.businessDate.toLocaleDateString('pt-BR')}</div>
      <div className="t-sep" />
      <div className="t-row t-small t-bold"><span>Apto</span><span>Entra/Saída</span><span>Est/Cons</span></div>
      {data.lines.map((l, i) => (
        <div className="t-row t-small" key={i}>
          <span>{l.room}</span>
          <span>{hm(l.checkIn)}–{hm(l.checkOut)}</span>
          <span className="tnum">{brl(l.stayAmount)}/{brl(l.consumptionAmount)}</span>
        </div>
      ))}
      <div className="t-sep" />
      <div className="t-row"><span>Total em Estadia</span><span className="tnum">{brl(m.totalEstadias)}</span></div>
      <div className="t-row"><span>Total em Consumo</span><span className="tnum">{brl(m.totalConsumo)}</span></div>
      <div className="t-row"><span>Nº de Aptos</span><span className="tnum">{m.nAptos}</span></div>
      <div className="t-row t-bold"><span>Total</span><span className="tnum">{brl(m.total)}</span></div>
      <div className="t-sep" />
      <div className="t-row"><span>Retirado em Dinheiro</span><span className="tnum">{brl(m.retiradoDinheiro)}</span></div>
      <div className="t-row"><span>Retirado em Cartão</span><span className="tnum">{brl(m.retiradoCartao)}</span></div>
      {m.openingDifference !== 0 && (
        <div className="t-row"><span>⚠ Diferença de abertura</span><span className="tnum">{brl(m.openingDifference)}</span></div>
      )}
      <div className="t-sep" />
      <div className="t-row t-bold t-total"><span>Saldo atual</span><span className="tnum">R$ {brl(m.saldo)}</span></div>
      <div className="t-sep" />
      <div className="t-row"><span>Fechado por</span><span>{data.closedByName ?? '—'}{data.shift.closedAt ? ` · ${hm(data.shift.closedAt)}` : ''}</span></div>
    </div>
  )
}
