import { vi, describe, it, expect } from 'vitest'
// Actions puxam server-only/next-cache; stub o módulo inteiro (qualquer named export vira no-op).
// Vitest 4.1.9 checks module.then for thenable-detection during dynamic import; exclude 'then' so the stub isn't swallowed, and answer has() so named exports resolve.
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

  it('shows the room price for the suggested table (período + pernoite)', () => {
    const withTariff = { ...room, tariff: { normal: { base: 75, overnight: 160 }, special: { base: 90, overnight: 200 } } }
    const html = renderToStaticMarkup(
      <FreeActions room={withTariff as any} onDone={() => {}} suggestedDay="normal" suggestedReason="weekday" />,
    )
    expect(html).toContain('Valor do quarto')
    expect(html).toContain('R$ 75.00')
    expect(html).toContain('R$ 160.00')
  })
})

describe('FreeActions entry time', () => {
  it('shows the current time but submits empty until edited (server stamps now)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-13T17:42:30Z')) // 14:42 in Brasília
    try {
      const html = renderToStaticMarkup(
        <FreeActions room={room as any} onDone={() => {}} suggestedDay="normal" suggestedReason="weekday" />,
      )
      expect(html).toMatch(/id="checkInTime"[^>]*value="14:42"|value="14:42"[^>]*id="checkInTime"/)
      expect(html).toMatch(/type="hidden"[^>]*name="checkInTime"[^>]*value=""|name="checkInTime"[^>]*type="hidden"/)
      expect(html).not.toMatch(/id="checkInTime"[^>]*name=|name="checkInTime"[^>]*id="checkInTime"/)
    } finally {
      vi.useRealTimers()
    }
  })
})
