import { z } from 'zod'

// Codes are uppercase: "ref" and "REF" read as the same product.
export const productSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(3),
  description: z.string().trim().min(1),
  category: z.enum(['minibar', 'erotic', 'kitchen', 'other']),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).default(0),
  stockQty: z.coerce.number().int().min(0).default(0), // initial stock; later it moves only by restock/adjust
  minStock: z.coerce.number().int().min(0).default(0),
  trackStock: z.coerce.boolean().default(true),
})
export type ProductInput = z.infer<typeof productSchema>

// Editing keeps the code (it identifies the product in history) and leaves the stock alone.
export const productUpdateSchema = productSchema.omit({ code: true, stockQty: true })
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>

export const addConsumptionSchema = z.object({
  productCode: z.string().min(1),
  qty: z.coerce.number().int().min(1),
})
