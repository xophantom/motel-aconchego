'use client'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CodenameInput } from '@/components/codename-input'
import { CODENAME_MAX } from '@/lib/codename'
import { renameCodenameAction, mergeCodenameAction, deleteCodenameAction, type ActionState } from './actions'

// Rename, fold a duplicate into another codename, or delete one never used.
// Merge and delete can't be undone, so both ask before going.
export function CodenameManage({ id, codename, hasVisits }: { id: string; codename: string; hasVisits: boolean }) {
  const [renameState, renameAction] = useActionState<ActionState, FormData>(renameCodenameAction.bind(null, id), { ok: false })
  const [mergeState, mergeAction] = useActionState<ActionState, FormData>(mergeCodenameAction.bind(null, id), { ok: false })
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteCodenameAction.bind(null, id), { ok: false })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form action={renameAction} className="grid gap-1">
        <Label htmlFor={`rename-${id}`}>Renomear</Label>
        <div className="flex gap-2">
          <Input key={codename} id={`rename-${id}`} name="codename" defaultValue={codename} maxLength={CODENAME_MAX} required />
          <Button type="submit" variant="outline">Salvar</Button>
        </div>
        {renameState.error && <span className="text-destructive text-xs">{renameState.error}</span>}
      </form>
      <form
        action={mergeAction}
        className="grid gap-1"
        onSubmit={(e) => {
          const into = String(new FormData(e.currentTarget).get('into') ?? '').trim()
          if (into && !confirm(`Juntar ${codename} em ${into}? As visitas e benefícios de ${codename} passam para ${into}, e ${codename} deixa de existir.`)) e.preventDefault()
        }}
      >
        <Label htmlFor={`merge-${id}`}>Juntar com outro codinome (duplicado)</Label>
        <div className="flex items-start gap-2">
          <div className="flex-1"><CodenameInput id={`merge-${id}`} name="into" allowCreate={false} /></div>
          <Button type="submit" variant="outline">Juntar</Button>
        </div>
        {mergeState.error && <span className="text-destructive text-xs">{mergeState.error}</span>}
      </form>
      {!hasVisits && (
        <form action={deleteAction} className="flex items-center gap-2" onSubmit={(e) => { if (!confirm(`Excluir o codinome ${codename}?`)) e.preventDefault() }}>
          <Button type="submit" variant="ghost" className="text-destructive">Excluir codinome</Button>
          {deleteState.error && <span className="text-destructive text-xs">{deleteState.error}</span>}
          <span className="text-xs text-muted-foreground">Sem visitas, pode ser excluído.</span>
        </form>
      )}
    </div>
  )
}
