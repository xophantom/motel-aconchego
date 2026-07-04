import { Suspense } from 'react'
import { signIn } from '@/server/auth'
import { redirect } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function login(formData: FormData) {
  'use server'
  try {
    await signIn('credentials', {
      username: formData.get('username'),
      password: formData.get('password'),
      redirectTo: '/',
    })
  } catch (e) {
    // Auth.js throws a redirect on success; rethrow it. Auth errors -> back to /login?error=1
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/login?error=1')
  }
}

function LoginForm({ error }: { error?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <form action={login} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Usuário</Label>
          <Input id="username" name="username" placeholder="Usuário" autoComplete="username" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" placeholder="Senha" autoComplete="current-password" required />
        </div>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Usuário ou senha inválidos.
          </p>
        )}
        <Button type="submit" className="mt-1 w-full">Entrar</Button>
      </form>
    </div>
  )
}

async function ErrorAwareForm({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return <LoginForm error={!!error} />
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-[0_0_28px_-6px_var(--primary)]">
            <span className="size-3 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
          </span>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            Motel<span className="text-primary [text-shadow:0_0_18px_color-mix(in_oklab,var(--primary)_55%,transparent)]">Aconchego</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Entre para começar o turno.</p>
        </div>
        <Suspense fallback={<LoginForm />}>
          <ErrorAwareForm searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  )
}
