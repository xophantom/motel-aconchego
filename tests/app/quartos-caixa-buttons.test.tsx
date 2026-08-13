import { vi, describe, it, expect } from 'vitest'
vi.mock('@/app/caixa/actions', () => ({ closeShiftAction: () => async () => ({ ok: false }) }))
import { renderToStaticMarkup } from 'react-dom/server'
import { CloseTurnoButton } from '@/app/quartos/close-turno'

describe('CloseTurnoButton', () => {
  it('renders the trigger', () => {
    const html = renderToStaticMarkup(<CloseTurnoButton shiftId="7" saldo={310} retiradoDinheiro={0} retiradoCartao={0} />)
    expect(html).toContain('Fechar turno')
  })
})
