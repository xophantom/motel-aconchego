'use client'
import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createUserAction, updateUserAction, resetPasswordAction, type ActionState } from './actions'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Salvando…' : 'Criar'}
    </Button>
  )
}

export function CreateUserForm() {
  const [state, action] = useActionState<ActionState, FormData>(createUserAction, { ok: false })
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Novo funcionário</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-name">Nome</Label>
            <Input id="cf-name" name="name" placeholder="Nome completo" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-username">Usuário</Label>
            <Input id="cf-username" name="username" placeholder="Nome de usuário" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-role">Papel</Label>
            <NativeSelect id="cf-role" name="role" defaultValue="reception">
              <NativeSelectOption value="reception">Recepção</NativeSelectOption>
              <NativeSelectOption value="manager">Gerente</NativeSelectOption>
              <NativeSelectOption value="housekeeper">Camareira</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-password">Senha inicial</Label>
            <Input id="cf-password" name="password" type="password" placeholder="Senha inicial" required />
          </div>
          <SubmitBtn />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state.ok && (
            <p className="text-sm text-[var(--room-free)]">Funcionário criado com sucesso.</p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function EditSubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Salvando…' : 'Salvar'}
    </Button>
  )
}

function ResetPasswordSubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Resetando…' : 'Resetar senha'}
    </Button>
  )
}

type EditableUser = {
  id: number
  name: string
  username: string
  role: 'manager' | 'reception' | 'housekeeper'
  active: boolean
}

export function EditUserDialog({ user }: { user: EditableUser }) {
  const [open, setOpen] = useState(false)
  const [updateState, updateFormAction] = useActionState<ActionState, FormData>(
    updateUserAction.bind(null, user.id),
    { ok: false },
  )
  const [resetState, resetFormAction] = useActionState<ActionState, FormData>(
    resetPasswordAction.bind(null, user.id),
    { ok: false },
  )

  useEffect(() => {
    if (updateState.ok) setOpen(false)
  }, [updateState.ok])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {user.name}</DialogTitle>
        </DialogHeader>
        <form action={updateFormAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`ef-role-${user.id}`}>Papel</Label>
            <NativeSelect id={`ef-role-${user.id}`} name="role" defaultValue={user.role}>
              <NativeSelectOption value="reception">Recepção</NativeSelectOption>
              <NativeSelectOption value="manager">Gerente</NativeSelectOption>
              <NativeSelectOption value="housekeeper">Camareira</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="flex items-center gap-2">
            <input
              id={`ef-active-${user.id}`}
              type="checkbox"
              name="active"
              defaultChecked={user.active}
            />
            <Label htmlFor={`ef-active-${user.id}`}>Ativo</Label>
          </div>
          <EditSubmitBtn />
          {updateState.error && (
            <Alert variant="destructive">
              <AlertDescription>{updateState.error}</AlertDescription>
            </Alert>
          )}
        </form>
        <div className="flex flex-col gap-4 border-t pt-4">
          <form action={resetFormAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`rf-password-${user.id}`}>Nova senha</Label>
              <Input
                id={`rf-password-${user.id}`}
                name="password"
                type="password"
                placeholder="Nova senha"
                required
              />
            </div>
            <ResetPasswordSubmitBtn />
            {resetState.error && (
              <Alert variant="destructive">
                <AlertDescription>{resetState.error}</AlertDescription>
              </Alert>
            )}
            {resetState.ok && (
              <p className="text-sm text-[var(--room-free)]">Senha alterada com sucesso.</p>
            )}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
