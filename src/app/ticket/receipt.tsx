import type { TicketData } from '@/server/data/stays'
import { MOTEL_NAME } from '@/lib/config'

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dt = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
function durationLabel(a: Date, b: Date | null) {
  if (!b) return '—'
  const min = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000))
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

export function TicketReceipt({ data }: { data: TicketData }) {
  const total = data.stayAmount + data.consumptionAmount - data.prepaidAmount
  return (
    <div id="ticket" className="ticket">
      <div className="t-center t-bold">{MOTEL_NAME}</div>
      <div className="t-center">Comprovante de saída</div>
      <div className="t-sep" />
      <div className="t-row"><span>Quarto</span><span>{data.roomNumber ?? '—'}{data.categoryDescription ? ` · ${data.categoryDescription}` : ''}</span></div>
      <div className="t-row"><span>Entrada</span><span>{dt(data.checkIn)}</span></div>
      <div className="t-row"><span>Saída</span><span>{data.checkOut ? dt(data.checkOut) : '—'}</span></div>
      <div className="t-row"><span>Duração</span><span>{durationLabel(data.checkIn, data.checkOut)}</span></div>
      {data.items.length > 0 && (
        <>
          <div className="t-sep" />
          <div className="t-bold">Consumo</div>
          {data.items.map((it, i) => (
            <div className="t-row" key={i}><span>{it.qty}× {it.description}</span><span className="tnum">{brl(it.unitPrice * it.qty)}</span></div>
          ))}
        </>
      )}
      <div className="t-sep" />
      <div className="t-row"><span>Estadia</span><span className="tnum">{brl(data.stayAmount)}</span></div>
      {data.discountPercent > 0 && (
        <div className="t-row"><span>Desconto ({data.discountPercent}%)</span><span className="tnum">aplicado</span></div>
      )}
      <div className="t-row"><span>Consumo</span><span className="tnum">{brl(data.consumptionAmount)}</span></div>
      <div className="t-row"><span>Antecipado</span><span className="tnum">− {brl(data.prepaidAmount)}</span></div>
      <div className="t-sep" />
      <div className="t-row t-bold t-total"><span>TOTAL</span><span className="tnum">R$ {brl(total)}</span></div>
      <div className="t-sep" />
      <div className="t-row"><span>Operador</span><span>{data.paymentOperator ?? data.entryOperator ?? '—'}</span></div>
      <div className="t-center t-small">Emitido em {dt(new Date())}</div>
    </div>
  )
}
