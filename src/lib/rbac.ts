import type { EmployeeRole } from '@/generated/prisma/client'

export type Action = 'users:manage' | 'cash:withdraw' | 'room:status' | 'tariff:manage' | 'stay:manage' | 'cash:manage' | 'product:manage' | 'report:view' | 'loyalty:manage' | 'loyalty:view' | 'audit:view' | 'finance:manage' | 'stay:cancel' | 'stock:adjust'

const MATRIX: Record<EmployeeRole, Action[]> = {
  manager:     ['users:manage', 'cash:withdraw', 'room:status', 'tariff:manage', 'stay:manage', 'cash:manage', 'product:manage', 'report:view', 'loyalty:manage', 'loyalty:view', 'audit:view', 'finance:manage', 'stay:cancel', 'stock:adjust'],
  reception:   ['cash:withdraw', 'room:status', 'stay:manage', 'cash:manage', 'stay:cancel', 'stock:adjust', 'loyalty:view'],
  housekeeper: ['room:status'],
}

export function can(role: EmployeeRole, action: Action): boolean {
  return MATRIX[role]?.includes(action) ?? false
}
