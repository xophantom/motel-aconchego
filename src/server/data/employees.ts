import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { hashPassword } from '@/server/password'
import { logEvent } from '@/server/audit'
import type { CreateEmployeeInput, UpdateEmployeeInput } from '@/lib/validation/employee'

async function requireManager() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'users:manage')) throw new Error('Forbidden')
  return me
}

export async function listEmployees() {
  await requireManager()
  return db.employee.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, username: true, role: true, active: true },
  })
}

export async function createEmployee(input: CreateEmployeeInput) {
  await requireManager()
  const passwordHash = await hashPassword(input.password)
  const created = await db.employee.create({
    data: { name: input.name, username: input.username, role: input.role, passwordHash },
    select: { id: true, name: true, username: true, role: true, active: true },
  })
  await logEvent({ type: 'user.create', description: `Funcionário ${created.name} (${created.role}) criado`, entity: 'employee', entityId: String(created.id) })
  return created
}

export async function updateEmployee(id: number, input: UpdateEmployeeInput) {
  await requireManager()
  await assertNotLastManager(id, { nextRole: input.role, nextActive: input.active })
  const updated = await db.employee.update({
    where: { id },
    data: { role: input.role, active: input.active },
    select: { id: true, name: true, username: true, role: true, active: true },
  })
  await logEvent({ type: 'user.update', description: `Funcionário ${updated.name} atualizado (${updated.role}, ${updated.active ? 'ativo' : 'inativo'})`, entity: 'employee', entityId: String(id) })
  return updated
}

export async function deactivateEmployee(id: number) {
  await requireManager()
  await assertNotLastManager(id, { nextActive: false })
  const deactivated = await db.employee.update({ where: { id }, data: { active: false } })
  await logEvent({ type: 'user.deactivate', description: `Funcionário ${deactivated.name} desativado`, entity: 'employee', entityId: String(id) })
  return deactivated
}

export async function resetPassword(id: number, password: string) {
  await requireManager()
  const reset = await db.employee.update({ where: { id }, data: { passwordHash: await hashPassword(password) } })
  await logEvent({ type: 'user.reset', description: `Senha redefinida para ${reset.name}`, entity: 'employee', entityId: String(id) })
  return reset
}

export function countActiveManagers() {
  return db.employee.count({ where: { role: 'manager', active: true } })
}

async function assertNotLastManager(
  id: number,
  next: { nextRole?: 'reception' | 'manager' | 'housekeeper'; nextActive: boolean },
) {
  const target = await db.employee.findUnique({ where: { id } })
  if (!target) return
  const wasActiveManager = target.role === 'manager' && target.active
  const staysActiveManager = (next.nextRole ?? target.role) === 'manager' && next.nextActive
  if (wasActiveManager && !staysActiveManager) {
    const others = await db.employee.count({ where: { role: 'manager', active: true, id: { not: id } } })
    if (others === 0) throw new Error('Cannot remove the last manager')
  }
}
