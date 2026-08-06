import { describe, it, expect } from 'vitest'
import { THEME_OPTIONS, THEME_VALUES } from '@/lib/themes'

describe('theme catalog', () => {
  it('offers exactly the three named themes, in order', () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(['light', 'dark', 'legacy'])
  })
  it('labels them in PT-BR', () => {
    expect(THEME_OPTIONS.map((o) => o.label)).toEqual(['Moderno · Claro', 'Moderno · Escuro', 'Legado'])
  })
  it('THEME_VALUES mirrors the option values (single source of truth)', () => {
    expect(THEME_VALUES).toEqual(THEME_OPTIONS.map((o) => o.value))
  })
})
