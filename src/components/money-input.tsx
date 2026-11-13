'use client'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const MAX_CENTS = 9_999_999_999 // R$ 99.999.999,99

// 12.5, "12.5", "12,50" → 1250 cents (sign apart); empty → null
function toCents(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : null
}

// Money field, Brazilian style: shows "R$ 1.234,56" and fills from the cents as
// digits are typed (1, 3, 0 → R$ 1,30), like bank apps, with the numeric
// keypad on the tablet. Submits the plain decimal ("1234.56") under `name`, so
// server-side parsing is unchanged. `optional` starts empty (and submits ''),
// otherwise it starts at R$ 0,00; `required` then demands something typed.
// `allowNegative` adds a ± toggle (a typed "-" flips the sign too).
export function MoneyInput({ name, id, defaultValue, optional = false, allowNegative = false, required, placeholder, className }: {
  name: string; id?: string; defaultValue?: string | number | null; optional?: boolean; allowNegative?: boolean
  required?: boolean; placeholder?: string; className?: string
}) {
  const initialCents = toCents(defaultValue) ?? (optional ? null : 0)
  const initialNegative = allowNegative && Number(defaultValue) < 0
  const [cents, setCents] = useState<number | null>(initialCents)
  const [negative, setNegative] = useState(initialNegative)
  const ref = useRef<HTMLInputElement>(null)

  // React resets a form after its action runs; this field is controlled, so it
  // follows the form's reset back to its initial value, like a plain input.
  useEffect(() => {
    const form = ref.current?.form
    if (!form) return
    const onReset = () => { setCents(initialCents); setNegative(initialNegative) }
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [initialCents, initialNegative])

  const signed = cents == null ? null : (negative && cents > 0 ? -cents : cents) / 100
  const shown = signed == null ? '' : BRL.format(signed)

  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, '')
    setCents(digits ? Math.min(Number(digits), MAX_CENTS) : optional ? null : 0)
    // the shown value already carries one "-" when negative: an odd count means negative
    if (allowNegative) setNegative(((raw.match(/-/g)?.length ?? 0) % 2) === 1)
  }

  const input = (
    <Input
      ref={ref}
      id={id}
      inputMode="numeric"
      autoComplete="off"
      value={shown}
      placeholder={placeholder ?? (optional ? 'R$ 0,00' : undefined)}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
      className={cn('tnum text-right', allowNegative ? 'flex-1' : className)}
    />
  )
  return (
    <>
      {allowNegative ? (
        <div className={cn('flex gap-1', className)}>
          <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label="Trocar sinal" onClick={() => setNegative((n) => !n)}>±</Button>
          {input}
        </div>
      ) : input}
      <input type="hidden" name={name} value={signed == null ? '' : signed.toFixed(2)} />
    </>
  )
}
