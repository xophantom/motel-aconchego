import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TicketReceipt } from '@/app/ticket/receipt'
import type { TicketData } from '@/server/data/stays'

const base: TicketData = {
  id: '1', roomNumber: '07', categoryDescription: 'Rústico',
  checkIn: new Date(2026, 6, 4, 20), checkOut: new Date(2026, 6, 4, 23),
  stayAmount: 90, consumptionAmount: 20, prepaidAmount: 30, discountPercent: 0,
  items: [{ description: 'Cerveja', qty: 2, unitPrice: 10 }],
  entryOperator: 'Boss', paymentOperator: 'Boss',
}

describe('TicketReceipt', () => {
  it('renders the total (90 + 20 − 30 = 80), the room, and the item', () => {
    const html = renderToStaticMarkup(<TicketReceipt data={base} />)
    expect(html).toContain('id="ticket"')
    expect(html).toContain('07')
    expect(html).toContain('Cerveja')
    expect(html).toContain('80,00')  // total, pt-BR
  })

  it('omits the discount line when discountPercent is 0', () => {
    const html = renderToStaticMarkup(<TicketReceipt data={base} />)
    expect(html).not.toMatch(/Desconto/i)
  })

  it('shows the discount line when discountPercent > 0', () => {
    const html = renderToStaticMarkup(<TicketReceipt data={{ ...base, discountPercent: 10 }} />)
    expect(html).toMatch(/Desconto/i)
    expect(html).toContain('10%')
  })
})
