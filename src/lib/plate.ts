// Brazilian plates: the old format AAA9999 was converted to Mercosul AAA9A99 by
// turning the 5th character (a digit 0–9) into a letter A–J. Both identify the
// same car, so the canonical form is Mercosul, uppercase, letters and digits only.
const OLD_FORMAT = /^[A-Z]{3}\d{4}$/

export function normalizePlate(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return OLD_FORMAT.test(s) ? s.slice(0, 4) + String.fromCharCode(65 + Number(s[4])) + s.slice(5) : s
}
