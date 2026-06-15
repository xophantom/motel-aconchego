import { vi } from 'vitest'

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
