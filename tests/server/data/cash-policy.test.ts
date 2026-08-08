import { vi, describe, it, expect } from 'vitest'
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))
import { getCashPolicy, updateCashPolicy } from '@/server/data/cash-policy'
const manager = { id: 1, name: 'M', role: 'manager' }
const reception = { id: 2, name: 'R', role: 'reception' }

describe('cash policy DAL', () => {
  it('defaults to 150 when no row', async () => {
    session.current = manager
    expect(await getCashPolicy()).toEqual({ expectedOpeningBalance: 150 })
  })
  it('updates (manager) and reads back', async () => {
    session.current = manager
    expect(await updateCashPolicy(200)).toEqual({ expectedOpeningBalance: 200 })
    expect(await getCashPolicy()).toEqual({ expectedOpeningBalance: 200 })
  })
  it('reception cannot update', async () => {
    session.current = reception
    await expect(updateCashPolicy(200)).rejects.toThrow(/forbidden/i)
  })
  it('anonymous cannot read', async () => {
    session.current = null
    await expect(getCashPolicy()).rejects.toThrow(/forbidden/i)
  })
})
