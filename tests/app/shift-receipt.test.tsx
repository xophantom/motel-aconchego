import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShiftReceipt } from '@/app/caixa/turno/[shiftId]/receipt'

const data = {
  shift: { id: '7', period: 'day_07_19', businessDate: new Date('2026-08-07T00:00:00'), openedAt: new Date('2026-08-07T07:00:00'), closedAt: new Date('2026-08-07T19:00:00'), openingBalance: 150 },
  metrics: { nAptos: 3, totalEstadias: 765, totalConsumo: 230, totalSangrias: 0, totalSuprimentos: 0, totalCorrecoes: 0, ticketMedio: 255, saldo: 1145, retiradoDinheiro: 100, retiradoCartao: 420, total: 995, openingDifference: 0 },
  closedByName: 'Vanessa',
  lines: [{ room: '01', checkIn: new Date('2026-08-07T09:00:00'), checkOut: new Date('2026-08-07T11:00:00'), stayAmount: 75, consumptionAmount: 20 }],
  cardWithdrawals: [420],
} as any

describe('ShiftReceipt', () => {
  it('renders detail + summary', () => {
    const html = renderToStaticMarkup(<ShiftReceipt data={data} />)
    expect(html).toContain('id="ticket"')
    expect(html).toMatch(/Total.*Estadia/s)
    expect(html).toContain('Vanessa')
    expect(html).toMatch(/Retirado.*Dinheiro/s)
    expect(html).toMatch(/Retirado.*Cart/s)
    expect(html).toContain('01')
    expect(html).not.toContain('Turno em aberto')
  })
  it('lists the card receipts under the card total when there are several', () => {
    expect(renderToStaticMarkup(<ShiftReceipt data={data} />)).not.toContain(' + ')
    const html = renderToStaticMarkup(<ShiftReceipt data={{ ...data, cardWithdrawals: [87, 120, 45.5, 167.5] }} />)
    expect(html).toContain('87,00 + 120,00 + 45,50 + 167,50')
  })
  it('marks an open shift as partial instead of "Fechado por —"', () => {
    const open = { ...data, shift: { ...data.shift, closedAt: null }, closedByName: null }
    const html = renderToStaticMarkup(<ShiftReceipt data={open} />)
    expect(html).toContain('Turno em aberto')
    expect(html).not.toContain('Fechado por')
  })
})
