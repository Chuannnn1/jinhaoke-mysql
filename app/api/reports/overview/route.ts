// app/api/reports/overview/route.ts
// 統一報表 API — 四個尺度共用同一支端點。
//
// GET /api/reports/overview?scope=today|week|month|custom&date=YYYY-MM-DD&from=&to=
//
// 回傳：
//   summary      — KPI 用：revenue / orders_count / avg_per_order / prev_revenue / change_pct
//   timeseries   — 主圖用：[{ bucket, revenue, orders_count }]
//                    scope=today  → bucket = '00'..'23' (24 小時)
//                    scope=week   → bucket = 該週的 YYYY-MM-DD (7 筆)
//                    scope=month  → bucket = 該月的 YYYY-MM-DD (28-31 筆)
//                    scope=custom → bucket = YYYY-MM-DD; >60 天時前端可自行週彙總
//   top_items    — 副區塊用：[{ name, qty, revenue }] top N
//
// 全部以 status='已完成' 計算（已出餐 → 算營收）。
// ============================================================
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface SummaryBlock {
  revenue: number
  orders_count: number
  avg_per_order: number
  prev_revenue: number
  prev_label: string
  change_pct: number | null  // null = 上期為 0 無法算
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
  // KPI 卡片 sparkline：固定回最近 14 天（含當天回推 13 天）
  kpi_trend_revenue: number[]
  kpi_trend_orders: number[]
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
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
  return Math.round(((curr - prev) / prev) * 1000) / 10  // 一位小數
}

export async function GET(req: Request) {
  try {
    const db = getDb()
    const { searchParams } = new URL(req.url)
    const scopeRaw = (searchParams.get('scope') ?? 'today').toLowerCase()
    if (!['today', 'week', 'month', 'custom'].includes(scopeRaw)) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'scope 必須是 today/week/month/custom' }, { status: 400 })
    }
    const scope = scopeRaw as OverviewReport['scope']

    // 解析時間範圍 + 上期對照
    let from: string, to: string, prevFrom: string, prevTo: string, prevLabel: string

    if (scope === 'today') {
      const d = searchParams.get('date')
      const date = isYMD(d) ? d : todayTW()
      from = to = date
      prevFrom = prevTo = addDays(date, -7)
      prevLabel = '上週同日'
    } else if (scope === 'week') {
      // 以 date 為基準的「過去 7 天」(含 date)；預設今天
      const d = searchParams.get('date')
      const date = isYMD(d) ? d : todayTW()
      from = addDays(date, -6)
      to = date
      prevFrom = addDays(from, -7)
      prevTo = addDays(to, -7)
      prevLabel = '上週'
    } else if (scope === 'month') {
      // 以 year/month 為主，預設當月
      const now = new Date()
      const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()), 10)
      const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1), 10)
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return NextResponse.json<ApiResponse>({ success: false, error: 'year/month 格式錯誤' }, { status: 400 })
      }
      const mm = String(month).padStart(2, '0')
      from = `${year}-${mm}-01`
      // 月底：下個月 1 號減一天
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
      to = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
      // 上個月相同範圍
      const prevYear = month === 1 ? year - 1 : year
      const prevMonth = month === 1 ? 12 : month - 1
      const prevMM = String(prevMonth).padStart(2, '0')
      const prevLastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate()
      prevFrom = `${prevYear}-${prevMM}-01`
      prevTo = `${prevYear}-${prevMM}-${String(prevLastDay).padStart(2, '0')}`
      prevLabel = '上個月'
    } else {
      // custom
      const f = searchParams.get('from')
      const t = searchParams.get('to')
      if (!isYMD(f) || !isYMD(t)) {
        return NextResponse.json<ApiResponse>({ success: false, error: 'from / to 格式需為 YYYY-MM-DD' }, { status: 400 })
      }
      if (f > t) {
        return NextResponse.json<ApiResponse>({ success: false, error: 'from 必須早於或等於 to' }, { status: 400 })
      }
      from = f
      to = t
      // 上期 = 等長度往前推
      const days = Math.floor((Date.parse(to) - Date.parse(from)) / 86400000) + 1
      prevTo = addDays(from, -1)
      prevFrom = addDays(prevTo, -(days - 1))
      prevLabel = '前段同長度'
    }

    // ── Summary ─────────────────
    const sum = db.prepare(`
      SELECT
        COUNT(DISTINCT o.order_id)                      AS orders_count,
        COALESCE(SUM(oi.unit_price * oi.quantity), 0)   AS revenue
      FROM "order" o
      LEFT JOIN order_item oi ON o.order_id = oi.order_id
      WHERE o.order_date BETWEEN ? AND ? AND o.status = '已完成'
    `).get(from, to) as { orders_count: number; revenue: number }

    const prevSum = db.prepare(`
      SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS revenue
      FROM "order" o
      LEFT JOIN order_item oi ON o.order_id = oi.order_id
      WHERE o.order_date BETWEEN ? AND ? AND o.status = '已完成'
    `).get(prevFrom, prevTo) as { revenue: number }

    const revenue = Math.round(sum.revenue)
    const prev_revenue = Math.round(prevSum.revenue)
    const summary: SummaryBlock = {
      revenue,
      orders_count: sum.orders_count,
      avg_per_order: sum.orders_count > 0 ? Math.round(revenue / sum.orders_count) : 0,
      prev_revenue,
      prev_label: prevLabel,
      change_pct: pct(revenue, prev_revenue),
    }

    // ── Timeseries ─────────────────
    let timeseries: SeriesPoint[] = []
    if (scope === 'today') {
      // 24 小時桶
      const hourly = db.prepare(`
        SELECT
          substr(o.created_at, 12, 2)                   AS hour,
          COUNT(DISTINCT o.order_id)                    AS orders_count,
          COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS revenue
        FROM "order" o
        LEFT JOIN order_item oi ON o.order_id = oi.order_id
        WHERE o.order_date = ? AND o.status = '已完成'
        GROUP BY substr(o.created_at, 12, 2)
      `).all(from) as Array<{ hour: string; orders_count: number; revenue: number }>
      const byHour = new Map(hourly.map(r => [r.hour, r]))
      for (let h = 0; h < 24; h++) {
        const k = String(h).padStart(2, '0')
        const row = byHour.get(k)
        timeseries.push({
          bucket: k,
          revenue: row ? Math.round(row.revenue) : 0,
          orders_count: row ? row.orders_count : 0,
        })
      }
    } else {
      // 日彙總，from..to 每天都產一筆（沒交易也補 0）
      const daily = db.prepare(`
        SELECT
          o.order_date                                  AS bucket,
          COUNT(DISTINCT o.order_id)                    AS orders_count,
          COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS revenue
        FROM "order" o
        LEFT JOIN order_item oi ON o.order_id = oi.order_id
        WHERE o.order_date BETWEEN ? AND ? AND o.status = '已完成'
        GROUP BY o.order_date
      `).all(from, to) as Array<{ bucket: string; orders_count: number; revenue: number }>
      const byDay = new Map(daily.map(r => [r.bucket, r]))
      // 不要畫到未來日：custom 以外的 scope 截到今天為止；custom 尊重 user 輸入
      const today = todayTW()
      const effectiveTo = (scope === 'custom') ? to : (to > today ? today : to)
      let cursor = from
      while (cursor <= effectiveTo) {
        const row = byDay.get(cursor)
        timeseries.push({
          bucket: cursor,
          revenue: row ? Math.round(row.revenue) : 0,
          orders_count: row ? row.orders_count : 0,
        })
        cursor = addDays(cursor, 1)
      }
    }

    // ── Top items ─────────────────
    const limit = scope === 'today' || scope === 'week' ? 5 : 10
    const topRows = db.prepare(`
      SELECT
        mi.name,
        SUM(oi.quantity)                  AS qty,
        SUM(oi.unit_price * oi.quantity)  AS revenue
      FROM "order" o
      JOIN order_item oi ON o.order_id = oi.order_id
      JOIN menu_item mi  ON oi.item_id  = mi.item_id
      WHERE o.order_date BETWEEN ? AND ? AND o.status = '已完成'
      GROUP BY mi.item_id, mi.name
      ORDER BY qty DESC
      LIMIT ?
    `).all(from, to, limit) as Array<{ name: string; qty: number; revenue: number }>

    const top_items: TopItem[] = topRows.map(r => ({
      name: r.name,
      qty: Number(r.qty),
      revenue: Math.round(r.revenue),
    }))

    // ── KPI sparkline：最近 14 天日營收與訂單數（含今天回推 13 天） ─────
    const sparkTo = todayTW()
    const sparkFrom = addDays(sparkTo, -13)
    const sparkRows = db.prepare(`
      SELECT
        o.order_date                                  AS bucket,
        COUNT(DISTINCT o.order_id)                    AS orders_count,
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS revenue
      FROM "order" o
      LEFT JOIN order_item oi ON o.order_id = oi.order_id
      WHERE o.order_date BETWEEN ? AND ? AND o.status = '已完成'
      GROUP BY o.order_date
    `).all(sparkFrom, sparkTo) as Array<{ bucket: string; orders_count: number; revenue: number }>
    const sparkMap = new Map(sparkRows.map(r => [r.bucket, r]))
    const kpi_trend_revenue: number[] = []
    const kpi_trend_orders: number[] = []
    let sparkCursor = sparkFrom
    while (sparkCursor <= sparkTo) {
      const row = sparkMap.get(sparkCursor)
      kpi_trend_revenue.push(row ? Math.round(row.revenue) : 0)
      kpi_trend_orders.push(row ? row.orders_count : 0)
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

    return NextResponse.json<ApiResponse<OverviewReport>>({ success: true, data: report }, { status: 200 })
  } catch (err) {
    console.error('[GET /api/reports/overview]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
