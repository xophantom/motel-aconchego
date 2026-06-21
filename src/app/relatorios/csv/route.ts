import { getCurrentUser } from '@/server/session'
import { can } from '@/lib/rbac'
import { monthlyOccupancy } from '@/server/data/reports'
import { toCsv } from '@/lib/report-csv'

export async function GET(req: Request) {
  const me = await getCurrentUser()
  if (!me || !can(me.role, 'report:view')) return new Response('Forbidden', { status: 403 })
  const { searchParams } = new URL(req.url)
  const now = new Date()
  const year = Number(searchParams.get('year')) || now.getFullYear()
  const month = Number(searchParams.get('month')) || now.getMonth() + 1
  const csv = toCsv(await monthlyOccupancy(year, month))
  const file = `ocupacao-${year}-${String(month).padStart(2, '0')}.csv`
  return new Response('﻿' + csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"` },
  })
}
