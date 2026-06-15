import 'server-only'
import { auth } from '@/server/auth'
import type { EmployeeRole } from '@/generated/prisma/client'

export interface CurrentUser {
  id: number
  name: string
  role: EmployeeRole
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth()
  const u = session?.user
  if (!u?.id) return null
  return { id: Number(u.id), name: u.name ?? '', role: u.role as EmployeeRole }
}
