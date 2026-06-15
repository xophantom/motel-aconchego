import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listEmployees } from '@/server/data/employees'
import { CreateUserForm } from './user-forms'

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
      <table className="w-full mb-8 text-sm">
        <thead><tr className="text-left border-b"><th>Nome</th><th>Usuário</th><th>Papel</th><th>Ativo</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b">
              <td>{u.name}</td><td>{u.username}</td><td>{u.role}</td><td>{u.active ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <CreateUserForm />
    </>
  )
}

export default async function UsersPage() {
  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Funcionários</h1>
      <Suspense fallback={<p className="text-sm text-gray-500">Carregando…</p>}>
        <UsersList />
      </Suspense>
    </main>
  )
}
