export type BillingMode = 'motel' | 'hotel'

export type BillingInput = {
  billing: BillingMode
  minPeriodMin: number
  maxPeriodMin: number
  includedGuests: number
  rate: {
    basePrice: number
    excessPrice30m: number
    overnightPrice: number
    extraGuestPrice: number
  }
  checkIn: Date
  checkOut: Date
  guests: number
  chargeMode?: 'period' | 'overnight'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function durationMinutes(checkIn: Date, checkOut: Date): number {
  return Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 60000)
}

export function computeStayAmount(i: BillingInput): number {
  const dur = durationMinutes(i.checkIn, i.checkOut)
  let stay: number
  if (i.billing === 'hotel') {
    stay = Math.max(1, Math.ceil(dur / 1440)) * i.rate.overnightPrice
  } else if (i.chargeMode === 'overnight') {
    stay = i.rate.overnightPrice
  } else if (dur <= i.minPeriodMin) {
    stay = i.rate.basePrice
  } else {
    const extra30 = Math.ceil((dur - i.minPeriodMin) / 30)
    stay = Math.min(i.rate.basePrice + extra30 * i.rate.excessPrice30m, i.rate.overnightPrice)
  }
  stay += Math.max(0, i.guests - i.includedGuests) * i.rate.extraGuestPrice
  return round2(stay)
}
