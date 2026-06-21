import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { GET as csvGET } from '@/app/relatorios/csv/route'
import { buildReportPdf } from '@/lib/report-pdf'
import { monthlyOccupancy } from '@/server/data/reports'

beforeEach(async () => {
  await db.consumption.deleteMany(); await db.stay.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany()
  await db.room.create({ data: { number: '01', status: 'free' } })
  await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: new Date(2026, 5, 1, 12), checkOut: new Date(2026, 5, 1, 14), status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 0 } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('CSV route', () => {
  it('manager gets a CSV attachment', async () => {
    const res = await csvGET(new Request('http://x/relatorios/csv?year=2026&month=6'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('ocupacao-2026-06.csv')
    expect(await res.text()).toContain('01;')
  })
  it('non-manager is forbidden', async () => {
    session.current = { id: 2, name: 'R', role: 'reception' }
    const res = await csvGET(new Request('http://x/relatorios/csv?year=2026&month=6'))
    expect(res.status).toBe(403)
  })
})

describe('PDF builder', () => {
  it('produces a non-empty buffer', async () => {
    const buf = await buildReportPdf(await monthlyOccupancy(2026, 6))
    expect(buf.length).toBeGreaterThan(500)
  })
})
