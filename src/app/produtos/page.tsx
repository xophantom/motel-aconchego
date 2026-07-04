import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listProducts } from '@/server/data/products'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/page-header'
import { ProductForm } from './product-form'

const CAT_LABEL: Record<string, string> = { minibar: 'Frigobar', erotic: 'Erótico', kitchen: 'Cozinha', other: 'Outro' }

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
                    <TableCell className="tnum font-medium">{p.code}</TableCell><TableCell>{p.description}</TableCell>
                    <TableCell><Badge variant="secondary" className="font-normal">{CAT_LABEL[p.category] ?? p.category}</Badge></TableCell>
                    <TableCell className="tnum">R$ {Number(p.price).toFixed(2)}</TableCell>
                    <TableCell className="tnum">
                      {p.trackStock ? p.stockQty : '—'}
                      {low && <Badge variant="destructive" className="ml-2">baixo</Badge>}
                    </TableCell>
                    <TableCell className="tnum text-muted-foreground">{p.minStock}</TableCell>
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
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Produtos" subtitle="Cadastro, preço e estoque do frigobar e da loja." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <Products />
      </Suspense>
    </main>
  )
}
