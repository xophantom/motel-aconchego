import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { GET as csvGET } from '@/app/relatorios/csv/route'
import { GET as pdfGET } from '@/app/relatorios/pdf/route'

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  const cat = await db.roomCategory.create({ data: { code: 'C', description: 'R', billing: 'motel', minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 } })
  await db.room.create({ data: { number: '01', status: 'free', categoryId: cat.id } })
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

const url = (p: string) => new Request(`http://localhost${p}`)

describe('report export handlers', () => {
  it('occupancy CSV (no type) responds 200', async () => {
    const res = await csvGET(url('/relatorios/csv?year=2026&month=7'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/csv/)
    expect(await res.text()).toMatch(/Apto/)
  })

  it('bar CSV responds 200 with its header', async () => {
    const res = await csvGET(url('/relatorios/csv?type=bar&from=2026-07-04&to=2026-07-04'))
    expect(res.status).toBe(200)
    expect(await res.text()).toMatch(/Receita/)
  })

  it('operator PDF responds 200 application/pdf', async () => {
    const res = await pdfGET(url('/relatorios/pdf?type=operator&from=2026-07-04&to=2026-07-04'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })

  it('reception gets 403', async () => {
    session.current = { id: 1, name: 'R', role: 'reception' }
    expect((await csvGET(url('/relatorios/csv?type=bar&from=2026-07-04&to=2026-07-04'))).status).toBe(403)
  })
})
