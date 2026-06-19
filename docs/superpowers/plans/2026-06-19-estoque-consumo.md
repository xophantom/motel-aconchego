# Estoque + Consumo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Product CRUD, consumption on an open stay (with stock decrement), and a dedicated walk-in sale (room 99) — feeding the existing checkout/caixa.

**Architecture:** `server-only` DAL (authz inside) for products/consumption + a `walkinSale`; the caixa `shiftMetrics` is tweaked so walk-ins count as consumption but not as apartments; Server Actions + shadcn UI (`/produtos`, a Consumo section in the room modal, a venda-avulsa dialog).

**Tech Stack:** Next 16, React 19, Prisma 7 (`@/generated/prisma/client`, adapter-pg), Zod, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-estoque-consumo-design.md`

**Conventions:** Repo `/Users/leosperandio/Git/MotelAconchego`; branch `feat/estoque` from `main`. Prisma imports from `@/generated/prisma/client`. **No** `Co-Authored-By`. DB tests: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test <file>` (empty test DB → seed fixtures; mock `server-only` + `@/server/session`). Start: `git checkout -b feat/estoque`.

---

## File Structure
```
src/lib/rbac.ts                      # +'product:manage' (modify)
src/lib/validation/product.ts        # zod
src/server/data/products.ts          # products DAL
src/server/data/consumption.ts       # consumption DAL + walkinSale
src/server/data/shifts.ts            # shiftMetrics: room-only aptos, all consumo (modify)
src/app/produtos/actions.ts          # product server action
src/app/produtos/page.tsx            # products page
src/app/produtos/product-form.tsx    # client form
src/app/quartos/actions.ts           # +consumption/walk-in actions (modify)
src/app/quartos/page.tsx             # load products + per-room consumption (modify)
src/app/quartos/room-grid.tsx        # Consumo section + venda-avulsa dialog (modify)
src/app/page.tsx                     # +Produtos nav (modify)
tests/lib/rbac-product.test.ts
tests/server/products.test.ts
tests/server/consumption.test.ts
```

---

## Task 1: RBAC product:manage + products DAL (TDD)

**Files:** Modify `src/lib/rbac.ts`; Create `src/lib/validation/product.ts`, `src/server/data/products.ts`, `tests/lib/rbac-product.test.ts`, `tests/server/products.test.ts`

- [ ] **Step 1: RBAC test** `tests/lib/rbac-product.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { can } from '@/lib/rbac'

describe('product:manage', () => {
  it('only manager manages products', () => {
    expect(can('manager', 'product:manage')).toBe(true)
    expect(can('reception', 'product:manage')).toBe(false)
    expect(can('housekeeper', 'product:manage')).toBe(false)
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test tests/lib/rbac-product.test.ts`
Expected: FAIL — `'product:manage'` not assignable.

- [ ] **Step 3: Edit `src/lib/rbac.ts`** — replace contents:
```ts
import type { EmployeeRole } from '@/generated/prisma/client'

export type Action = 'users:manage' | 'cash:withdraw' | 'room:status' | 'tariff:manage' | 'stay:manage' | 'cash:manage' | 'product:manage'

const MATRIX: Record<EmployeeRole, Action[]> = {
  manager:     ['users:manage', 'cash:withdraw', 'room:status', 'tariff:manage', 'stay:manage', 'cash:manage', 'product:manage'],
  reception:   ['cash:withdraw', 'room:status', 'stay:manage', 'cash:manage'],
  housekeeper: ['room:status'],
}

export function can(role: EmployeeRole, action: Action): boolean {
  return MATRIX[role]?.includes(action) ?? false
}
```

- [ ] **Step 4: Validation** `src/lib/validation/product.ts`:
```ts
import { z } from 'zod'

export const productSchema = z.object({
  code: z.string().min(1).max(3),
  description: z.string().min(1),
  category: z.enum(['minibar', 'erotic', 'kitchen', 'other']),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).default(0),
  stockQty: z.coerce.number().int().default(0),
  minStock: z.coerce.number().int().min(0).default(0),
  trackStock: z.coerce.boolean().default(true),
})
export type ProductInput = z.infer<typeof productSchema>

export const addConsumptionSchema = z.object({
  productCode: z.string().min(1),
  qty: z.coerce.number().int().min(1),
})
```

- [ ] **Step 5: products DAL test** `tests/server/products.test.ts`:
```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { listProducts, upsertProduct } from '@/server/data/products'

beforeEach(async () => {
  await db.consumption.deleteMany(); await db.product.deleteMany()
  session.current = { id: 1, name: 'Boss', role: 'manager' }
})

describe('products DAL', () => {
  it('manager upserts (create then update) a product', async () => {
    await upsertProduct({ code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true })
    let p = await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })
    expect(Number(p.price)).toBe(10)
    await upsertProduct({ code: 'CLA', description: 'Cerveja Latão', category: 'minibar', price: 12, cost: 4, stockQty: 40, minStock: 6, trackStock: true })
    p = await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })
    expect(Number(p.price)).toBe(12)
    expect(p.description).toBe('Cerveja Latão')
  })
  it('any logged-in user can list', async () => {
    await upsertProduct({ code: 'AGU', description: 'Água', category: 'minibar', price: 5, cost: 1, stockQty: 10, minStock: 2, trackStock: true })
    session.current = { id: 2, name: 'R', role: 'reception' }
    expect(await listProducts()).toHaveLength(1)
  })
  it('reception cannot upsert', async () => {
    session.current = { id: 2, name: 'R', role: 'reception' }
    await expect(upsertProduct({ code: 'X', description: 'x', category: 'other', price: 1, cost: 0, stockQty: 0, minStock: 0, trackStock: true })).rejects.toThrow(/forbidden/i)
  })
})
```

- [ ] **Step 6: Run → fail**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/products.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement** `src/server/data/products.ts`:
```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import type { ProductInput } from '@/lib/validation/product'

export async function listProducts() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Forbidden')
  return db.product.findMany({ orderBy: { description: 'asc' } })
}

export async function upsertProduct(input: ProductInput) {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'product:manage')) throw new Error('Forbidden')
  const { code, ...rest } = input
  return db.product.upsert({ where: { code }, create: input, update: rest })
}
```

- [ ] **Step 8: Run → pass**

Run: `pnpm test tests/lib/rbac-product.test.ts` and `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/products.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/rbac.ts src/lib/validation/product.ts src/server/data/products.ts tests/lib/rbac-product.test.ts tests/server/products.test.ts
git commit -m "feat(produtos): product:manage RBAC + products DAL (list/upsert)"
```

---

## Task 2: Consumption DAL + walk-in + shiftMetrics tweak (TDD)

**Files:** Create `src/server/data/consumption.ts`, `tests/server/consumption.test.ts`; Modify `src/server/data/shifts.ts`

- [ ] **Step 1: Write the failing test** `tests/server/consumption.test.ts`:
```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))
const session = vi.hoisted(() => ({ current: null as null | { id: number; name: string; role: string } }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.current }))

import { db } from '@/server/db'
import { addConsumption, listConsumption, removeConsumption, walkinSale } from '@/server/data/consumption'
import { openShift, currentShiftSummary } from '@/server/data/shifts'

let stayId: bigint
beforeEach(async () => {
  await db.cashMovement.deleteMany(); await db.consumption.deleteMany(); await db.stay.deleteMany()
  await db.shift.deleteMany(); await db.product.deleteMany(); await db.room.deleteMany()
  await db.rate.deleteMany(); await db.roomCategory.deleteMany(); await db.employee.deleteMany()
  await db.employee.create({ data: { id: 1, name: 'Boss', username: 'boss', role: 'reception', passwordHash: 'x' } })
  await db.room.create({ data: { number: '01', status: 'occupied' } })
  await db.room.create({ data: { number: '99', status: 'free' } })
  await db.product.create({ data: { code: 'CLA', description: 'Cerveja', category: 'minibar', price: 10, cost: 4, stockQty: 50, minStock: 6, trackStock: true } })
  const stay = await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: new Date(), status: 'open', day: 'normal', guests: 2 } })
  stayId = stay.id
  session.current = { id: 1, name: 'Boss', role: 'reception' }
})

describe('consumption', () => {
  it('adds an item, sums the stay, and decrements stock', async () => {
    await addConsumption({ stayId, productCode: 'CLA', qty: 3 })
    const stay = await db.stay.findUniqueOrThrow({ where: { id: stayId } })
    expect(Number(stay.consumptionAmount)).toBe(30)
    const prod = await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })
    expect(prod.stockQty).toBe(47)
    expect(await listConsumption(stayId)).toHaveLength(1)
  })
  it('remove reverses the stay total and the stock', async () => {
    const item = await addConsumption({ stayId, productCode: 'CLA', qty: 2 })
    await removeConsumption(item.id)
    const stay = await db.stay.findUniqueOrThrow({ where: { id: stayId } })
    expect(Number(stay.consumptionAmount)).toBe(0)
    expect((await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })).stockQty).toBe(50)
  })
  it('housekeeper cannot add consumption', async () => {
    session.current = { id: 1, name: 'Cam', role: 'housekeeper' }
    await expect(addConsumption({ stayId, productCode: 'CLA', qty: 1 })).rejects.toThrow(/forbidden/i)
  })
})

describe('walk-in sale', () => {
  it('creates a closed walkin on room 99 with a consumption cash movement and stock decrement', async () => {
    const { stay, total } = await walkinSale({ items: [{ productCode: 'CLA', qty: 2 }] })
    expect(total).toBe(20)
    expect(stay.type).toBe('walkin')
    expect(stay.status).toBe('closed')
    expect((await db.product.findUniqueOrThrow({ where: { code: 'CLA' } })).stockQty).toBe(48)
    const mov = await db.cashMovement.findFirstOrThrow({ where: { stayId: stay.id } })
    expect(mov.type).toBe('consumption')
    expect(Number(mov.amount)).toBe(20)
  })
  it('rejects an empty sale', async () => {
    await expect(walkinSale({ items: [] })).rejects.toThrow(/empty/i)
  })
})

describe('shiftMetrics excludes walk-ins from nAptos but includes their consumo', () => {
  it('counts a room checkout as apto and a walk-in only as consumo', async () => {
    const s = await openShift({ openingBalance: 0 })
    const within = new Date(s.openedAt.getTime() + 60_000)
    // a room stay checked out in the window with consumption
    await db.stay.create({ data: { type: 'room', roomNumber: '01', checkIn: s.openedAt, checkOut: within, status: 'closed', day: 'normal', guests: 2, stayAmount: 75, consumptionAmount: 10 } })
    // a walk-in closed in the window
    await db.stay.create({ data: { type: 'walkin', roomNumber: '99', checkIn: within, checkOut: within, status: 'closed', stayAmount: 0, consumptionAmount: 20 } })
    const { metrics } = await currentShiftSummary()
    expect(metrics!.nAptos).toBe(1)               // only the room stay
    expect(metrics!.totalEstadias).toBe(75)
    expect(metrics!.totalConsumo).toBe(30)        // 10 (room) + 20 (walk-in)
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/consumption.test.ts`
Expected: FAIL — module `@/server/data/consumption` not found (and the metrics test fails until shiftMetrics is tweaked).

- [ ] **Step 3: Implement** `src/server/data/consumption.ts`:
```ts
import 'server-only'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { getOpenShiftFor } from '@/server/data/shifts'

async function requireOps() {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stay:manage')) throw new Error('Forbidden')
  return me
}

export async function addConsumption(input: { stayId: bigint; productCode: string; qty: number }) {
  await requireOps()
  const stay = await db.stay.findUniqueOrThrow({ where: { id: input.stayId } })
  if (stay.status !== 'open') throw new Error('Stay is not open')
  const product = await db.product.findUniqueOrThrow({ where: { code: input.productCode } })
  const unitPrice = Number(product.price)
  const lineTotal = unitPrice * input.qty
  return db.$transaction(async (tx) => {
    const item = await tx.consumption.create({ data: { stayId: input.stayId, productCode: input.productCode, qty: input.qty, unitPrice } })
    await tx.stay.update({ where: { id: input.stayId }, data: { consumptionAmount: { increment: lineTotal } } })
    if (product.trackStock) await tx.product.update({ where: { code: input.productCode }, data: { stockQty: { decrement: input.qty } } })
    return item
  })
}

export async function listConsumption(stayId: bigint) {
  await requireOps()
  return db.consumption.findMany({ where: { stayId }, orderBy: { createdAt: 'asc' }, include: { product: { select: { description: true } } } })
}

export async function removeConsumption(id: bigint) {
  await requireOps()
  const item = await db.consumption.findUniqueOrThrow({ where: { id }, include: { stay: true } })
  if (item.stay.status !== 'open') throw new Error('Stay is not open')
  const lineTotal = Number(item.unitPrice) * item.qty
  await db.$transaction(async (tx) => {
    await tx.consumption.delete({ where: { id } })
    await tx.stay.update({ where: { id: item.stayId }, data: { consumptionAmount: { decrement: lineTotal } } })
    if (item.productCode) {
      const product = await tx.product.findUnique({ where: { code: item.productCode } })
      if (product?.trackStock) await tx.product.update({ where: { code: item.productCode }, data: { stockQty: { increment: item.qty } } })
    }
  })
}

export async function walkinSale(input: { items: { productCode: string; qty: number }[] }) {
  const me = await requireOps()
  if (input.items.length === 0) throw new Error('Empty sale')
  const products = await db.product.findMany({ where: { code: { in: input.items.map((i) => i.productCode) } } })
  const priceOf = (code: string) => Number(products.find((p) => p.code === code)?.price ?? 0)
  const total = input.items.reduce((a, i) => a + priceOf(i.productCode) * i.qty, 0)
  const now = new Date()
  const openShiftId = (await getOpenShiftFor(now))?.id ?? null
  return db.$transaction(async (tx) => {
    const stay = await tx.stay.create({
      data: { type: 'walkin', roomNumber: '99', checkIn: now, checkOut: now, status: 'closed', stayAmount: 0, consumptionAmount: total, paymentEmployeeId: me.id },
    })
    for (const i of input.items) {
      await tx.consumption.create({ data: { stayId: stay.id, productCode: i.productCode, qty: i.qty, unitPrice: priceOf(i.productCode) } })
      const product = products.find((p) => p.code === i.productCode)
      if (product?.trackStock) await tx.product.update({ where: { code: i.productCode }, data: { stockQty: { decrement: i.qty } } })
    }
    await tx.cashMovement.create({ data: { type: 'consumption', stayId: stay.id, amount: total, employeeId: me.id, shiftId: openShiftId, occurredAt: now, description: 'Venda avulsa' } })
    return { stay, total }
  })
}
```

- [ ] **Step 4: Tweak `shiftMetrics`** in `src/server/data/shifts.ts` — replace the `agg` lines so apartments/estadias are room-only and consumo is over all closed stays. Replace the function body's metric section:
```ts
  const roomAgg = await db.stay.aggregate({ where: { ...checkoutWhere, type: 'room' }, _count: { _all: true }, _sum: { stayAmount: true } })
  const consumoAgg = await db.stay.aggregate({ where: checkoutWhere, _sum: { consumptionAmount: true } })
  const nAptos = roomAgg._count._all
  const totalEstadias = Number(roomAgg._sum.stayAmount ?? 0)
  const totalConsumo = Number(consumoAgg._sum.consumptionAmount ?? 0)
```
(Remove the previous single `agg` block; keep the `movs`/`sum`/`round2`/`saldo` lines and the returned object unchanged.)

- [ ] **Step 5: Run → pass**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test tests/server/consumption.test.ts tests/server/shifts.test.ts`
Expected: PASS (consumption + the existing shifts tests still green — the room stays in the shifts test are `type:'room'`, so the new filter doesn't change their counts).

- [ ] **Step 6: Commit**

```bash
git add src/server/data/consumption.ts src/server/data/shifts.ts tests/server/consumption.test.ts
git commit -m "feat(consumo): consumption DAL + walk-in sale + room-only apto metrics"
```

---

## Task 3: Products actions + `/produtos` page + nav (UI)

**Files:** Create `src/app/produtos/actions.ts`, `src/app/produtos/page.tsx`, `src/app/produtos/product-form.tsx`; Modify `src/app/page.tsx`

- [ ] **Step 1: Action** `src/app/produtos/actions.ts`:
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { productSchema } from '@/lib/validation/product'
import { upsertProduct } from '@/server/data/products'

export type ActionState = { ok: boolean; error?: string }

export async function saveProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = productSchema.safeParse({
    code: fd.get('code'), description: fd.get('description'), category: fd.get('category'),
    price: fd.get('price'), cost: fd.get('cost'), stockQty: fd.get('stockQty'),
    minStock: fd.get('minStock'), trackStock: fd.get('trackStock') === 'on' || fd.get('trackStock') === 'true',
  })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await upsertProduct(parsed.data) }
  catch (e) { return { ok: false, error: e instanceof Error && /forbidden/i.test(e.message) ? 'Sem permissão.' : 'Erro ao salvar.' } }
  revalidatePath('/produtos')
  return { ok: true }
}
```

- [ ] **Step 2: Client form** `src/app/produtos/product-form.tsx`:
```tsx
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveProductAction, type ActionState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

function Save() {
  const { pending } = useFormStatus()
  return <Button size="sm" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>
}

export function ProductForm() {
  const [state, action] = useActionState<ActionState, FormData>(saveProductAction, { ok: false })
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Field name="code" label="Código" w="w-20" />
      <Field name="description" label="Descrição" w="w-48" />
      <div className="grid gap-1">
        <Label htmlFor="category" className="text-xs">Categoria</Label>
        <NativeSelect id="category" name="category" defaultValue="minibar" className="h-8 w-28">
          <NativeSelectOption value="minibar">Frigobar</NativeSelectOption>
          <NativeSelectOption value="erotic">Erótico</NativeSelectOption>
          <NativeSelectOption value="kitchen">Cozinha</NativeSelectOption>
          <NativeSelectOption value="other">Outro</NativeSelectOption>
        </NativeSelect>
      </div>
      <Field name="price" label="Preço" type="number" w="w-24" />
      <Field name="cost" label="Custo" type="number" w="w-24" defaultValue="0" />
      <Field name="stockQty" label="Estoque" type="number" w="w-24" defaultValue="0" />
      <Field name="minStock" label="Mínimo" type="number" w="w-24" defaultValue="0" />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="trackStock" defaultChecked /> controla estoque</label>
      <Save />
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
      {state.ok && <span className="text-xs text-emerald-600">salvo</span>}
    </form>
  )
}

function Field({ name, label, type = 'text', w, defaultValue }: { name: string; label: string; type?: string; w: string; defaultValue?: string }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type={type} step={type === 'number' ? '0.01' : undefined} defaultValue={defaultValue} className={`h-8 ${w}`} required={name === 'code' || name === 'description'} />
    </div>
  )
}
```
> Saving a product whose `code` already exists updates it (upsert). To edit, type the existing code with the new values.

- [ ] **Step 3: Page** `src/app/produtos/page.tsx`:
```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listProducts } from '@/server/data/products'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProductForm } from './product-form'

async function Products() {
  await connection()
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'product:manage')) redirect('/')
  const products = await listProducts()
  return (
    <div className="grid gap-6">
      <Card><CardHeader><CardTitle>Novo / editar produto</CardTitle></CardHeader><CardContent><ProductForm /></CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Produtos</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead>Mín</TableHead></TableRow></TableHeader>
            <TableBody>
              {products.map((p) => {
                const low = p.trackStock && p.stockQty <= p.minStock
                return (
                  <TableRow key={p.code} className={low ? 'bg-destructive/10' : undefined}>
                    <TableCell>{p.code}</TableCell><TableCell>{p.description}</TableCell><TableCell>{p.category}</TableCell>
                    <TableCell>R$ {Number(p.price).toFixed(2)}</TableCell>
                    <TableCell>{p.trackStock ? p.stockQty : '—'}{low ? ' ⚠️' : ''}</TableCell><TableCell>{p.minStock}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ProdutosPage() {
  return (
    <main className="mx-auto mt-8 max-w-4xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Produtos</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Products />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 4: Home nav** — in `src/app/page.tsx` `HomeContent` nav, add a Produtos link for managers (next to Tarifas):
```tsx
{me?.role === 'manager' && <Button asChild variant="link"><a href="/produtos">Produtos</a></Button>}
```

- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit` (zero errors) then `pnpm build` (succeeds, `/produtos` in route table).

- [ ] **Step 6: Commit**

```bash
git add src/app/produtos src/app/page.tsx
git commit -m "feat(produtos): /produtos CRUD page + nav"
```

---

## Task 4: Consumption in the room modal + venda avulsa (UI)

**Files:** Modify `src/app/quartos/actions.ts`, `src/app/quartos/page.tsx`, `src/app/quartos/room-grid.tsx`

- [ ] **Step 1: Add actions** to `src/app/quartos/actions.ts` (append; keep existing imports + add):
```ts
import { addConsumptionSchema } from '@/lib/validation/product'
import { addConsumption, removeConsumption, walkinSale } from '@/server/data/consumption'

export async function addConsumptionAction(stayId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = addConsumptionSchema.safeParse({ productCode: fd.get('productCode'), qty: fd.get('qty') })
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  try { await addConsumption({ stayId: BigInt(stayId), ...parsed.data }) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function removeConsumptionAction(id: string): Promise<ActionState> {
  try { await removeConsumption(BigInt(id)) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}

export async function walkinSaleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let items: { productCode: string; qty: number }[]
  try { items = JSON.parse(String(fd.get('items') ?? '[]')) } catch { return { ok: false, error: 'Itens inválidos.' } }
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'Adicione ao menos um item.' }
  try { await walkinSale({ items }) } catch (e) { return { ok: false, error: mapErr(e) } }
  revalidatePath('/quartos')
  return { ok: true }
}
```
(`mapErr` and `ActionState` already exist in this file from the operacional slice.)

- [ ] **Step 2: Page** — modify `src/app/quartos/page.tsx` `Board()` to also load products and per-occupied-room consumption, and pass them to `RoomGrid`:
```tsx
  const products = await listProducts()
  const data = await Promise.all(rooms.map(async (r) => ({
    number: r.number,
    status: r.status,
    maintenanceReason: r.maintenanceReason,
    category: r.category ? { code: r.category.code, description: r.category.description } : null,
    currentStay: r.currentStay ? { id: String(r.currentStay.id), checkIn: r.currentStay.checkIn.toISOString(), guests: r.currentStay.guests, day: r.currentStay.day } : null,
    consumption: r.currentStay
      ? (await listConsumption(r.currentStay.id)).map((c) => ({ id: String(c.id), description: c.product?.description ?? c.productCode ?? '?', qty: c.qty, unitPrice: Number(c.unitPrice) }))
      : [],
  })))
  return <RoomGrid rooms={data} products={products.map((p) => ({ code: p.code, description: p.description, price: Number(p.price) }))} />
```
Add the imports at the top of the file: `import { listProducts } from '@/server/data/products'` and `import { listConsumption } from '@/server/data/consumption'`. (`listRoomsWithCurrentStay` already selects `currentStay.id`.)

- [ ] **Step 3: Grid** — modify `src/app/quartos/room-grid.tsx`:
  1. Extend the `Room` type with `currentStay: { id: string; checkIn: string; guests: number; day: 'normal' | 'special' } | null` and `consumption: { id: string; description: string; qty: number; unitPrice: number }[]`.
  2. Add `products: Product[]` to `RoomGrid` props (`type Product = { code: string; description: string; price: number }`) and thread it to `RoomCard` → the occupied modal.
  3. Add a `VendaAvulsa` button + dialog at the top of `RoomGrid` (cart of products → `walkinSaleAction`).
  4. In the occupied modal (`CheckOutPanel`), render a **Consumo** section above the checkout: a form (`Select` product + qty → `addConsumptionAction.bind(null, stayId)`), the list of `consumption` items each with a remove button (`removeConsumptionAction` via a tiny form), and the running consumption total.

Full replacement file `src/app/quartos/room-grid.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { checkInAction, checkOutAction, setRoomStatusAction, addConsumptionAction, removeConsumptionAction, walkinSaleAction, type ActionState } from './actions'

type Product = { code: string; description: string; price: number }
type ConsItem = { id: string; description: string; qty: number; unitPrice: number }
type Room = {
  number: string
  status: 'free' | 'occupied' | 'cleaning' | 'maintenance'
  maintenanceReason: string | null
  category: { code: string; description: string } | null
  currentStay: { id: string; checkIn: string; guests: number; day: 'normal' | 'special' } | null
  consumption: ConsItem[]
}

const STATUS_LABEL: Record<Room['status'], string> = { free: 'LIVRE', occupied: 'OCUPADO', cleaning: 'LIMPEZA', maintenance: 'MANUT.' }
const STATUS_CLASS: Record<Room['status'], string> = {
  free: 'bg-emerald-600 text-white', occupied: 'bg-red-600 text-white', cleaning: 'bg-amber-500 text-black', maintenance: 'bg-stone-500 text-white',
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Button disabled={pending}>{pending ? '…' : children}</Button>
}

export function RoomGrid({ rooms, products }: { rooms: Room[]; products: Product[] }) {
  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><VendaAvulsa products={products} /></div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {rooms.map((r) => <RoomCard key={r.number} room={r} products={products} />)}
      </div>
    </div>
  )
}

function RoomCard({ room, products }: { room: Room; products: Product[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className={`rounded-lg p-3 text-left ${STATUS_CLASS[room.status]}`}>
          <div className="text-lg font-bold">{room.number}</div>
          <div className="text-xs">{STATUS_LABEL[room.status]}</div>
          {room.category && <div className="text-[10px] opacity-90">{room.category.code}</div>}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Quarto {room.number} — {STATUS_LABEL[room.status]}</DialogTitle></DialogHeader>
        {room.status === 'free' && <FreeActions room={room} onDone={() => setOpen(false)} />}
        {room.status === 'occupied' && <OccupiedPanel room={room} products={products} onDone={() => setOpen(false)} />}
        {room.status === 'cleaning' && <SimpleStatus number={room.number} status="free" label="Liberar (limpo)" onDone={() => setOpen(false)} />}
        {room.status === 'maintenance' && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">Motivo: {room.maintenanceReason}</p>
            <SimpleStatus number={room.number} status="free" label="Voltar de manutenção" onDone={() => setOpen(false)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FreeActions({ room, onDone }: { room: Room; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(checkInAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-3">
        <input type="hidden" name="roomNumber" value={room.number} />
        <div className="grid gap-1">
          <Label htmlFor="day">Tabela</Label>
          <NativeSelect id="day" name="day" defaultValue="normal">
            <NativeSelectOption value="normal">Semana (normal)</NativeSelectOption>
            <NativeSelectOption value="special">Fim de semana (especial)</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="grid gap-1"><Label htmlFor="guests">Hóspedes</Label><Input id="guests" name="guests" type="number" min="1" defaultValue="2" /></div>
        <div className="grid gap-1"><Label htmlFor="prepaidAmount">Antecipado (R$)</Label><Input id="prepaidAmount" name="prepaidAmount" type="number" step="0.01" defaultValue="0" /></div>
        <Submit>Fazer entrada</Submit>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      </form>
      <MaintenanceForm number={room.number} onDone={onDone} />
    </div>
  )
}

function OccupiedPanel({ room, products, onDone }: { room: Room; products: Product[]; onDone: () => void }) {
  const stay = room.currentStay!
  const consumoTotal = room.consumption.reduce((a, c) => a + c.unitPrice * c.qty, 0)
  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Consumo (R$ {consumoTotal.toFixed(2)})</h3>
        {room.consumption.map((c) => (
          <div key={c.id} className="flex items-center justify-between text-sm">
            <span>{c.qty}× {c.description} — R$ {(c.unitPrice * c.qty).toFixed(2)}</span>
            <RemoveItem id={c.id} />
          </div>
        ))}
        <AddConsumption stayId={stay.id} products={products} />
      </section>
      <CheckOut roomNumber={room.number} stay={stay} onDone={onDone} />
    </div>
  )
}

function AddConsumption({ stayId, products }: { stayId: string; products: Product[] }) {
  const action = addConsumptionAction.bind(null, stayId)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false })
  return (
    <form action={formAction} className="flex items-end gap-2 border-t pt-2">
      <div className="grid gap-1">
        <Label htmlFor="productCode" className="text-xs">Produto</Label>
        <NativeSelect id="productCode" name="productCode" className="h-8 w-40" defaultValue={products[0]?.code}>
          {products.map((p) => <NativeSelectOption key={p.code} value={p.code}>{p.description}</NativeSelectOption>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1"><Label htmlFor="qty" className="text-xs">Qtd</Label><Input id="qty" name="qty" type="number" min="1" defaultValue="1" className="h-8 w-16" /></div>
      <Button size="sm" variant="outline" type="submit">Lançar</Button>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
    </form>
  )
}

function RemoveItem({ id }: { id: string }) {
  const [, action] = useActionState<ActionState, FormData>(async () => removeConsumptionAction(id), { ok: false })
  return <form action={action}><Button size="sm" variant="ghost" type="submit">remover</Button></form>
}

function CheckOut({ roomNumber, stay, onDone }: { roomNumber: string; stay: NonNullable<Room['currentStay']>; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])
  const [state, formAction] = useActionState<ActionState, FormData>(async () => checkOutAction(roomNumber), { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  const elapsedMin = Math.max(0, Math.round((now - new Date(stay.checkIn).getTime()) / 60000))
  return (
    <div className="grid gap-2 border-t pt-3">
      <p className="text-sm">Decorrido: <strong>{Math.floor(elapsedMin / 60)}h{String(elapsedMin % 60).padStart(2, '0')}m</strong></p>
      <form action={formAction}><Submit>Confirmar saída</Submit>{state.error && <p className="text-destructive text-sm">{state.error}</p>}</form>
    </div>
  )
}

function SimpleStatus({ number, status, label, onDone }: { number: string; status: 'free' | 'cleaning'; label: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(setRoomStatusAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <form action={action}>
      <input type="hidden" name="number" value={number} /><input type="hidden" name="status" value={status} />
      <Submit>{label}</Submit>{state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}

function MaintenanceForm({ number, onDone }: { number: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(setRoomStatusAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <form action={action} className="grid gap-2 border-t pt-3">
      <input type="hidden" name="number" value={number} /><input type="hidden" name="status" value="maintenance" />
      <Label htmlFor="reason" className="text-xs">Pôr em manutenção (motivo)</Label>
      <div className="flex gap-2"><Input id="reason" name="reason" placeholder="motivo" /><Button variant="outline" type="submit">Manutenção</Button></div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}

function VendaAvulsa({ products }: { products: Product[] }) {
  const [open, setOpen] = useState(false)
  const [cart, setCart] = useState<{ productCode: string; qty: number }[]>([])
  const [state, action] = useActionState<ActionState, FormData>(walkinSaleAction, { ok: false })
  useEffect(() => { if (state.ok) { setCart([]); setOpen(false) } }, [state.ok])
  const total = cart.reduce((a, i) => a + (products.find((p) => p.code === i.productCode)?.price ?? 0) * i.qty, 0)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Venda avulsa</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Venda avulsa (Pedido Casa)</DialogTitle></DialogHeader>
        <AddToCart products={products} onAdd={(productCode, qty) => setCart((c) => [...c, { productCode, qty }])} />
        <ul className="text-sm">
          {cart.map((i, idx) => <li key={idx}>{i.qty}× {products.find((p) => p.code === i.productCode)?.description}</li>)}
        </ul>
        <p className="text-sm font-medium">Total: R$ {total.toFixed(2)}</p>
        <form action={action}>
          <input type="hidden" name="items" value={JSON.stringify(cart)} />
          <Submit>Registrar venda</Submit>
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddToCart({ products, onAdd }: { products: Product[]; onAdd: (code: string, qty: number) => void }) {
  const [code, setCode] = useState(products[0]?.code ?? '')
  const [qty, setQty] = useState(1)
  return (
    <div className="flex items-end gap-2">
      <NativeSelect value={code} onChange={(e) => setCode(e.target.value)} className="h-8 w-40">
        {products.map((p) => <NativeSelectOption key={p.code} value={p.code}>{p.description}</NativeSelectOption>)}
      </NativeSelect>
      <Input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-8 w-16" />
      <Button type="button" size="sm" variant="outline" onClick={() => code && onAdd(code, qty)}>Adicionar</Button>
    </div>
  )
}
```

- [ ] **Step 4: Verify**

Run:
```bash
pnpm exec tsc --noEmit
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/motelac_test" pnpm test
pnpm build
```
Expected: tsc zero errors; all tests pass; build succeeds (`/quartos`, `/produtos` in route table). If the `NativeSelect` `value`/`onChange` controlled usage warns or differs from the component's props, adapt to the component's actual API (it wraps a native `<select>`, so `value`+`onChange` are standard).

- [ ] **Step 5: Commit**

```bash
git add src/app/quartos
git commit -m "feat(consumo): consumption in room modal + venda avulsa dialog"
```

---

## Self-Review (done)

- **Spec coverage:** product:manage RBAC + products DAL list/upsert (T1); consumption add/list/remove with stock + walkinSale + shiftMetrics room-only aptos/all-consumo (T2); /produtos CRUD + low-stock highlight + nav (T3); consumption section in the occupied modal + venda-avulsa dialog + actions (T4). Snapshot `unitPrice` (T2 addConsumption uses `product.price` at insert). Allow-negative stock (decrement without guard). Walk-in not an apto (T2 metrics + test). All spec sections mapped.
- **Placeholder scan:** none — every step has real code/commands.
- **Type consistency:** `ProductInput` (T1) used by T2? no — products DAL uses it; `addConsumptionSchema` (T1) used by T4 action; `walkinSale`/`addConsumption`/`removeConsumption` signatures (T2) match the actions (T4) which pass `BigInt(...)`; `listProducts`/`listConsumption` (T1/T2) used by the page (T4); `shiftMetrics` return shape unchanged (only its internals change in T2), so caixa page/tests stay valid; `Room`/`Product`/`ConsItem` types in room-grid (T4) match the page's serialized shape (T4 step 2). `ActionState`/`mapErr` reused from the existing quartos actions.
- **Test DB note:** every DB-backed test seeds fixtures (incl. room '99' for walk-in) and cleans in `beforeEach`. `fileParallelism: false` already set. `consumption.ts` → `shifts.ts` import is one-directional.
