import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MoneyInput } from '@/components/money-input'

// Intl puts a no-break space between "R$" and the number
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/ /g, ' ')

describe('MoneyInput', () => {
  it('shows a stored value as BRL and submits the plain decimal', () => {
    const out = html(<MoneyInput name="cost" defaultValue={1.3} />)
    expect(out).toContain('value="R$ 1,30"')
    expect(out).toContain('type="hidden" name="cost" value="1.30"')
    expect(out).toContain('inputMode="numeric"')
  })
  it('formats thousands and accepts the string decimals the server sends', () => {
    const out = html(<MoneyInput name="price" defaultValue="1234.5" />)
    expect(out).toContain('value="R$ 1.234,50"')
    expect(out).toContain('name="price" value="1234.50"')
  })
  it('starts at R$ 0,00 by default, or empty (submitting nothing) when optional', () => {
    expect(html(<MoneyInput name="a" />)).toContain('name="a" value="0.00"')
    const opt = html(<MoneyInput name="b" optional />)
    expect(opt).toContain('name="b" value=""')
    expect(opt).toContain('placeholder="R$ 0,00"')
  })
  it('keeps the sign only when negatives are allowed (cash correction)', () => {
    const neg = html(<MoneyInput name="amount" defaultValue={-5} allowNegative />)
    expect(neg).toContain('value="-R$ 5,00"')
    expect(neg).toContain('name="amount" value="-5.00"')
    expect(neg).toContain('Trocar sinal')
    expect(html(<MoneyInput name="amount" defaultValue={-5} />)).toContain('name="amount" value="5.00"')
  })
})
