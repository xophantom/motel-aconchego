import { describe, it, expect } from 'vitest'
import { createEmployeeSchema, updateEmployeeSchema } from '@/lib/validation/employee'

describe('createEmployeeSchema', () => {
  it('accepts valid input', () => {
    expect(createEmployeeSchema.safeParse({ name: 'Estela', username: 'estela', role: 'reception', password: 'abcdef' }).success).toBe(true)
  })
  it('rejects short password', () => {
    expect(createEmployeeSchema.safeParse({ name: 'X', username: 'x', role: 'reception', password: '123' }).success).toBe(false)
  })
  it('rejects invalid role', () => {
    expect(createEmployeeSchema.safeParse({ name: 'X', username: 'x', role: 'boss', password: 'abcdef' }).success).toBe(false)
  })
})

describe('updateEmployeeSchema', () => {
  it('accepts role + active', () => {
    expect(updateEmployeeSchema.safeParse({ role: 'manager', active: false }).success).toBe(true)
  })
})
