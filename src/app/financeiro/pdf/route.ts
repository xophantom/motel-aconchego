import { statementRange } from '@/server/data/finance'
import { buildFinancePdf } from '@/lib/finance-pdf'
import { civilDate, parseCivilDate, todayCivil } from '@/lib/time'


export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const today = todayCivil()
  const from = parseCivilDate(searchParams.get('from')) ?? civilDate(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)
  const to = parseCivilDate(searchParams.get('to')) ?? today
  let range
  try { range = await statementRange(from, to) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) return new Response('Forbidden', { status: 403 }); throw e }
  const label = `${searchParams.get('from') ?? ''} a ${searchParams.get('to') ?? ''}`
  const buffer = await buildFinancePdf(range, label)
  const file = `faturamento-${searchParams.get('from') ?? ''}_${searchParams.get('to') ?? ''}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
