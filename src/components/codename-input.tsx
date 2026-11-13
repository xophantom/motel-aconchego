'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { cleanCodename, codenameKey, CODENAME_MAX } from '@/lib/codename'
import { searchCodenamesAction } from '@/app/fidelidade/actions'
import type { CodenameMatch } from '@/server/data/loyalty'

type Option = { kind: 'match'; match: CodenameMatch } | { kind: 'create' }

const progressLabel = (m: CodenameMatch) => (m.available > 0 ? `🎁 ${m.available}` : `${m.done}/${m.everyVisits}`)

// Codename picker: searches as reception types; pick an existing codename or
// keep the typed text to create one (the server gets-or-creates it by key when
// the form is saved). The typed text is the submitted value.
export function CodenameInput({ id, name = 'codename', defaultValue = '', allowCreate = true, className }: {
  id?: string; name?: string; defaultValue?: string; allowCreate?: boolean; className?: string
}) {
  const [text, setText] = useState(defaultValue)
  const [matches, setMatches] = useState<CodenameMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const seq = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])

  const key = codenameKey(text)
  // the current codename (room already has one) isn't "new" just because no search ran yet
  const isCurrent = !!defaultValue && key === codenameKey(defaultValue)
  const exact = matches.find((m) => codenameKey(m.codename) === key)
  const options: Option[] = [
    ...matches.map((match) => ({ kind: 'match' as const, match })),
    ...(allowCreate && key && !exact && !isCurrent && !searching ? [{ kind: 'create' as const }] : []),
  ]

  // debounced; a slower earlier response never overwrites a newer one
  function search(q: string) {
    clearTimeout(timer.current)
    const n = ++seq.current
    if (!codenameKey(q)) { setMatches([]); setSearching(false); return }
    setSearching(true)
    timer.current = setTimeout(async () => {
      const found = await searchCodenamesAction(q)
      if (n !== seq.current) return
      setMatches(found)
      setSearching(false)
    }, 200)
  }

  function pick(o: Option) {
    if (o.kind === 'match') setText(o.match.codename)
    setOpen(false)
    setActive(-1)
  }

  const hint = !key
    ? (allowCreate ? 'opcional · sem codinome a visita não conta na fidelidade' : '')
    : searching ? 'buscando…'
    : exact ? `${exact.codename} · ${exact.available > 0 ? `🎁 ${exact.available} benefício(s) disponível(is)` : `${exact.done}/${exact.everyVisits} visitas`}`
    : isCurrent ? 'codinome atual'
    : allowCreate ? `novo codinome · será criado ao salvar` : 'codinome não encontrado'

  return (
    <div className="grid gap-1">
      <div className="relative">
        <Input
          id={id}
          name={name}
          value={text}
          maxLength={CODENAME_MAX}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open && options.length > 0}
          placeholder={allowCreate ? 'Buscar ou criar' : 'Buscar codinome'}
          className={className}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); search(e.target.value) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (!open || options.length === 0) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a <= 0 ? options.length - 1 : a - 1)) }
            else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(options[active]) }
            else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
          }}
        />
        {open && key && options.length > 0 && (
          <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md">
            {options.map((o, i) => (
              <li
                key={o.kind === 'match' ? o.match.id : 'create'}
                role="option"
                aria-selected={i === active}
                // keep focus in the input so blur doesn't close the list before the click lands
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={cn('flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5', i === active && 'bg-accent text-accent-foreground')}
              >
                {o.kind === 'match'
                  ? <><span>{o.match.codename}</span><span className="tnum text-xs text-muted-foreground">{progressLabel(o.match)}</span></>
                  : <span className="text-primary">+ Criar codinome “{cleanCodename(text)}”</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  )
}
