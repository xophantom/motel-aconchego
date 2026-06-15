import { z } from 'zod'

export const roleSchema = z.enum(['reception', 'manager', 'housekeeper'])

export const createEmployeeSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(3).max(20),
  role: roleSchema,
  password: z.string().min(6).max(72),
})

export const updateEmployeeSchema = z.object({
  role: roleSchema,
  active: z.boolean(),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(6).max(72),
})

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
