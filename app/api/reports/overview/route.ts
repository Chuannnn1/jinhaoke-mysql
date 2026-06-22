import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

export const dynamic = 'force-dynamic'

interface SummaryBlock {
  revenue: number
  orders_count: number
  avg_per_order: number
  prev_revenue: number
  prev_label: string
  change_pct: number | null
  cost: number
  prev_cost: number
  profit: number
  prev_profit: number
  profit_change_pct: number | null
}

interface SeriesPoint {
  bucket: string
  revenue: number
  orders_count: number
}

interface TopItem {
  name: string
  qty: number
  revenue: number
}

interface OverviewReport {
  scope: 'today' | 'week' | 'month' | 'custom'
  range: { from: string; to: string }
  summary: SummaryBlock
  timeseries: SeriesPoint[]
  top_items: TopItem[]
  kpi_trend_revenue: number[]
  kpi_trend_orders: number[]
}

function todayTW(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

function isYMD(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function addDays(ymd: string, delta: number): string {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function pct(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round(((curr - prev) / prev) * 1000) / 10
}

export async function GET(req: Request) {
  try {
    const pool = getPool()
    const { searchParams } = new URL(req.url)
    const scopeRaw = (searchParams.get('scope') ?? 'today').toLowerCase()
    if (!['today', 'week', 'month', 'custom'].includes(scopeRaw)) {
      return NextResponse.json({ success: false, error: 'scope 必須是 today/week/month/custom' }, { status: 400 })
    }
    const scope = scopeRaw as OverviewReport['scope']

    let from: string, to: string, prevFrom: string, prevTo: string, prevLabel: string

    if (scope === 'today') {
      const d = searchParams.get('date')
      const date = isYMD(d) ? d : todayTW()
      from = to = date
      prevFrom = prevTo = addDays(date, -7)
      prevLabel = '上週同日'
    } else if (scope === 'week') {
      const d = searchParams.get('date')
      const date = isYMD(d) ? d : todayTW()
      from = addDays(date, -6)
      to = date
      prevFrom = addDays(from, -7)
      prevTo = addDays(to, -7)
      prevLabel = '上週'
    } else if (scope === 'month') {
      const now = new Date()
      const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()), 10)
      const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1), 10)
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return NextResponse.json({ success: false, error: 'year/month 格式錯誤' }, { status: 400 })
      }
      const mm = String(month).padStart(2, '0')
      from = `${year}-${mm}-01`
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
      to = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
      const prevYear = month === 1 ? year - 1 : year
      const prevMonth = month === 1 ? 12 : month - 1
      const prevMM = String(prevMonth).padStart(2, '0')
      const prevLastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate()
      prevFrom = `${prevYear}-${prevMM}-01`
      prevTo = `${prevYear}-${prevMM}-${String(prevLastDay).padStart(2, '0')}`
      prevLabel = '上個月'
    } else {
      const f = searchParams.get('from')
      const t = searchParams.get('to')
      if (!isYMD(f) || !isYMD(t)) {
        return NextResponse.json({ success: false, error: 'from / to 格式需為 YYYY-MM-DD' }, { status: 400 })
      }
      if (f > t) {
        return NextResponse.json({ success: false, error: 'from 必須早於或等於 to' }, { status: 400 })
      }
      from = f
      to = t
      const days = Math.floor((Date.parse(to) - Date.parse(from)) / 86400000) + 1
      prevTo = addDays(from, -1)
      prevFrom = addDays(prevTo, -(days - 1))
      prevLabel = '前段同長度'
    }

    // 日期範圍（DATETIME 欄位用 >= 'from 00:00:00' AND < 'to+1 00:00:00'）
    const fromDT = `${from} 00:00:00`
    const toDT = `${addDays(to, 1)} 00:00:00`
    const prevFromDT = `${prevFrom} 00:00:00`
    const prevToDT = `${addDays(prevTo, 1)} 00:00:00`

    // ── Summary ─────────────────
    const [sumRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        COUNT(DISTINCT o.\`訂單編號\`) AS orders_count,
        COALESCE(SUM(m.\`餐點價格\` * od.\`數量\`), 0) AS revenue
      FROM \`訂單\` o
      LEFT JOIN \`訂單明細\` od ON o.\`訂單編號\` = od.\`訂單編號\`
      LEFT JOIN \`餐點\` m ON od.\`餐點編號\` = m.\`餐點編號\`
      WHERE o.\`訂單日期\` >= ? AND o.\`訂單日期\` < ? AND o.\`訂單狀態\` = '已完成'
    `, [fromDT, toDT])
    const sum = sumRows[0] as { orders_count: number; revenue: number }

    const [prevSumRows] = await pool.execute<RowDataPacket[]>(`
      SELECT COALESCE(SUM(m.\`餐點價格\` * od.\`數量\`), 0) AS revenue
      FROM \`訂單\` o
      LEFT JOIN \`訂單明細\` od ON o.\`訂單編號\` = od.\`訂單編號\`
      LEFT JOIN \`餐點\` m ON od.\`餐點編號\` = m.\`餐點編號\`
      WHERE o.\`訂單日期\` >= ? AND o.\`訂單日期\` < ? AND o.\`訂單狀態\` = '已完成'
    `, [prevFromDT, prevToDT])
    const prevSum = prevSumRows[0] as { revenue: number }

    // ── 採購成本（按退貨比例扣減）─────────────────
    const costQuery = `
      SELECT COALESCE(SUM(
        po.\`進貨食材總成本\` * CASE
          WHEN COALESCE(det.total_ordered, 0) = 0 THEN 1
          ELSE GREATEST(0, 1 - COALESCE(ret.total_returned, 0) / det.total_ordered)
        END
      ), 0) AS cost
      FROM \`採購單\` po
      LEFT JOIN (
        SELECT \`採購單編號\`, SUM(\`數量\`) AS total_ordered
        FROM \`採購單明細\` GROUP BY \`採購單編號\`
      ) det ON po.\`採購單編號\` = det.\`採購單編號\`
      LEFT JOIN (
        SELECT \`採購單編號\`, SUM(\`退貨數量\`) AS total_returned
        FROM \`退貨單\` GROUP BY \`採購單編號\`
      ) ret ON po.\`採購單編號\` = ret.\`採購單編號\`
      WHERE po.\`採購單日期\` >= ? AND po.\`採購單日期\` <= ?
        AND po.\`採購單狀態\` IN ('已到貨', '已完成驗收')
    `
    const [costRows] = await pool.execute<RowDataPacket[]>(costQuery, [from, to])
    const costNow = (costRows[0] as { cost: number }).cost

    const [prevCostRows] = await pool.execute<RowDataPacket[]>(costQuery, [prevFrom, prevTo])
    const prevCostVal = (prevCostRows[0] as { cost: number }).cost

    const revenue = Math.round(Number(sum.revenue))
    const prev_revenue = Math.round(Number(prevSum.revenue))
    const cost = Math.round(Number(costNow))
    const prev_cost = Math.round(Number(prevCostVal))
    const profit = revenue - cost
    const prev_profit = prev_revenue - prev_cost
    const summary: SummaryBlock = {
      revenue,
      orders_count: Number(sum.orders_count),
      avg_per_order: Number(sum.orders_count) > 0 ? Math.round(revenue / Number(sum.orders_count)) : 0,
      prev_revenue,
      prev_label: prevLabel,
      change_pct: pct(revenue, prev_revenue),
      cost,
      prev_cost,
      profit,
      prev_profit,
      profit_change_pct: pct(profit, prev_profit),
    }

    // ── Timeseries ─────────────────
    let timeseries: SeriesPoint[] = []
    if (scope === 'today') {
      const [hourlyRows] = await pool.execute<RowDataPacket[]>(`
        SELECT
          LPAD(HOUR(o.\`訂單日期\`), 2, '0') AS hour_bucket,
          COUNT(DISTINCT o.\`訂單編號\`) AS orders_count,
          COALESCE(SUM(m.\`餐點價格\` * od.\`數量\`), 0) AS revenue
        FROM \`訂單\` o
        LEFT JOIN \`訂單明細\` od ON o.\`訂單編號\` = od.\`訂單編號\`
        LEFT JOIN \`餐點\` m ON od.\`餐點編號\` = m.\`餐點編號\`
        WHERE o.\`訂單日期\` >= ? AND o.\`訂單日期\` < ? AND o.\`訂單狀態\` = '已完成'
        GROUP BY hour_bucket
      `, [fromDT, toDT])
      const byHour = new Map((hourlyRows as Array<{ hour_bucket: string; orders_count: number; revenue: number }>).map(r => [r.hour_bucket, r]))
      for (let h = 0; h < 24; h++) {
        const k = String(h).padStart(2, '0')
        const row = byHour.get(k)
        timeseries.push({
          bucket: k,
          revenue: row ? Math.round(Number(row.revenue)) : 0,
          orders_count: row ? Number(row.orders_count) : 0,
        })
      }
    } else {
      const [dailyRows] = await pool.execute<RowDataPacket[]>(`
        SELECT
          DATE(o.\`訂單日期\`) AS bucket,
          COUNT(DISTINCT o.\`訂單編號\`) AS orders_count,
          COALESCE(SUM(m.\`餐點價格\` * od.\`數量\`), 0) AS revenue
        FROM \`訂單\` o
        LEFT JOIN \`訂單明細\` od ON o.\`訂單編號\` = od.\`訂單編號\`
        LEFT JOIN \`餐點\` m ON od.\`餐點編號\` = m.\`餐點編號\`
        WHERE o.\`訂單日期\` >= ? AND o.\`訂單日期\` < ? AND o.\`訂單狀態\` = '已完成'
        GROUP BY bucket
        ORDER BY bucket
      `, [fromDT, toDT])
      const byDay = new Map((dailyRows as Array<{ bucket: string; orders_count: number; revenue: number }>).map(r => {
        const b = typeof r.bucket === 'string' ? r.bucket.slice(0, 10) : new Date(r.bucket).toISOString().slice(0, 10)
        return [b, r]
      }))
      const today = todayTW()
      const effectiveTo = (scope === 'custom') ? to : (to > today ? today : to)
      let cursor = from
      while (cursor <= effectiveTo) {
        const row = byDay.get(cursor)
        timeseries.push({
          bucket: cursor,
          revenue: row ? Math.round(Number(row.revenue)) : 0,
          orders_count: row ? Number(row.orders_count) : 0,
        })
        cursor = addDays(cursor, 1)
      }
    }

    // ── Top items ─────────────────
    const limit = scope === 'today' || scope === 'week' ? 5 : 10
    const [topRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        m.\`餐點名稱\` AS name,
        SUM(od.\`數量\`) AS qty,
        SUM(m.\`餐點價格\` * od.\`數量\`) AS revenue
      FROM \`訂單\` o
      JOIN \`訂單明細\` od ON o.\`訂單編號\` = od.\`訂單編號\`
      JOIN \`餐點\` m ON od.\`餐點編號\` = m.\`餐點編號\`
      WHERE o.\`訂單日期\` >= ? AND o.\`訂單日期\` < ? AND o.\`訂單狀態\` = '已完成'
      GROUP BY m.\`餐點編號\`, m.\`餐點名稱\`
      ORDER BY qty DESC
      LIMIT ${limit}
    `, [fromDT, toDT])

    const top_items: TopItem[] = (topRows as Array<{ name: string; qty: number; revenue: number }>).map(r => ({
      name: r.name,
      qty: Number(r.qty),
      revenue: Math.round(Number(r.revenue)),
    }))

    // ── KPI sparkline：最近 14 天 ─────
    const sparkTo = todayTW()
    const sparkFrom = addDays(sparkTo, -13)
    const sparkFromDT = `${sparkFrom} 00:00:00`
    const sparkToDT = `${addDays(sparkTo, 1)} 00:00:00`
    const [sparkRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        DATE(o.\`訂單日期\`) AS bucket,
        COUNT(DISTINCT o.\`訂單編號\`) AS orders_count,
        COALESCE(SUM(m.\`餐點價格\` * od.\`數量\`), 0) AS revenue
      FROM \`訂單\` o
      LEFT JOIN \`訂單明細\` od ON o.\`訂單編號\` = od.\`訂單編號\`
      LEFT JOIN \`餐點\` m ON od.\`餐點編號\` = m.\`餐點編號\`
      WHERE o.\`訂單日期\` >= ? AND o.\`訂單日期\` < ? AND o.\`訂單狀態\` = '已完成'
      GROUP BY bucket
    `, [sparkFromDT, sparkToDT])
    const sparkMap = new Map((sparkRows as Array<{ bucket: string; orders_count: number; revenue: number }>).map(r => {
      const b = typeof r.bucket === 'string' ? r.bucket.slice(0, 10) : new Date(r.bucket).toISOString().slice(0, 10)
      return [b, r]
    }))
    const kpi_trend_revenue: number[] = []
    const kpi_trend_orders: number[] = []
    let sparkCursor = sparkFrom
    while (sparkCursor <= sparkTo) {
      const row = sparkMap.get(sparkCursor)
      kpi_trend_revenue.push(row ? Math.round(Number(row.revenue)) : 0)
      kpi_trend_orders.push(row ? Number(row.orders_count) : 0)
      sparkCursor = addDays(sparkCursor, 1)
    }

    const report: OverviewReport = {
      scope,
      range: { from, to },
      summary,
      timeseries,
      top_items,
      kpi_trend_revenue,
      kpi_trend_orders,
    }

    return NextResponse.json({ success: true, data: report })
  } catch (err) {
    console.error('[GET /api/reports/overview]', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '伺服器錯誤' },
      { status: 500 }
    )
  }
}
