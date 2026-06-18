import { z } from 'zod'

export const updateCategorySchema = z.object({
  billing: z.enum(['motel', 'hotel']),
  minPeriodMin: z.coerce.number().int().min(0),
  maxPeriodMin: z.coerce.number().int().min(0),
  includedGuests: z.coerce.number().int().min(1),
})

export const updateRateSchema = z.object({
  day: z.enum(['normal', 'special']),
  basePrice: z.coerce.number().min(0),
  excessPrice30m: z.coerce.number().min(0),
  overnightPrice: z.coerce.number().min(0),
  extraGuestPrice: z.coerce.number().min(0),
})

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
export type UpdateRateInput = z.infer<typeof updateRateSchema>
