import { z } from 'zod'

export const checkInSchema = z.object({
  roomNumber: z.string().min(1),
  day: z.enum(['normal', 'special']),
  guests: z.coerce.number().int().min(1),
  prepaidAmount: z.coerce.number().min(0).default(0),
})
export type CheckInInput = z.infer<typeof checkInSchema>
