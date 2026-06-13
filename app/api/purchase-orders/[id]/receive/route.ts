// app/api/purchase-orders/[id]/receive/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface ApiResponse {
  success: boolean
  error?: string
}

// ============================================================
// POST /api/purchase-orders/:id/receive — 驗貨入庫
//
// 商業邏輯：
//   1. 確認進貨單狀態不是已驗貨（不可重複執行）
//   2. 根據 received_items 決定新狀態：
//      - 全部等於 order_qty → 已驗貨
//      - 有任何一項少於 order_qty → 部分退貨
//   3. 實際入庫：ingredient.stock_qty += received_qty（以 stock_unit 為單位）
//   4. total_amount 按比例重新計算
// ============================================================
interface ReceiveBody {
  received_items: Array<{
    ingredient_name: string
    received_qty: number   // 實際收到的數量（stock_unit）
  }>
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body: ReceiveBody = await req.json()
    const db = getDb()
    const poId = parseInt(params.id, 10)

    if (isNaN(poId)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '無效的進貨單 ID' },
        { status: 400 }
      )
    }

    // ── 確認進貨單存在 ──────────────────
    const po = db.prepare(
      'SELECT po_id, status FROM purchase_order WHERE po_id = ?'
    ).get(poId) as { po_id: number; status: string } | undefined

    if (!po) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該進貨單' },
        { status: 404 }
      )
    }
    if (po.status === '已驗貨') {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '該進貨單已驗貨完成，不可重複執行' },
        { status: 409 }
      )
    }

    // ── 驗證 received_items ─────────────
    if (!body.received_items || body.received_items.length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'received_items 不可為空' },
        { status: 400 }
      )
    }
    for (const item of body.received_items) {
      if (typeof item.received_qty !== 'number' || item.received_qty < 0) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `${item.ingredient_name} 的 received_qty 需為 >= 0 的數字` },
          { status: 400 }
        )
      }
    }

    // ── Transaction ──────────────────────
    let hasPartialReturn = false
    let totalReceivedCost = 0

    for (const item of body.received_items) {
      const poItem = db.prepare(
        'SELECT order_qty, total_cost FROM purchase_order_item WHERE po_id = ? AND ingredient_name = ?'
      ).get(poId, item.ingredient_name.trim()) as
        { order_qty: number; total_cost: number } | undefined

      if (!poItem) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `進貨單中找不到食材：${item.ingredient_name}` },
          { status: 400 }
        )
      }

      if (item.received_qty < poItem.order_qty) {
        hasPartialReturn = true
      }

      // 成本按比例攤提
      const ratio = poItem.order_qty > 0 ? item.received_qty / poItem.order_qty : 0
      totalReceivedCost += poItem.total_cost * ratio
    }

    db.transaction(() => {
      // 1. 實際入庫
      for (const item of body.received_items) {
        db.prepare(`
          UPDATE ingredient
          SET stock_qty = stock_qty + ?
          WHERE name = ?
        `).run(item.received_qty, item.ingredient_name.trim())
      }

      // 2. 更新進貨單狀態與總金額
      const newStatus = hasPartialReturn ? '部分退貨' : '已驗貨'
      db.prepare(`
        UPDATE purchase_order
        SET status = ?, total_amount = ?
        WHERE po_id = ?
      `).run(newStatus, Math.round(totalReceivedCost * 100) / 100, poId)
    })()

    return NextResponse.json<ApiResponse>({ success: true })

  } catch (err) {
    console.error('[POST /api/purchase-orders/:id/receive]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}