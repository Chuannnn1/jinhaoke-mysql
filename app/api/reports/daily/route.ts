// app/api/reports/daily/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface DailyReport {
  date: string
  orders_count: number
  total_revenue: number
  top_items: Array<{
    name: string
    qty: number
    revenue: number
  }>
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/reports/daily — 每日營收報表
//
// 計算邏輯：
//   1. 只統計 status = '已完成' 的訂單（已出餐才算營收）
//   2. 營收 = sum(order_item.unit_price × quantity)
//   3. top_items = 按品項銷售數量排序，取前5名
// ============================================================
export async function GET(req: Request) {
  try {
    const db = getDb()
    const { searchParams } = new URL(req.url)
    // 預設「今天」用台灣時區 (UTC+8)；toISOString 本身是 UTC，台灣早上 8 點前會撈到前一天
    const todayTW = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    const date = searchParams.get('date') ?? todayTW

    // 驗證日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '日期格式需為 YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // ── 訂單筆數 + 總營收 ─────────────────
    const orderStats = db.prepare(`
      SELECT COUNT(DISTINCT o.order_id) AS orders_count
      FROM "order" o
      WHERE o.order_date = ? AND o.status = '已完成'
    `).get(date) as { orders_count: number }

    const revenue = db.prepare(`
      SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total_revenue
      FROM "order" o
      JOIN order_item oi ON o.order_id = oi.order_id
      WHERE o.order_date = ? AND o.status = '已完成'
    `).get(date) as { total_revenue: number }

    // ── Top 5 暢銷品項 ────────────────────
    const topItems = db.prepare(`
      SELECT
        mi.name,
        SUM(oi.quantity) AS qty,
        SUM(oi.unit_price * oi.quantity) AS revenue
      FROM "order" o
      JOIN order_item oi ON o.order_id = oi.order_id
      JOIN menu_item mi ON oi.item_id = mi.item_id
      WHERE o.order_date = ? AND o.status = '已完成'
      GROUP BY mi.item_id, mi.name
      ORDER BY qty DESC
      LIMIT 5
    `).all(date) as Array<{ name: string; qty: number; revenue: number }>

    const report: DailyReport = {
      date,
      orders_count: orderStats.orders_count,
      total_revenue: Math.round(revenue.total_revenue),
      top_items: topItems.map(item => ({
        name: item.name,
        qty: Number(item.qty),
        revenue: Math.round(item.revenue),
      })),
    }

    return NextResponse.json<ApiResponse<DailyReport>>(
      { success: true, data: report },
      { status: 200 }
    )

  } catch (err) {
    console.error('[GET /api/reports/daily]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}