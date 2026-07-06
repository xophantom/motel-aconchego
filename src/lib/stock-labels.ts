export const REASON_LABEL: Record<string, string> = {
  restock: 'Reposição',
  loss: 'Perda',
  inventory: 'Inventário',
  correction: 'Correção',
}
export function reasonLabel(r: string): string {
  return REASON_LABEL[r] ?? r
}
