import { z } from 'zod'
import { ENTRY_TIME_RE } from '@/lib/time'
import { CODENAME_MAX } from '@/lib/codename'

// "HH:MM" (Brasília). Empty means "now" — the default entry time.
const entryTime = z.string().trim().regex(ENTRY_TIME_RE)

export const checkInSchema = z.object({
  roomNumber: z.string().min(1),
  day: z.enum(['normal', 'special']),
  chargeMode: z.enum(['period', 'overnight']).default('period'),
  guests: z.coerce.number().int().min(1),
  prepaidAmount: z.coerce.number().min(0).default(0),
  plate: z.string().trim().max(20).optional(),
  codename: z.string().trim().max(CODENAME_MAX).optional(), // the loyalty client
  checkInTime: entryTime.optional(),
})
export type CheckInInput = z.infer<typeof checkInSchema>

export const addPrepaidSchema = z.object({ amount: z.coerce.number().positive() })
export const editCheckInSchema = z.object({ checkInTime: entryTime })
// "HH:MM" of the exit when the checkout is registered late; empty = now.
export const checkOutSchema = z.object({ checkOutTime: entryTime.optional() })
