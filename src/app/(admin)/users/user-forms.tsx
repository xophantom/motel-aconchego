'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createUserAction, type ActionState } from './actions'

function SubmitBtn() {
  const { pending } = useFormStatus()
  return <button disabled={pending} className="bg-black text-white p-2 rounded">{pending ? 'Salvando…' : 'Criar'}</button>
}

export function CreateUserForm() {
  const [state, action] = useActionState<ActionState, FormData>(createUserAction, { ok: false })
  return (
    <form action={action} className="flex flex-col gap-2 max-w-sm">
      <h2 className="font-medium">Novo funcionário</h2>
      <input name="name" placeholder="Nome" className="border p-2 rounded" required />
      <input name="username" placeholder="Usuário" className="border p-2 rounded" required />
      <select name="role" className="border p-2 rounded" defaultValue="reception">
        <option value="reception">Recepção</option>
        <option value="manager">Gerente</option>
        <option value="housekeeper">Camareira</option>
      </select>
      <input name="password" type="password" placeholder="Senha inicial" className="border p-2 rounded" required />
      <SubmitBtn />
      {state.error && <p className="text-red-600 text-sm">{state.error}</p>}
      {state.ok && <p className="text-green-600 text-sm">Criado.</p>}
    </form>
  )
}
