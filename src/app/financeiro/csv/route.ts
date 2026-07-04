import { statementRange } from '@/server/data/finance'
import { toFinanceCsv } from '@/lib/finance-csv'

function civilDate(s: string | null, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const now = new Date()
  const from = civilDate(searchParams.get('from'), new Date(now.getFullYear(), now.getMonth(), 1))
  const to = civilDate(searchParams.get('to'), now)
  let range
  try { range = await statementRange(from, to) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) return new Response('Forbidden', { status: 403 }); throw e }
  const file = `faturamento-${searchParams.get('from') ?? ''}_${searchParams.get('to') ?? ''}.csv`
  return new Response('﻿' + toFinanceCsv(range), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
