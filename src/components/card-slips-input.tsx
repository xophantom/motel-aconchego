'use client'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { BRL, typedCents } from '@/components/money-input'

const brl = (cents: number) => BRL.format(cents / 100)

// Card withdrawal at shift close, entered like the old system: one card/Pix
// receipt at a time (Enter or "Somar"), summed beside. Each receipt — and a
// value still in the field — submits as its own `name` field (plain decimal),
// so the server records one withdrawal per receipt. `listClassName` places the
// receipts list (e.g. on its own line in a flex-wrap form).
export function CardSlipsInput({ name, id, label, className, listClassName }: {
  name: string; id: string; label: string; className?: string; listClassName?: string
}) {
  const [slips, setSlips] = useState<number[]>([]) // cents
  const [entry, setEntry] = useState<number | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const all = entry ? [...slips, entry] : slips
  const total = all.reduce((a, c) => a + c, 0)

  // React resets the form after its action, and the close only comes back here
  // when it failed (wrong password): keep the receipts, the typed one joining them.
  useEffect(() => {
    const form = ref.current?.form
    if (!form) return
    const onReset = () => { if (entry) { setSlips((s) => [...s, entry]); setEntry(null) } }
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [entry])

  function add() {
    if (entry) setSlips((s) => [...s, entry])
    setEntry(null)
    ref.current?.focus()
  }

  return (
    <>
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        <div className={cn('flex gap-1', className)}>
          <Input
            ref={ref}
            id={id}
            inputMode="numeric"
            autoComplete="off"
            value={entry == null ? '' : brl(entry)}
            placeholder="R$ 0,00"
            onChange={(e) => setEntry(typedCents(e.target.value))}
            onFocus={(e) => e.target.select()}
            // Enter sums the receipt instead of submitting the form
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            className="tnum flex-1 text-right"
          />
          <Button type="button" variant="outline" onClick={add}>Somar</Button>
        </div>
      </div>
      {slips.length > 0 && (
        <div className={cn('grid gap-1', listClassName)}>
          <div className="flex flex-wrap gap-1">
            {slips.map((c, i) => (
              <span key={i} className="tnum inline-flex items-center rounded-md border bg-muted/40 py-0.5 pl-2 text-xs">
                {brl(c)}
                <button type="button" aria-label={`Tirar ${brl(c)}`} onClick={() => setSlips((s) => s.filter((_, j) => j !== i))} className="px-1.5 text-muted-foreground hover:text-foreground">×</button>
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {all.length} {all.length === 1 ? 'comprovante' : 'comprovantes'} · total <span className="tnum font-semibold text-foreground">{brl(total)}</span>
          </p>
        </div>
      )}
      {all.map((c, i) => <input key={i} type="hidden" name={name} value={(c / 100).toFixed(2)} />)}
    </>
  )
}
