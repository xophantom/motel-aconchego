// PT labels for EventLog.type. Fallback to the raw type when unmapped so a new
// event type shows up readably without a code change.
export const EVENT_TYPE_LABEL: Record<string, string> = {
  'stay.checkin': 'Entrada',
  'stay.checkout': 'Saída',
  'stay.prepaid': 'Antecipado',
  'stay.edit_checkin': 'Horário de entrada',
  'room.status': 'Status quarto',
  'shift.open': 'Caixa aberto',
  'shift.close': 'Caixa fechado',
  'cash.withdrawal': 'Sangria',
  'cash.supply': 'Suprimento',
  'cash.correction': 'Correção',
  'consumption.add': 'Consumo +',
  'consumption.remove': 'Consumo −',
  'consumption.walkin': 'Venda avulsa',
  'tariff.update': 'Tarifa',
  'product.update': 'Produto',
  'user.create': 'Usuário criado',
  'user.update': 'Usuário editado',
  'user.deactivate': 'Usuário desativado',
  'user.reset': 'Senha redefinida',
  'loyalty.tier.upsert': 'Faixa fidelidade',
  'loyalty.tier.delete': 'Faixa removida',
  'loyalty.policy': 'Regra fidelidade',
  'loyalty.apply': 'Fidelidade aplicada',
  'loyalty.remove': 'Fidelidade removida',
  'stay.plate': 'Placa',
}

export function eventTypeLabel(type: string | null): string {
  if (!type) return '—'
  return EVENT_TYPE_LABEL[type] ?? type
}
