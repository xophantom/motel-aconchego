import { reportView } from '@/server/data/reports'
import { toReportCsv } from '@/lib/report-csv'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sp = Object.fromEntries(searchParams.entries())
  let view
  try { view = await reportView(sp) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) return new Response('Forbidden', { status: 403 }); throw e }
  const file = `${view.type}.csv`
  return new Response('﻿' + toReportCsv(view), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
