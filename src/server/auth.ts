import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/server/db'
import { verifyPassword } from '@/server/password'
import type { EmployeeRole } from '@/generated/prisma/client'

export async function authorizeCredentials(username: string, password: string) {
  const e = await db.employee.findUnique({ where: { username } })
  if (!e || !e.active) return null
  if (!(await verifyPassword(password, e.passwordHash))) return null
  return { id: String(e.id), name: e.name, role: e.role as EmployeeRole }
}

const authSecret = process.env.AUTH_SECRET
if (!authSecret && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_SECRET is required in production')
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret ?? 'dev-only-insecure-secret',
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      authorize: async (creds) => {
        const username = String(creds?.username ?? '')
        const password = String(creds?.password ?? '')
        if (!username || !password) return null
        return authorizeCredentials(username, password)
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.name = user.name
        token.role = (user as { role: EmployeeRole }).role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string
        session.user.role = token.role as EmployeeRole
      }
      return session
    },
  },
})
