import { vi, beforeEach } from 'vitest'

// server-only is a build-time marker with no runtime in Vitest — stub it globally
// so any DAL/module can be imported from a test.
vi.mock('server-only', () => ({}))

// next-auth imports next/server at module load time, which is not available
// in the Vitest/Node environment. Stub it out so tests can import @/server/auth
// and exercise authorizeCredentials without a Next.js runtime.
vi.mock('next-auth', () => ({
  default: () => ({
    handlers: { GET: undefined, POST: undefined },
    auth: async () => null,
    signIn: async () => {},
    signOut: async () => {},
  }),
}))

vi.mock('next-auth/providers/credentials', () => ({
  default: () => ({ id: 'credentials', type: 'credentials' }),
}))

// DB-backed tests share one test database. Files run sequentially, but each file
// leaves its fixtures behind; that cross-file residue used to make table deletes
// FK-conflict depending on run order. Truncate everything (CASCADE handles the FK
// graph) before every test so each starts from a known-empty, deterministic state.
// No RESTART IDENTITY: many tests hardcode `id: 1` and also create auto-id rows —
// resetting the sequence to 1 would collide. Letting sequences climb is harmless.
const { db } = await import('@/server/db')
const APP_TABLES = [
  'stock_movement', 'event_log', 'wake_up_call', 'loyalty_redemption', 'consumption',
  'cash_movement', 'stay', 'ledger_entry', 'rate', 'shift', 'room', 'room_category',
  'product', 'loyalty_tier', 'cost_center', 'customer', 'employee', 'tariff_policy',
]

beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${APP_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`)
})
