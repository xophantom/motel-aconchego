import { vi, describe, it, expect } from 'vitest'
vi.mock('@/app/tarifas/actions', () => ({ updateTariffPolicyAction: async () => ({ ok: false }) }))

import { renderToStaticMarkup } from 'react-dom/server'
import { TariffPolicyForm } from '@/app/tarifas/policy-form'

describe('TariffPolicyForm', () => {
  it('checks the configured weekdays and lists holidays', () => {
    const html = renderToStaticMarkup(
      <TariffPolicyForm specialWeekdays={[5, 6]} year={2026} holidays={[{ date: '09-07', name: 'Independência' }]} />,
    )
    expect(html).toMatch(/value="6"[^>]*checked|checked[^>]*value="6"/)
    expect(html).toMatch(/value="5"[^>]*checked|checked[^>]*value="5"/)
    expect(html).not.toMatch(/value="1"[^>]*checked|checked[^>]*value="1"/)
    expect(html).toContain('07/09 Independência')
  })
})
