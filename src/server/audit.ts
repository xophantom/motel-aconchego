import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'

export type LogInput = {
  type: string
  description: string
  entity?: string
  entityId?: string
  roomNumber?: string | null
}

// Best-effort audit trail. Called at the end of a mutation's happy path,
// OUTSIDE any transaction, so a logging failure can never roll back or break
// the operation it observes. Reads the operator from the session itself.
export async function logEvent(input: LogInput): Promise<void> {
  try {
    const me = await getCurrentUser()
    await db.eventLog.create({
      data: {
        type: input.type,
        description: input.description,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        roomNumber: input.roomNumber ?? null,
        employeeId: me?.id ?? null,
      },
    })
  } catch {
    // swallow: the audit log is observability, not a hard dependency.
  }
}
