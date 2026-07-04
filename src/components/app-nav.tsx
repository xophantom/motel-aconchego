import { Suspense } from 'react'
import { connection } from 'next/server'
import { getCurrentUser } from '@/server/session'
import { signOut } from '@/server/auth'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/mode-toggle'
import { NavLinks } from '@/components/nav-links'

const ROLE_LABEL = { manager: 'Gerente', reception: 'Recepção', housekeeper: 'Camareira' } as const

async function NavContent() {
  await connection()
  const me = await getCurrentUser()
  if (!me) return null
  const isManager = me.role === 'manager'
  const isRecOrMgr = isManager || me.role === 'reception'
  const links = [
    { href: '/quartos', label: 'Painel' },
    ...(isRecOrMgr ? [{ href: '/caixa', label: 'Caixa' }] : []),
    ...(isManager
      ? [
          { href: '/tarifas', label: 'Tarifas' },
          { href: '/produtos', label: 'Produtos' },
          { href: '/relatorios', label: 'Relatórios' },
          { href: '/fidelidade', label: 'Fidelidade' },
          { href: '/users', label: 'Funcionários' },
        ]
      : []),
  ]
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <a href="/quartos" className="mr-2 flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
          <span className="size-2 rounded-full bg-primary shadow-[0_0_10px_2px_var(--primary)]" aria-hidden />
          <span>
            Motel<span className="text-primary [text-shadow:0_0_18px_color-mix(in_oklab,var(--primary)_55%,transparent)]">Aconchego</span>
          </span>
        </a>
        <NavLinks links={links} />
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {me.name} · {ROLE_LABEL[me.role]}
          </span>
          <ModeToggle />
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
            <Button variant="ghost" size="sm">Sair</Button>
          </form>
        </div>
      </div>
    </header>
  )
}

export function AppNav() {
  return (
    <Suspense fallback={null}>
      <NavContent />
    </Suspense>
  )
}
