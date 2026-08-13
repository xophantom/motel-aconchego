import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listRegionalHolidays, addRegionalHoliday, removeRegionalHoliday } from '@/server/data/tariff'

const manager = { id: 1, name: 'Boss', role: 'manager' }
const reception = { id: 2, name: 'Rec', role: 'reception' }

beforeEach(async () => { await db.eventLog.deleteMany(); await db.regionalHoliday.deleteMany() })

describe('regional holidays DAL', () => {
  it('adds and lists regional holidays sorted by date', async () => {
    session.current = manager
    await addRegionalHoliday('08-15', 'Aniversário da cidade')
    await addRegionalHoliday('03-19', 'São José')
    const list = await listRegionalHolidays()
    expect(list.map((h) => h.monthDay)).toEqual(['03-19', '08-15'])
    expect(list[1].name).toBe('Aniversário da cidade')
  })

  it('rejects an invalid month-day', async () => {
    session.current = manager
    await expect(addRegionalHoliday('13-40', 'x')).rejects.toThrow(/data/i)
  })

  it('add is manager-only', async () => {
    session.current = reception
    await expect(addRegionalHoliday('08-15', 'x')).rejects.toThrow(/forbidden/i)
  })

  it('removes a holiday', async () => {
    session.current = manager
    const h = await addRegionalHoliday('08-15', 'x')
    await removeRegionalHoliday(h.id)
    expect(await listRegionalHolidays()).toHaveLength(0)
  })

  it('listRegionalHolidays rejects anonymous', async () => {
    session.current = null
    await expect(listRegionalHolidays()).rejects.toThrow(/forbidden/i)
  })
})
