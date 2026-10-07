import { z } from 'zod'
import { ENTRY_TIME_RE } from '@/lib/time'

// "HH:MM" (Brasília). Empty means "now" — the default entry time.
const entryTime = z.string().trim().regex(ENTRY_TIME_RE)

export const checkInSchema = z.object({
  roomNumber: z.string().min(1),
  day: z.enum(['normal', 'special']),
  chargeMode: z.enum(['period', 'overnight']).default('period'),
  guests: z.coerce.number().int().min(1),
  prepaidAmount: z.coerce.number().min(0).default(0),
  plate: z.string().trim().optional(),
  checkInTime: entryTime.optional(),
})
export type CheckInInput = z.infer<typeof checkInSchema>

export const addPrepaidSchema = z.object({ amount: z.coerce.number().positive() })
export const editCheckInSchema = z.object({ checkInTime: entryTime })
