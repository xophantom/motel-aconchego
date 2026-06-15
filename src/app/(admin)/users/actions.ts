'use server'
import { updateTag } from 'next/cache'
import { Prisma } from '@/generated/prisma/client'
import { createEmployeeSchema, updateEmployeeSchema, resetPasswordSchema } from '@/lib/validation/employee'
import * as employees from '@/server/data/employees'

export type ActionState = { ok: boolean; error?: string }

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createEmployeeSchema.safeParse({
    name: formData.get('name'),
    username: formData.get('username'),
    role: formData.get('role'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }
  try {
    await employees.createEmployee(parsed.data)
  } catch (e) {
    return { ok: false, error: mapError(e) }
  }
  updateTag('employees')
  return { ok: true }
}

export async function updateUserAction(id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateEmployeeSchema.safeParse({
    role: formData.get('role'),
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
  })
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }
  try {
    await employees.updateEmployee(id, parsed.data)
  } catch (e) {
    return { ok: false, error: mapError(e) }
  }
  updateTag('employees')
  return { ok: true }
}

export async function resetPasswordAction(id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({ password: formData.get('password') })
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }
  try {
    await employees.resetPassword(id, parsed.data.password)
  } catch (e) {
    return { ok: false, error: mapError(e) }
  }
  return { ok: true }
}

export async function deactivateUserAction(id: number): Promise<ActionState> {
  try {
    await employees.deactivateEmployee(id)
  } catch (e) {
    return { ok: false, error: mapError(e) }
  }
  updateTag('employees')
  return { ok: true }
}

function firstError(err: import('zod').ZodError): string {
  // Scan all issues: prioritise the password field so short-password is always
  // reported as "senha" even when another field (e.g. username) also fails.
  const passwordIssue = err.issues.find((i) => i.path[0] === 'password')
  if (passwordIssue) return 'Senha precisa de ao menos 6 caracteres.'
  const issue = err.issues[0]
  return issue?.message ?? 'Dados inválidos.'
}

function mapError(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return 'Usuário (username) já existe.'
  }
  if (e instanceof Error && /last manager/i.test(e.message)) return 'Não é possível remover o último gerente.'
  if (e instanceof Error && /forbidden/i.test(e.message)) return 'Sem permissão.'
  return 'Erro ao salvar.'
}
