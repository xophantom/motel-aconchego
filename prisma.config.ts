import { defineConfig } from 'prisma/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env manually since Prisma 7 config runs before env is populated
const envPath = resolve(__dirname, '.env')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
} catch {
  // .env not present (production)
}

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
