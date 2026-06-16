'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createUserAction, type ActionState } from './actions'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

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
            <p className="text-sm text-green-600 dark:text-green-400">Funcionário criado com sucesso.</p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
