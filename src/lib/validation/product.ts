import { z } from 'zod'

export const productSchema = z.object({
  code: z.string().min(1).max(3),
  description: z.string().min(1),
  category: z.enum(['minibar', 'erotic', 'kitchen', 'other']),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).default(0),
  stockQty: z.coerce.number().int().default(0),
  minStock: z.coerce.number().int().min(0).default(0),
  trackStock: z.coerce.boolean().default(true),
})
export type ProductInput = z.infer<typeof productSchema>

export const addConsumptionSchema = z.object({
  productCode: z.string().min(1),
  qty: z.coerce.number().int().min(1),
})
