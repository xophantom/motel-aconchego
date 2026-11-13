import type { EmployeeRole } from '@/generated/prisma/client'

// consumption:add = launch items on an occupied room (and see them); removing
// an item stays with stay:manage.
export type Action = 'users:manage' | 'cash:withdraw' | 'room:status' | 'tariff:manage' | 'stay:manage' | 'consumption:add' | 'cash:manage' | 'product:manage' | 'report:view' | 'loyalty:manage' | 'loyalty:view' | 'codename:manage' | 'audit:view' | 'finance:manage' | 'stay:cancel' | 'stock:adjust'

const MATRIX: Record<EmployeeRole, Action[]> = {
  manager:     ['users:manage', 'cash:withdraw', 'room:status', 'tariff:manage', 'stay:manage', 'consumption:add', 'cash:manage', 'product:manage', 'report:view', 'loyalty:manage', 'loyalty:view', 'codename:manage', 'audit:view', 'finance:manage', 'stay:cancel', 'stock:adjust'],
  reception:   ['cash:withdraw', 'room:status', 'stay:manage', 'consumption:add', 'cash:manage', 'stay:cancel', 'stock:adjust', 'loyalty:view', 'codename:manage'],
  housekeeper: ['room:status', 'consumption:add'],
}

export function can(role: EmployeeRole, action: Action): boolean {
  return MATRIX[role]?.includes(action) ?? false
}
