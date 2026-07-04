import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { GET as csvGET } from '@/app/financeiro/csv/route'
import { GET as pdfGET } from '@/app/financeiro/pdf/route'

beforeEach(async () => {
  await db.eventLog.deleteMany(); await db.ledgerEntry.deleteMany(); await db.costCenter.deleteMany()
  await db.cashMovement.deleteMany(); await db.stay.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  await db.ledgerEntry.create({ data: { entryDate: new Date(2026, 6, 4), kind: 'expense', amount: 40, description: 'A' } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

const url = (p: string) => new Request(`http://localhost${p}`)

describe('finance export handlers', () => {
  it('CSV responds 200 with a semicolon table for managers', async () => {
    const res = await csvGET(url('/financeiro/csv?from=2026-07-04&to=2026-07-04'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/csv/)
    expect(await res.text()).toMatch(/2026-07-04/)
  })

  it('PDF responds 200 application/pdf', async () => {
    const res = await pdfGET(url('/financeiro/pdf?from=2026-07-04&to=2026-07-04'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })

  it('reception gets 403 from both', async () => {
    session.current = { id: 1, name: 'Rita', role: 'reception' }
    expect((await csvGET(url('/financeiro/csv?from=2026-07-04&to=2026-07-04'))).status).toBe(403)
    expect((await pdfGET(url('/financeiro/pdf?from=2026-07-04&to=2026-07-04'))).status).toBe(403)
  })
})
