import 'server-only'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import type { EmployeeRole } from '@/generated/prisma/client'

export interface CurrentUser {
  id: number
  name: string
  role: EmployeeRole
}

// The JWT session reliably carries the user id; name/role are read fresh from the
// database so they're always current (role changes take effect immediately) and a
// deactivated user is treated as logged out.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth()
  const id = session?.user?.id
  if (!id) return null
  const e = await db.employee.findUnique({
    where: { id: Number(id) },
    select: { id: true, name: true, role: true, active: true },
  })
  if (!e || !e.active) return null
  return { id: e.id, name: e.name, role: e.role }
}
