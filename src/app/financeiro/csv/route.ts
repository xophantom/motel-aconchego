import { statementRange } from '@/server/data/finance'
import { toFinanceCsv } from '@/lib/finance-csv'
import { civilDate, parseCivilDate, todayCivil } from '@/lib/time'


export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const today = todayCivil()
  const from = parseCivilDate(searchParams.get('from')) ?? civilDate(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)
  const to = parseCivilDate(searchParams.get('to')) ?? today
  let range
  try { range = await statementRange(from, to) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) return new Response('Forbidden', { status: 403 }); throw e }
  const file = `faturamento-${searchParams.get('from') ?? ''}_${searchParams.get('to') ?? ''}.csv`
  return new Response('﻿' + toFinanceCsv(range), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
