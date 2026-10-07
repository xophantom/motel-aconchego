import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { listProducts } from '@/server/data/products'
import { listStockMovements } from '@/server/data/stock'
import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/page-header'
import { ProductForm } from './product-form'
import { StockForm } from './stock-form'
import { reasonLabel } from '@/lib/stock-labels'
import { MOTEL_TZ } from '@/lib/time'

const CAT_LABEL: Record<string, string> = { minibar: 'Frigobar', erotic: 'Erótico', kitchen: 'Cozinha', other: 'Outro' }
const dtm = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: MOTEL_TZ })

export async function ProductsBody({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  await connection()
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'stock:adjust')) redirect('/')
  const isManager = can(me.role, 'product:manage')
  const sp = await searchParams
  const [products, movements] = await Promise.all([listProducts(), listStockMovements({ productCode: sp.product || undefined })])
  const productOptions = products.map((p) => ({ code: p.code, description: p.description }))
  return (
    <div className="grid gap-6">
      {isManager && (
        <>
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
                        <TableCell className="tnum">{p.trackStock ? p.stockQty : '—'}{low && <Badge variant="destructive" className="ml-2">baixo</Badge>}</TableCell>
                        <TableCell className="tnum text-muted-foreground">{p.minStock}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Reposição / ajuste de estoque</CardTitle>
          <Button asChild variant="outline" size="sm"><a href="/produtos/baixo?auto=1" target="_blank" rel="noopener">Imprimir baixos (80mm)</a></Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <StockForm products={productOptions} />
          <form method="GET" className="flex items-end gap-2 border-t pt-3">
            <div className="grid gap-1">
              <Label htmlFor="product" className="text-xs">Filtrar por produto</Label>
              <NativeSelect id="product" name="product" defaultValue={sp.product ?? ''} className="w-44">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {products.map((p) => <NativeSelectOption key={p.code} value={p.code}>{p.code}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <Button type="submit" variant="outline">Filtrar</Button>
          </form>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>Motivo</TableHead><TableHead>Operador</TableHead><TableHead>Obs.</TableHead></TableRow></TableHeader>
            <TableBody>
              {movements.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Nenhum movimento ainda.</TableCell></TableRow>}
              {movements.map((m) => (
                <TableRow key={String(m.id)}>
                  <TableCell className="tnum whitespace-nowrap">{dtm(m.createdAt)}</TableCell>
                  <TableCell>{m.productCode} · {m.productDescription}</TableCell>
                  <TableCell className={`tnum text-right font-medium ${m.qty > 0 ? 'text-[var(--room-free)]' : 'text-destructive'}`}>{m.qty > 0 ? '+' : ''}{m.qty}</TableCell>
                  <TableCell>{reasonLabel(m.reason)}</TableCell>
                  <TableCell>{m.operatorName ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{m.note ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ProdutosPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title="Produtos" subtitle="Cadastro, preço e estoque do frigobar e da loja." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <ProductsBody searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
