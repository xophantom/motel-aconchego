import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listEmployees } from '@/server/data/employees'
import { CreateUserForm } from './user-forms'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell>{u.active ? 'Sim' : 'Não'}</TableCell>
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
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <h1 className="mb-6 text-xl font-semibold">Funcionários</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <UsersList />
      </Suspense>
    </main>
  )
}
