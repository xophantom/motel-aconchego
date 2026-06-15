import { signIn } from '@/server/auth'
import { redirect } from 'next/navigation'

export default function LoginPage() {
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
  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold">MotelAconchego — Entrar</h1>
      <form action={login} className="flex flex-col gap-3">
        <input name="username" placeholder="Usuário" className="border p-2 rounded" required />
        <input name="password" type="password" placeholder="Senha" className="border p-2 rounded" required />
        <button className="bg-black text-white p-2 rounded">Entrar</button>
      </form>
    </main>
  )
}
