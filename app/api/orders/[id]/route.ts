// app/api/orders/[id]/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface OrderItem {
  item_id: number
  name: string
  quantity: number
  unit_price: number
  subtotal: number
}

interface Order {
  order_id: string
  order_date: string
  created_at: string
  status: string
  customer_phone: string | null
  items: OrderItem[]
  total: number
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/orders/:id — 查詢單一訂單（含 items 巢狀結構）
// ============================================================
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb()

    const order = db.prepare(`
      SELECT order_id, order_date, created_at, status, customer_phone
      FROM "order"
      WHERE order_id = ?
    `).get(params.id) as Omit<Order, 'items' | 'total'> | undefined

    if (!order) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該訂單' },
        { status: 404 }
      )
    }

    const items = db.prepare(`
      SELECT oi.item_id, mi.name, oi.quantity, oi.unit_price,
             (oi.unit_price * oi.quantity) AS subtotal
      FROM order_item oi
      JOIN menu_item mi ON oi.item_id = mi.item_id
      WHERE oi.order_id = ?
    `).all(params.id) as OrderItem[]

    const total = items.reduce((sum, item) => sum + item.subtotal, 0)
    const fullOrder: Order = { ...order, items, total }

    return NextResponse.json<ApiResponse<Order>>(
      { success: true, data: fullOrder },
      { status: 200 }
    )

  } catch (err) {
    console.error('[GET /api/orders/:id]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// DELETE /api/orders/:id — 取消訂單（軟刪除：status 改為「已取消」）
//
// 商業邏輯：
//   1. 「已完成」的訂單不能取消（已出餐扣庫存，取消會造成庫存不一致）
//   2. 「已取消」的訂單再取消 → idempotent，回 200
//   3. 「待製作 / 製作中 / 待付款」都可以取消
// ============================================================
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb()

    const order = db.prepare('SELECT order_id, status FROM "order" WHERE order_id = ?')
      .get(params.id) as { order_id: string; status: string } | undefined

    if (!order) {
      return NextResponse.json<ApiResponse>({ success: true })  // idempotent
    }

    if (order.status === '已完成') {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '已完成之訂單無法取消，如需處理請聯絡管理員' },
        { status: 409 }
      )
    }

    if (order.status === '已取消') {
      return NextResponse.json<ApiResponse>({ success: true })  // idempotent
    }

    db.prepare('UPDATE "order" SET status = ? WHERE order_id = ?')
      .run('已取消', params.id)

    return NextResponse.json<ApiResponse>({ success: true })

  } catch (err) {
    console.error('[DELETE /api/orders/:id]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}