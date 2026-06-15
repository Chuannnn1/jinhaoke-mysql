// app/api/purchase-orders/[id]/return/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// POST /api/purchase-orders/:id/return — 登錄退貨
//
// 商業邏輯（v2 重設計）：
//   1. 一張 PO 的同一食材可以多次退貨（schema 已改用 return_id PK）
//   2. 累計檢查：已退貨總量 + 本次 return_qty 不能超過 order_qty
//   3. 退貨後 ingredient.stock_qty -= return_qty（庫存扣減）
//   4. 退貨後若 PO 狀態仍是 '已驗貨'，自動推進為 '已退貨'
//   5. 庫存負數仍要擋（API 端的硬性保護）
// ============================================================
interface ReturnBody {
  ingredient_name: string
  return_qty: number
  return_reason?: string
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body: ReturnBody = await req.json()
    const db = getDb()
    const poId = parseInt(params.id, 10)

    if (isNaN(poId)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '無效的進貨單 ID' },
        { status: 400 }
      )
    }

    if (!body.ingredient_name || body.return_qty === undefined) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'ingredient_name 和 return_qty 為必填' },
        { status: 400 }
      )
    }
    if (typeof body.return_qty !== 'number' || body.return_qty <= 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'return_qty 需為正數' },
        { status: 400 }
      )
    }

    const ingName = body.ingredient_name.trim()

    // PO 存在性
    const po = db.prepare(
      'SELECT po_id, status FROM purchase_order WHERE po_id = ?'
    ).get(poId) as { po_id: number; status: string } | undefined
    if (!po) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該進貨單' },
        { status: 404 }
      )
    }

    // 該食材在 PO 明細裡
    const poItem = db.prepare(
      'SELECT order_qty FROM purchase_order_item WHERE po_id = ? AND ingredient_name = ?'
    ).get(poId, ingName) as { order_qty: number } | undefined
    if (!poItem) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '該進貨單中沒有此食材' },
        { status: 400 }
      )
    }

    // 累計已退貨量
    const aggRow = db.prepare(
      'SELECT COALESCE(SUM(return_qty), 0) AS s FROM return_order WHERE po_id = ? AND ingredient_name = ?'
    ).get(poId, ingName) as { s: number }
    const alreadyReturned = Number(aggRow.s) || 0
    const remaining = poItem.order_qty - alreadyReturned

    if (remaining <= 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `${ingName} 已全數退貨（${alreadyReturned}/${poItem.order_qty}），無法再退` },
        { status: 400 }
      )
    }
    if (body.return_qty > remaining) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `${ingName} 可退數量為 ${remaining}（已退 ${alreadyReturned}/${poItem.order_qty}），不能退 ${body.return_qty}` },
        { status: 400 }
      )
    }

    // 庫存夠扣
    const ingredient = db.prepare(
      'SELECT name, stock_qty FROM ingredient WHERE name = ?'
    ).get(ingName) as { name: string; stock_qty: number } | undefined
    if (!ingredient) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該食材' },
        { status: 404 }
      )
    }
    if (ingredient.stock_qty < body.return_qty) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `庫存不足：目前 ${ingredient.name} 庫存為 ${ingredient.stock_qty}，無法退貨 ${body.return_qty}` },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().slice(0, 10)

    db.transaction(() => {
      db.prepare(`
        UPDATE ingredient SET stock_qty = stock_qty - ? WHERE name = ?
      `).run(body.return_qty, ingName)

      db.prepare(`
        INSERT INTO return_order (po_id, ingredient_name, return_date, return_reason, return_qty)
        VALUES (?, ?, ?, ?, ?)
      `).run(poId, ingName, today, body.return_reason?.trim() || null, body.return_qty)

      // 自動推進狀態：'已驗貨' → '已退貨'
      if (po.status === '已驗貨') {
        db.prepare("UPDATE purchase_order SET status = '已退貨' WHERE po_id = ?").run(poId)
      }
    })()

    return NextResponse.json<ApiResponse>({ success: true })
  } catch (err) {
    console.error('[POST /api/purchase-orders/:id/return]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
