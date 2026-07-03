import { describe, it, expect } from 'vitest'
import { computeStayAmount, durationMinutes } from '@/lib/billing'

const baseCat = { minPeriodMin: 180, maxPeriodMin: 720, includedGuests: 2 }
const rate = { basePrice: 75, excessPrice30m: 15, overnightPrice: 160, extraGuestPrice: 25 }
const at = (min: number) => new Date(2026, 0, 1, 0, min, 0)

describe('durationMinutes', () => {
  it('is elapsed minutes, never negative', () => {
    expect(durationMinutes(at(0), at(90))).toBe(90)
    expect(durationMinutes(at(90), at(0))).toBe(0)
  })
})

describe('computeStayAmount motel', () => {
  const motel = (checkInMin: number, checkOutMin: number, guests = 2) =>
    computeStayAmount({ billing: 'motel', ...baseCat, rate, checkIn: at(checkInMin), checkOut: at(checkOutMin), guests })

  it('within minimum period charges base', () => {
    expect(motel(0, 180)).toBe(75)
    expect(motel(0, 60)).toBe(75)
  })
  it('one started 30-min block over minimum adds one excess', () => {
    expect(motel(0, 181)).toBe(90)   // 75 + 1*15
    expect(motel(0, 210)).toBe(90)   // exactly +30 min
    expect(motel(0, 211)).toBe(105)  // 75 + 2*15
  })
  it('caps at the overnight price', () => {
    expect(motel(0, 600)).toBe(160)  // would be 75 + 14*15=285 -> capped 160
  })
  it('adds extra-guest price per guest beyond included', () => {
    expect(motel(0, 180, 3)).toBe(100) // 75 + 1*25
    expect(motel(0, 180, 4)).toBe(125)
  })
})

describe('computeStayAmount hotel', () => {
  const hotel = (checkInMin: number, checkOutMin: number, guests = 2) =>
    computeStayAmount({ billing: 'hotel', ...baseCat, rate, checkIn: at(checkInMin), checkOut: at(checkOutMin), guests })

  it('charges one daily for up to 24h', () => {
    expect(hotel(0, 60)).toBe(160)
    expect(hotel(0, 1440)).toBe(160)
  })
  it('charges another daily past 24h', () => {
    expect(hotel(0, 1441)).toBe(320)
    expect(hotel(0, 2880)).toBe(320)
  })
})

describe('computeStayAmount charge mode', () => {
  const overnight = (checkInMin: number, checkOutMin: number, guests = 2) =>
    computeStayAmount({ billing: 'motel', chargeMode: 'overnight', ...baseCat, rate, checkIn: at(checkInMin), checkOut: at(checkOutMin), guests })
  it('overnight charges the flat overnight price regardless of duration', () => {
    expect(overnight(0, 30)).toBe(160)     // short stay, still overnight price
    expect(overnight(0, 600)).toBe(160)
  })
  it('overnight still adds extra-guest price', () => {
    expect(overnight(0, 30, 3)).toBe(185)  // 160 + 1*25
  })
  it('period mode (default) is unchanged', () => {
    expect(computeStayAmount({ billing: 'motel', ...baseCat, rate, checkIn: at(0), checkOut: at(181), guests: 2 })).toBe(90)
  })
})
