import { z } from 'zod'

export const cashMovementSchema = z.object({
  type: z.enum(['withdrawal', 'supply', 'correction']),
  amount: z.coerce.number().refine((n) => n !== 0, 'Valor não pode ser zero'),
  method: z.enum(['cash', 'card']).optional(),
  description: z.string().optional(),
}).refine((v) => v.type !== 'withdrawal' || v.method != null, { message: 'Método obrigatório na retirada', path: ['method'] })
export type CashMovementInput = z.infer<typeof cashMovementSchema>

export const closeShiftSchema = z.object({
  finalWithdrawCash: z.coerce.number().min(0).default(0),
  // card/Pix receipts, entered one by one
  cardSlips: z.array(z.coerce.number().positive()).default([]),
  password: z.string().min(1, 'Senha obrigatória'),
})
export type CloseShiftInput = z.infer<typeof closeShiftSchema>
