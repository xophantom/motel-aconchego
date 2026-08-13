import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const addCashMovement = vi.hoisted(() => vi.fn(async () => ({})))
const closeShift = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock('@/server/data/shifts', () => ({ addCashMovement, closeShift, openShift: vi.fn() }))
import { cashMovementAction, closeShiftAction } from '@/app/caixa/actions'

function fd(obj: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(obj)) f.set(k, v); return f }
beforeEach(() => { addCashMovement.mockClear(); closeShift.mockClear() })

describe('caixa actions', () => {
  it('passes method on withdrawal', async () => {
    const out = await cashMovementAction({ ok: false }, fd({ type: 'withdrawal', amount: '100', method: 'card' }))
    expect(addCashMovement).toHaveBeenCalledWith(expect.objectContaining({ type: 'withdrawal', amount: 100, method: 'card' }))
    expect(out).toEqual({ ok: true })
  })
  it('rejects withdrawal without method', async () => {
    const out = await cashMovementAction({ ok: false }, fd({ type: 'withdrawal', amount: '100' }))
    expect(addCashMovement).not.toHaveBeenCalled()
    expect(out.ok).toBe(false)
  })
  it('closes with final withdrawals and the operator password', async () => {
    const out = await closeShiftAction('7', { ok: false }, fd({ finalWithdrawCash: '50', finalWithdrawCard: '0', password: 'senha1' }))
    expect(closeShift).toHaveBeenCalledWith(7n, { finalWithdrawCash: 50, finalWithdrawCard: 0, password: 'senha1' })
    expect(out).toEqual({ ok: true })
  })
  it('refuses to close without a password', async () => {
    const out = await closeShiftAction('7', { ok: false }, fd({ finalWithdrawCash: '50', finalWithdrawCard: '0' }))
    expect(closeShift).not.toHaveBeenCalled()
    expect(out.ok).toBe(false)
  })
})
