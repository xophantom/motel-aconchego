import { vi, describe, it, expect } from 'vitest'
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { getTariffPolicy, updateTariffPolicy } from '@/server/data/tariff'

const manager = { id: 1, name: 'Boss', role: 'manager' }
const reception = { id: 2, name: 'Rec', role: 'reception' }

describe('tariff policy DAL', () => {
  it('getTariffPolicy returns default [5,6] when no row exists', async () => {
    session.current = manager
    expect(await getTariffPolicy()).toEqual({ specialWeekdays: [5, 6] })
  })

  it('updateTariffPolicy upserts, sanitizes and sorts', async () => {
    session.current = manager
    const out = await updateTariffPolicy([6, 0, 6, 5])
    expect(out).toEqual({ specialWeekdays: [0, 5, 6] })
    expect(await getTariffPolicy()).toEqual({ specialWeekdays: [0, 5, 6] })
  })

  it('updateTariffPolicy drops out-of-range values', async () => {
    session.current = manager
    const out = await updateTariffPolicy([1, 9, -1, 3])
    expect(out).toEqual({ specialWeekdays: [1, 3] })
  })

  it('updateTariffPolicy is manager-only', async () => {
    session.current = reception
    await expect(updateTariffPolicy([5, 6])).rejects.toThrow(/forbidden/i)
  })

  it('getTariffPolicy rejects anonymous', async () => {
    session.current = null
    await expect(getTariffPolicy()).rejects.toThrow(/forbidden/i)
  })
})
