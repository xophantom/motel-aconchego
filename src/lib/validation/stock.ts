import { z } from 'zod'

export const stockMovementSchema = z.object({
  productCode: z.string().min(1),
  qty: z.coerce.number().int().refine((n) => n !== 0, 'Quantidade não pode ser zero'),
  reason: z.enum(['restock', 'loss', 'inventory', 'correction']),
  unitCost: z.coerce.number().min(0).nullish(),
  note: z.string().trim().min(1).nullish(),
})
export type StockMovementInput = z.infer<typeof stockMovementSchema>
