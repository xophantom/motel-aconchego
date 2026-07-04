import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Tests always run against the test database. Read DATABASE_URL_TEST from .env
// (or the real env in CI) and expose it to the test process as DATABASE_URL,
// so `pnpm test` just works — no shell-level override needed.
function testDatabaseUrl(): string {
  try {
    const env = readFileSync(resolve(__dirname, '.env'), 'utf-8')
    for (const line of env.split('\n')) {
      const m = line.match(/^DATABASE_URL_TEST=(.*)$/)
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env absent (e.g. CI provides DATABASE_URL_TEST via the real environment)
  }
  return process.env.DATABASE_URL_TEST ?? ''
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: testDatabaseUrl(),
    },
  },
})
