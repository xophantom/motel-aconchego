import { z } from 'zod'

export const costCenterSchema = z.object({
  code: z.string().min(1).max(20),
  description: z.string().min(1),
})
export type CostCenterInput = z.infer<typeof costCenterSchema>

export const entrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  kind: z.enum(['expense', 'income']),
  amount: z.coerce.number().positive(),
  description: z.string().min(1),
  costCenter: z.string().min(1).nullish(),
})
export type EntryInput = z.infer<typeof entrySchema>
