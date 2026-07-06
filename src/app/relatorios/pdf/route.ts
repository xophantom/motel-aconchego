import { reportView } from '@/server/data/reports'
import { buildReportPdf } from '@/lib/report-pdf'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sp = Object.fromEntries(searchParams.entries())
  let view
  try { view = await reportView(sp) }
  catch (e) { if (e instanceof Error && /forbidden/i.test(e.message)) return new Response('Forbidden', { status: 403 }); throw e }
  const buffer = await buildReportPdf(view)
  const file = `${view.type}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
