import { vi, describe, it, expect } from 'vitest'
// Actions puxam server-only/next-cache; stub o módulo inteiro (qualquer named export vira no-op).
vi.mock('@/app/quartos/actions', () => new Proxy({}, {
  get: (_t, prop) => (prop === 'then' ? undefined : async () => ({ ok: false })),
  has: () => true,
}))

import { renderToStaticMarkup } from 'react-dom/server'
import { FreeActions } from '@/app/quartos/room-grid'

const room = {
  number: '01', status: 'free' as const, maintenanceReason: null, category: null,
  currentStay: null, pricing: null, consumption: [], loyalty: null, lastClosedStayId: null,
}

describe('FreeActions suggested tariff', () => {
  it('defaults the table select to the suggested day and shows the reason', () => {
    const html = renderToStaticMarkup(
      <FreeActions room={room as any} onDone={() => {}} suggestedDay="special" suggestedReason="holiday_eve" />,
    )
    expect(html).toMatch(/value="special"[^>]*selected|selected[^>]*value="special"/)
    expect(html).toContain('véspera de feriado')
  })

  it('defaults to Semana on a plain weekday', () => {
    const html = renderToStaticMarkup(
      <FreeActions room={room as any} onDone={() => {}} suggestedDay="normal" suggestedReason="weekday" />,
    )
    expect(html).toMatch(/value="normal"[^>]*selected|selected[^>]*value="normal"/)
    expect(html).toContain('dia de semana')
  })
})
