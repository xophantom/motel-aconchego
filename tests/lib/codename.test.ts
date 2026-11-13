import { describe, it, expect } from 'vitest'
import { cleanCodename, codenameKey, CODENAME_MAX } from '@/lib/codename'

describe('codename', () => {
  it('keeps the typed spelling, spaces collapsed', () => {
    expect(cleanCodename('  Pantéra   Rosa ')).toBe('Pantéra Rosa')
    expect(cleanCodename('x'.repeat(60))).toHaveLength(CODENAME_MAX)
  })
  it('keys ignore case, accents and extra spaces', () => {
    expect(codenameKey(' PANTÉRA  rosa')).toBe('pantera rosa')
    expect(codenameKey('Ção')).toBe('cao')
    expect(codenameKey('   ')).toBe('')
  })
})
