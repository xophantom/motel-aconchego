// Brazilian plates: the old format AAA9999 was converted to Mercosul AAA9A99 by
// turning the 5th character (a digit 0–9) into a letter A–J. Both identify the
// same car, so the canonical form is Mercosul, uppercase, letters and digits only.
const OLD_FORMAT = /^[A-Z]{3}\d{4}$/
const MERCOSUL = /^[A-Z]{3}\d[A-J]\d{2}$/

export function normalizePlate(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return OLD_FORMAT.test(s) ? s.slice(0, 4) + String.fromCharCode(65 + Number(s[4])) + s.slice(5) : s
}

// Spellings already stored for a canonical plate (before canonicalization,
// plates were only uppercased and stripped of spaces): with a hyphen after the
// letters, and the pre-Mercosul AAA9999 form.
export function plateVariants(canonical: string): string[] {
  const out = new Set([canonical])
  if (/^[A-Z]{3}/.test(canonical) && canonical.length > 3) out.add(`${canonical.slice(0, 3)}-${canonical.slice(3)}`)
  if (MERCOSUL.test(canonical)) {
    const old = canonical.slice(0, 4) + String(canonical.charCodeAt(4) - 65) + canonical.slice(5)
    out.add(old)
    out.add(`${old.slice(0, 3)}-${old.slice(3)}`)
  }
  return [...out]
}
