import { Suspense } from 'react'
import { connection } from 'next/server'
import { getCurrentUser } from '@/server/session'
import { signOut } from '@/server/auth'

async function HomeContent() {
  await connection()
  const me = await getCurrentUser()
  return (
    <>
      <p className="mt-2">Olá, {me?.name} ({me?.role}).</p>
      <nav className="mt-4 flex gap-4">
        {me?.role === 'manager' && <a href="/users" className="underline">Funcionários</a>}
        <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
          <button className="underline">Sair</button>
        </form>
      </nav>
    </>
  )
}

export default async function Home() {
  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <h1 className="text-xl font-semibold">MotelAconchego</h1>
      <Suspense fallback={null}>
        <HomeContent />
      </Suspense>
      <p className="mt-6 text-gray-500">Telas de negócio (quartos, caixa, relatórios) vêm nas próximas fatias.</p>
    </main>
  )
}
