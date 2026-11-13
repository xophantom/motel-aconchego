export const REASON_LABEL: Record<string, string> = {
  restock: 'Reposição',
  loss: 'Perda',
  inventory: 'Inventário',
  correction: 'Correção',
}
export function reasonLabel(r: string): string {
  return REASON_LABEL[r] ?? r
}

export const CATEGORY_LABEL: Record<string, string> = { minibar: 'Frigobar', erotic: 'Erótico', kitchen: 'Cozinha', other: 'Outro' }
export function categoryLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? c
}
