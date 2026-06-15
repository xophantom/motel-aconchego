import type { EmployeeRole } from '@/generated/prisma/client'
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; role: EmployeeRole }
  }
}
declare module 'next-auth/jwt' {
  interface JWT { role?: EmployeeRole }
}
