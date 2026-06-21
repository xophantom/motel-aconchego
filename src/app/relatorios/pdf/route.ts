import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { monthlyOccupancy } from '@/server/data/reports'
import { buildReportPdf } from '@/lib/report-pdf'

export async function GET(req: Request) {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'report:view')) return new Response('Forbidden', { status: 403 })
  const { searchParams } = new URL(req.url)
  const now = new Date()
  const year = Number(searchParams.get('year')) || now.getFullYear()
  const month = Number(searchParams.get('month')) || now.getMonth() + 1
  const buffer = await buildReportPdf(await monthlyOccupancy(year, month))
  const file = `ocupacao-${year}-${String(month).padStart(2, '0')}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
