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
