import { Suspense } from 'react'
import { connection } from 'next/server'
import { getCurrentUser } from '@/server/session'
import { signOut } from '@/server/auth'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/mode-toggle'

const ROLE_LABEL = { manager: 'Gerente', reception: 'Recepção', housekeeper: 'Camareira' } as const

async function NavContent() {
  await connection()
  const me = await getCurrentUser()
  if (!me) return null
  const isManager = me.role === 'manager'
  const isRecOrMgr = isManager || me.role === 'reception'
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2">
        <a href="/quartos" className="mr-3 font-semibold">MotelAconchego</a>
        <NavLink href="/quartos">Painel</NavLink>
        {isRecOrMgr && <NavLink href="/caixa">Caixa</NavLink>}
        {isManager && <NavLink href="/tarifas">Tarifas</NavLink>}
        {isManager && <NavLink href="/produtos">Produtos</NavLink>}
        {isManager && <NavLink href="/relatorios">Relatórios</NavLink>}
        {isManager && <NavLink href="/fidelidade">Fidelidade</NavLink>}
        {isManager && <NavLink href="/users">Funcionários</NavLink>}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{me.name} · {ROLE_LABEL[me.role]}</span>
          <ModeToggle />
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
            <Button variant="ghost" size="sm">Sair</Button>
          </form>
        </div>
      </div>
    </header>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Button asChild variant="ghost" size="sm"><a href={href}>{children}</a></Button>
}

export function AppNav() {
  return (
    <Suspense fallback={null}>
      <NavContent />
    </Suspense>
  )
}
