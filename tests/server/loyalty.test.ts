import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import {
  getLoyaltyPolicy, updateLoyaltyPolicy, loyaltyProgress, customerByCodename, loyaltyStatus, searchCodenames,
  applyLoyaltyToRoom, removeLoyaltyFromRoom, setStayCodename, listLoyaltyCustomers, loyaltyCustomerDetail,
  renameCodename, mergeCodenames, deleteCodename,
} from '@/server/data/loyalty'

const RECEPTION = { id: 1, name: 'R', role: 'reception' }
const MANAGER = { id: 1, name: 'M', role: 'manager' }
const HOUSEKEEPER = { id: 1, name: 'H', role: 'housekeeper' }

beforeEach(async () => {
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'manager', passwordHash: 'x' } })
  session.current = RECEPTION
})

async function closedVisits(customerId: bigint, n: number, at = new Date('2026-09-01T12:00:00Z'), plate: string | null = null) {
  await db.stay.createMany({ data: Array.from({ length: n }, () => ({ type: 'room' as const, customerId, plate, checkIn: at, checkOut: at, status: 'closed' as const, day: 'normal' as const, guests: 2, stayAmount: 75 })) })
}
async function occupiedRoom(number: string, customerId: bigint | null) {
  const stay = await db.stay.create({ data: { type: 'room', customerId, checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
  await db.room.create({ data: { number, status: 'occupied', currentStayId: stay.id } })
  return stay
}
const client = async (codename: string) => (await customerByCodename(codename))!

describe('policy', () => {
  it('defaults to every 10 visits → 100% (1 free stay)', async () => {
    expect(await getLoyaltyPolicy()).toEqual({ everyVisits: 10, discountPercent: 100 })
  })
  it('manager updates it (audited); reception cannot', async () => {
    await expect(updateLoyaltyPolicy({ everyVisits: 5, discountPercent: 50 })).rejects.toThrow(/forbidden/i)
    session.current = MANAGER
    await updateLoyaltyPolicy({ everyVisits: 5, discountPercent: 50 })
    expect(await getLoyaltyPolicy()).toEqual({ everyVisits: 5, discountPercent: 50 })
    expect(await db.eventLog.count({ where: { type: 'loyalty.policy' } })).toBe(1)
  })
})

describe('loyaltyProgress', () => {
  const policy = { everyVisits: 10, discountPercent: 100 }
  it('earns one benefit per completed cycle, minus the used ones', () => {
    expect(loyaltyProgress(0, 0, policy)).toMatchObject({ available: 0, nextIn: 10 })
    expect(loyaltyProgress(9, 0, policy)).toMatchObject({ available: 0, nextIn: 1 })
    expect(loyaltyProgress(10, 0, policy)).toMatchObject({ available: 1, nextIn: 10 })
    expect(loyaltyProgress(23, 1, policy)).toMatchObject({ available: 1, nextIn: 7 })
    expect(loyaltyProgress(23, 2, policy)).toMatchObject({ available: 0 })
  })
})

describe('customerByCodename', () => {
  it('reuses the same client ignoring case, accents and extra spaces; keeps the first spelling', async () => {
    const a = await client(' Pantéra   Rosa ')
    const b = await client('pantera rosa')
    expect(b.id).toBe(a.id)
    expect(a).toMatchObject({ codename: 'Pantéra Rosa', codenameKey: 'pantera rosa' })
  })
  it('an empty codename means no client', async () => {
    expect(await customerByCodename('   ')).toBeNull()
  })
  it('housekeeper cannot create one', async () => {
    session.current = HOUSEKEEPER
    await expect(customerByCodename('Lobo')).rejects.toThrow(/forbidden/i)
  })
})

describe('loyaltyStatus', () => {
  it('counts paid visits only: a stay that used the benefit is not a paid visit', async () => {
    const c = await client('Águia')
    await closedVisits(c.id, 10)
    const freeStay = await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), checkOut: new Date(), status: 'closed', day: 'normal', guests: 2, stayAmount: 0, discountPercent: 100 } })
    await db.loyaltyRedemption.create({ data: { customerId: c.id, stayId: freeStay.id, discountPercent: 100 } })
    expect(await loyaltyStatus(c.id)).toMatchObject({ paidVisits: 10, used: 1, available: 0, nextIn: 10 })
  })
  it('a benefit used on a canceled stay goes back to the client', async () => {
    const c = await client('Falcão')
    await closedVisits(c.id, 10)
    const canceled = await db.stay.create({ data: { type: 'room', customerId: c.id, checkIn: new Date(), status: 'canceled', day: 'normal', guests: 2 } })
    await db.loyaltyRedemption.create({ data: { customerId: c.id, stayId: canceled.id, discountPercent: 100 } })
    expect((await loyaltyStatus(c.id)).available).toBe(1)
  })
  it('visits with different plates count for the same codename', async () => {
    const c = await client('Coruja')
    await closedVisits(c.id, 6, undefined, 'AAA1A11')
    await closedVisits(c.id, 4, undefined, 'BBB2B22')
    expect(await loyaltyStatus(c.id)).toMatchObject({ paidVisits: 10, available: 1 })
  })
})

describe('searchCodenames', () => {
  it('finds by part of the codename (accents ignored), prefix matches first, with progress', async () => {
    const rosa = await client('Pantera Rosa')
    await client('Rosa Choque')
    await client('Lobo')
    await closedVisits(rosa.id, 10)
    const found = await searchCodenames('ROSÁ')
    expect(found.map((m) => m.codename)).toEqual(['Rosa Choque', 'Pantera Rosa'])
    expect(found[1]).toMatchObject({ available: 1, done: 0, everyVisits: 10 })
    expect(await searchCodenames('  ')).toEqual([])
  })
  it('housekeeper cannot search', async () => {
    session.current = HOUSEKEEPER
    await expect(searchCodenames('lo')).rejects.toThrow(/forbidden/i)
  })
})

describe('apply / remove on the room', () => {
  it('needs a completed cycle; applies the benefit once per stay', async () => {
    const c = await client('Tigre')
    await closedVisits(c.id, 9)
    await occupiedRoom('201', c.id)
    await expect(applyLoyaltyToRoom('201')).rejects.toThrow(/unavailable/)
    await closedVisits(c.id, 1)
    expect(await applyLoyaltyToRoom('201')).toBe(100)
    const room = await db.room.findUniqueOrThrow({ where: { number: '201' }, include: { currentStay: true } })
    expect(room.currentStay!.discountPercent).toBe(100)
    await expect(applyLoyaltyToRoom('201')).rejects.toThrow(/unavailable|already applied/)
    expect(await db.eventLog.count({ where: { type: 'loyalty.apply' } })).toBe(1)
  })
  it('is recurring: every 10 paid visits earn another free stay', async () => {
    const c = await client('Leão')
    await closedVisits(c.id, 10)
    const first = await occupiedRoom('202', c.id)
    await applyLoyaltyToRoom('202')
    await db.stay.update({ where: { id: first.id }, data: { status: 'closed', checkOut: new Date(), stayAmount: 0 } })
    await db.room.update({ where: { number: '202' }, data: { status: 'free', currentStayId: null } })
    expect((await loyaltyStatus(c.id)).available).toBe(0)
    await closedVisits(c.id, 10)
    expect(await loyaltyStatus(c.id)).toMatchObject({ paidVisits: 20, used: 1, available: 1 })
  })
  it('remove gives the benefit back', async () => {
    const c = await client('Onça')
    await closedVisits(c.id, 10)
    const stay = await occupiedRoom('203', c.id)
    await applyLoyaltyToRoom('203')
    await removeLoyaltyFromRoom('203')
    expect((await db.stay.findUniqueOrThrow({ where: { id: stay.id } })).discountPercent).toBe(0)
    expect((await loyaltyStatus(c.id, { excludeStayId: stay.id })).available).toBe(1)
    await expect(removeLoyaltyFromRoom('203')).rejects.toThrow(/no benefit applied/)
  })
  it('throws when the open stay has no codename', async () => {
    await occupiedRoom('204', null)
    await expect(applyLoyaltyToRoom('204')).rejects.toThrow(/no open stay/)
  })
})

describe('setStayCodename', () => {
  it('sets or changes the codename of the open stay; blocked while a benefit is applied', async () => {
    const stay = await occupiedRoom('205', null)
    const c = (await setStayCodename('205', 'Raposa'))!
    expect((await db.stay.findUniqueOrThrow({ where: { id: stay.id } })).customerId).toBe(c.id)
    expect(c.codename).toBe('Raposa')
    await closedVisits(c.id, 10)
    await applyLoyaltyToRoom('205')
    await expect(setStayCodename('205', 'Outro')).rejects.toThrow(/benefit applied/)
    expect(await db.eventLog.count({ where: { type: 'stay.codename' } })).toBe(1)
  })
  it('an empty codename clears it', async () => {
    const stay = await occupiedRoom('207', (await client('Gato')).id)
    expect(await setStayCodename('207', ' ')).toBeNull()
    expect((await db.stay.findUniqueOrThrow({ where: { id: stay.id } })).customerId).toBeNull()
  })
})

describe('list + detail', () => {
  it('housekeeper cannot see them; reception can', async () => {
    session.current = HOUSEKEEPER
    await expect(listLoyaltyCustomers()).rejects.toThrow(/forbidden/i)
    await expect(loyaltyCustomerDetail('1')).rejects.toThrow(/forbidden/i)
    session.current = RECEPTION
    await expect(listLoyaltyCustomers()).resolves.toMatchObject({ rows: [] })
  })
  it('lists codenames with progress, most recent visit first; filters ignoring accents', async () => {
    const rosa = await client('Pantera Rosa')
    const lobo = await client('Lobo')
    await client('Novo') // no visits yet: listed last
    await closedVisits(rosa.id, 12, new Date('2026-09-02T12:00:00Z'))
    await closedVisits(lobo.id, 1, new Date('2026-10-01T12:00:00Z'))
    const { rows } = await listLoyaltyCustomers()
    expect(rows.map((r) => r.codename)).toEqual(['Lobo', 'Pantera Rosa', 'Novo'])
    expect(rows[1]).toMatchObject({ id: String(rosa.id), paidVisits: 12, available: 1, nextIn: 8, totalVisits: 12 })
    expect((await listLoyaltyCustomers('PANTÉRA')).rows.map((r) => r.codename)).toEqual(['Pantera Rosa'])
  })
  it('detail lists the visits of a codename with plate and the benefit used', async () => {
    const c = await client('Jaguar')
    await closedVisits(c.id, 10, undefined, 'GGG7G77')
    await occupiedRoom('206', c.id)
    await applyLoyaltyToRoom('206')
    const d = (await loyaltyCustomerDetail(String(c.id)))!
    expect(d.codename).toBe('Jaguar')
    expect(d.visits).toHaveLength(11)
    expect(d.visits.filter((v) => v.plate === 'GGG7G77')).toHaveLength(10)
    expect(d.visits.filter((v) => v.benefitPercent === 100)).toHaveLength(1)
    expect(await loyaltyCustomerDetail('999999')).toBeNull()
    expect(await loyaltyCustomerDetail('abc')).toBeNull()
  })
})

describe('managing codenames (manager and reception)', () => {
  it('renames, audited; refuses a name already used by another codename', async () => {
    const c = await client('Pantera')
    await client('Lobo')
    await renameCodename(c.id, '  Pantera   Negra ')
    expect(await db.customer.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ codename: 'Pantera Negra', codenameKey: 'pantera negra' })
    expect((await db.eventLog.findFirstOrThrow({ where: { type: 'customer.rename' } })).description).toBe('Codinome Pantera → Pantera Negra')
    await expect(renameCodename(c.id, 'LOBO')).rejects.toThrow(/taken/)
    await expect(renameCodename(c.id, ' ')).rejects.toThrow(/required/)
    await renameCodename(c.id, 'pantera negra') // same key: just the spelling changes
    expect((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).codename).toBe('pantera negra')
  })
  it('merges a duplicate into another: visits and benefits move over, the duplicate goes', async () => {
    const dup = await client('Pantera Rosa 2')
    const main = await client('Pantera Rosa')
    await closedVisits(dup.id, 4)
    await closedVisits(main.id, 6)
    const used = await db.stay.create({ data: { type: 'room', customerId: dup.id, checkIn: new Date(), checkOut: new Date(), status: 'closed', day: 'normal', guests: 2, stayAmount: 0 } })
    await db.loyaltyRedemption.create({ data: { customerId: dup.id, stayId: used.id, discountPercent: 100 } })
    session.current = MANAGER
    const into = await mergeCodenames(dup.id, 'pantera rosa')
    expect(into.id).toBe(main.id)
    expect(await db.customer.findUnique({ where: { id: dup.id } })).toBeNull()
    expect(await loyaltyStatus(main.id)).toMatchObject({ paidVisits: 10, used: 1, available: 0 })
    expect(await db.eventLog.count({ where: { type: 'customer.merge' } })).toBe(1)
    await expect(mergeCodenames(main.id, 'Pantera Rosa')).rejects.toThrow(/same codename/)
    await expect(mergeCodenames(main.id, 'Ninguém')).rejects.toThrow(/not found/)
  })
  it('deletes only a codename never used on a stay', async () => {
    const typo = await client('Pantra')
    const used = await client('Pantera')
    await closedVisits(used.id, 1)
    await expect(deleteCodename(used.id)).rejects.toThrow(/has visits/)
    await deleteCodename(typo.id)
    expect(await db.customer.findUnique({ where: { id: typo.id } })).toBeNull()
    expect(await db.eventLog.count({ where: { type: 'customer.delete' } })).toBe(1)
  })
  it('housekeeper cannot manage', async () => {
    const c = await client('Lobo')
    session.current = HOUSEKEEPER
    await expect(renameCodename(c.id, 'X')).rejects.toThrow(/forbidden/i)
    await expect(mergeCodenames(c.id, 'X')).rejects.toThrow(/forbidden/i)
    await expect(deleteCodename(c.id)).rejects.toThrow(/forbidden/i)
  })
})

describe('old-system visits (legacy frequency)', () => {
  const at = (iso: string) => new Date(iso)
  async function legacyVisits(customerId: bigint, isos: string[]) {
    await db.legacyVisit.createMany({ data: isos.map((iso) => ({ customerId, visitedAt: at(iso) })) })
  }

  it('count as paid visits alongside stays and earn the benefit', async () => {
    const c = await client('Dudu 1822')
    await legacyVisits(c.id, Array.from({ length: 7 }, (_, i) => `2026-0${i + 1}-10T23:00:00Z`))
    await closedVisits(c.id, 3)
    expect(await loyaltyStatus(c.id)).toMatchObject({ paidVisits: 10, available: 1 })
    expect((await searchCodenames('dudu'))[0]).toMatchObject({ available: 1 })
  })
  it('show in the list (total, last visit) and in the detail, newest first', async () => {
    const c = await client('Lodo')
    await legacyVisits(c.id, ['2023-07-14T17:55:00Z', '2026-11-07T03:38:28Z'])
    await closedVisits(c.id, 1, at('2026-09-01T12:00:00Z'))
    const row = (await listLoyaltyCustomers()).rows.find((r) => r.codename === 'Lodo')!
    expect(row).toMatchObject({ totalVisits: 3, paidVisits: 3 })
    expect(row.lastVisit).toEqual(at('2026-11-07T03:38:28Z'))
    const d = (await loyaltyCustomerDetail(String(c.id)))!
    expect(d.visits.map((v) => [v.legacy, v.checkIn.toISOString()])).toEqual([
      [true, '2026-11-07T03:38:28.000Z'], [false, '2026-09-01T12:00:00.000Z'], [true, '2023-07-14T17:55:00.000Z'],
    ])
  })
  it('move with a merge (the same instant in both counts once) and block a delete', async () => {
    const dup = await client('Jade 2')
    const main = await client('Jade')
    await legacyVisits(dup.id, ['2026-10-22T06:55:58Z', '2026-10-25T04:06:54Z'])
    await legacyVisits(main.id, ['2026-10-25T04:06:54Z', '2026-11-10T09:17:37Z'])
    await expect(deleteCodename(dup.id)).rejects.toThrow(/has visits/)
    await mergeCodenames(dup.id, 'jade')
    expect(await db.legacyVisit.count({ where: { customerId: main.id } })).toBe(3)
    expect((await loyaltyStatus(main.id)).paidVisits).toBe(3)
  })
})
