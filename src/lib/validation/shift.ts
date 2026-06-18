import { z } from 'zod'

export const openShiftSchema = z.object({ openingBalance: z.coerce.number().min(0).default(0) })
export const closeShiftSchema = z.object({ closingBalance: z.coerce.number().min(0).default(0) })
export const cashMovementSchema = z.object({
  type: z.enum(['withdrawal', 'supply', 'correction']),
  amount: z.coerce.number().refine((n) => n !== 0, 'Valor não pode ser zero'),
  description: z.string().optional(),
})
export type CashMovementInput = z.infer<typeof cashMovementSchema>
