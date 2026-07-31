import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const updateTariffPolicy = vi.hoisted(() => vi.fn(async (w: number[]) => ({ specialWeekdays: w })))
vi.mock('@/server/data/tariff', () => ({ updateTariffPolicy }))

import { updateTariffPolicyAction } from '@/app/tarifas/actions'

function fd(weekdays: string[]) {
  const f = new FormData()
  for (const w of weekdays) f.append('weekday', w)
  return f
}

beforeEach(() => { updateTariffPolicy.mockClear() })

describe('updateTariffPolicyAction', () => {
  it('parses checkbox weekdays and calls the DAL', async () => {
    const out = await updateTariffPolicyAction({ ok: false }, fd(['5', '6']))
    expect(updateTariffPolicy).toHaveBeenCalledWith([5, 6])
    expect(out).toEqual({ ok: true })
  })
  it('accepts an empty selection', async () => {
    const out = await updateTariffPolicyAction({ ok: false }, fd([]))
    expect(updateTariffPolicy).toHaveBeenCalledWith([])
    expect(out).toEqual({ ok: true })
  })
  it('rejects out-of-range weekday without calling the DAL', async () => {
    const out = await updateTariffPolicyAction({ ok: false }, fd(['9']))
    expect(updateTariffPolicy).not.toHaveBeenCalled()
    expect(out.ok).toBe(false)
  })
})
