import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

// Load .env if DATABASE_URL isn't already set (so `pnpm db:seed` works standalone)
if (!process.env.DATABASE_URL) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) { const k = m[1].trim(); if (!process.env[k]) process.env[k] = m[2].trim().replace(/^["']|["']$/g, '') }
    }
  } catch { /* no .env in production */ }
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function main() {
  const username = process.env.SEED_ADMIN_USER ?? 'admin'
  const password = process.env.SEED_ADMIN_PASS
  if (!password) throw new Error('SEED_ADMIN_PASS is required (no insecure default)')
  const passwordHash = await bcrypt.hash(password, 12)
  await db.employee.upsert({
    where: { username },
    update: {},
    create: { name: 'Administrador', username, role: 'manager', passwordHash, active: true },
  })
  console.log(`Seeded manager '${username}'. Change the password after first login.`)
}

main().finally(() => db.$disconnect())
