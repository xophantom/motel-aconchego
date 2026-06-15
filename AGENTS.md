<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MotelAconchego — project conventions

- **Prisma 7**: import the client, model types, enums, and the `Prisma` namespace from `@/generated/prisma/client` — **not** `@prisma/client`. The DB singleton is `@/server/db` (uses `@prisma/adapter-pg`, reads `DATABASE_URL` at runtime). Generated client lives in `src/generated/` (gitignored; `pnpm prisma generate` / `postinstall`).
- **Tests**: Vitest. DB-backed tests run against the test database: `DATABASE_URL="$DATABASE_URL_TEST" pnpm test`. Mock `server-only` in tests: `vi.mock('server-only', () => ({}))`.
- **Commits**: Conventional Commits. **Never** add a `Co-Authored-By` trailer.
- **Layers**: reads via DAL (`src/server/data/*`, `'server-only'`, authz inside each function); mutations via Server Actions + Zod; `/api` only for external HTTP/auth; route protection in `proxy.ts` (Next 16 renamed middleware → proxy).
- **Legacy + migration kit** live in a separate workspace: `/Users/leosperandio/Git/MotelAc` (never commit its data here).
