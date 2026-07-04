import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listEmployees } from '@/server/data/employees'
import { CreateUserForm, EditUserDialog } from './user-forms'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/page-header'

const ROLE_LABEL: Record<string, string> = { manager: 'Gerente', reception: 'Recepção', housekeeper: 'Camareira' }

async function UsersList() {
  await connection()
  let users
  try {
    users = await listEmployees() // throws "Forbidden" if not manager
  } catch {
    redirect('/')
  }
  return (
    <>
      <Card className="mb-8">
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={u.active ? undefined : 'opacity-55'}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.username}</TableCell>
                  <TableCell>{ROLE_LABEL[u.role] ?? u.role}</TableCell>
                  <TableCell>
                    {u.active
                      ? <Badge variant="secondary" className="border-transparent bg-[color-mix(in_oklab,var(--room-free)_18%,transparent)] text-[var(--room-free)]">Ativo</Badge>
                      : <Badge variant="outline" className="text-muted-foreground">Inativo</Badge>}
                  </TableCell>
                  <TableCell>
                    <EditUserDialog
                      user={{ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CreateUserForm />
    </>
  )
}

export default async function UsersPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Funcionários" subtitle="Contas de acesso e papéis da equipe." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <UsersList />
      </Suspense>
    </main>
  )
}
