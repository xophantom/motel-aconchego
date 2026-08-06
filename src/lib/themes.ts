export type ThemeValue = 'light' | 'dark' | 'legacy'

export const THEME_OPTIONS: readonly { value: ThemeValue; label: string }[] = [
  { value: 'light', label: 'Moderno · Claro' },
  { value: 'dark', label: 'Moderno · Escuro' },
  { value: 'legacy', label: 'Legado' },
] as const

export const THEME_VALUES: readonly ThemeValue[] = THEME_OPTIONS.map((o) => o.value)
