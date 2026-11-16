import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardSlipsInput } from '@/components/card-slips-input'
import { typedCents } from '@/components/money-input'

describe('CardSlipsInput', () => {
  it('starts empty: the entry with its label and "Somar", nothing submitted yet', () => {
    const html = renderToStaticMarkup(<CardSlipsInput id="fwd" name="cardSlip" label="Retirada em cartão" />)
    expect(html).toContain('for="fwd"')
    expect(html).toContain('Retirada em cartão')
    expect(html).toContain('inputMode="numeric"')
    expect(html).toContain('Somar')
    expect(html).not.toContain('name="cardSlip"')
    expect(html).not.toContain('comprovante')
  })
})

describe('typedCents', () => {
  it('reads the digits as cents, empty as null', () => {
    expect(typedCents('R$ 87,00')).toBe(8700)
    expect(typedCents('1')).toBe(1)
    expect(typedCents('R$ ')).toBeNull()
  })
})
