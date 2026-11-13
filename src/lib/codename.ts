// A codename is shown the way reception typed it (spaces collapsed); its key
// ignores case and accents, so "Pantéra" and " pantera " are the same client.
export const CODENAME_MAX = 40

export function cleanCodename(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, CODENAME_MAX)
}

export function codenameKey(raw: string): string {
  return cleanCodename(raw).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
