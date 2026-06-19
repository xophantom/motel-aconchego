import { Suspense } from 'react'
import { connection } from 'next/server'
import { getCurrentUser } from '@/server/session'
import { signOut } from '@/server/auth'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/mode-toggle'

async function HomeContent() {
  await connection()
  const me = await getCurrentUser()
  return (
    <>
      <p className="mt-2">Olá, {me?.name} ({me?.role}).</p>
      <nav className="mt-4 flex flex-wrap items-center gap-3">
        <Button asChild variant="link"><a href="/quartos">Painel</a></Button>
        {(me?.role === 'manager' || me?.role === 'reception') && <Button asChild variant="link"><a href="/caixa">Caixa</a></Button>}
        {me?.role === 'manager' && <Button asChild variant="link"><a href="/tarifas">Tarifas</a></Button>}
        {me?.role === 'manager' && <Button asChild variant="link"><a href="/produtos">Produtos</a></Button>}
        {me?.role === 'manager' && <Button asChild variant="link"><a href="/users">Funcionários</a></Button>}
        <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
          <Button variant="ghost">Sair</Button>
        </form>
        <ModeToggle />
      </nav>
    </>
  )
}

export default async function Home() {
  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">MotelAconchego</h1>
        <ModeToggle />
      </div>
      <Suspense fallback={null}>
        <HomeContent />
      </Suspense>
      <p className="mt-6 text-muted-foreground">Telas de negócio (quartos, caixa, relatórios) vêm nas próximas fatias.</p>
    </main>
  )
}
