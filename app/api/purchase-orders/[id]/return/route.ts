// app/api/purchase-orders/[id]/return/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface ApiResponse {
  success: boolean
  error?: string
}

// ============================================================
// POST /api/purchase-orders/:id/return — 登錄退貨
//
// 商業邏輯：
//   1. 退貨後 stock_qty -= return_qty（庫存扣減）
//   2. 新增一筆 return_order 記錄退貨事實
//   3. 如果退貨導致庫存變負數，要攔截（庫存不夠退）
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

    // ── 驗證 ─────────────────────────────
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

    // ── 確認進貨單存在 ──────────────────
    const po = db.prepare(
      'SELECT po_id FROM purchase_order WHERE po_id = ?'
    ).get(poId)
    if (!po) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該進貨單' },
        { status: 404 }
      )
    }

    // ── 確認食材在進貨單中 ───────────────
    const poItem = db.prepare(
      'SELECT ingredient_name FROM purchase_order_item WHERE po_id = ? AND ingredient_name = ?'
    ).get(poId, body.ingredient_name.trim())
    if (!poItem) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '該進貨單中沒有此食材' },
        { status: 400 }
      )
    }

    // ── 檢查庫存是否足夠退 ──────────────
    const ingredient = db.prepare(
      'SELECT name, stock_qty FROM ingredient WHERE name = ?'
    ).get(body.ingredient_name.trim()) as { name: string; stock_qty: number } | undefined

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

    // ── Transaction ──────────────────────
    const today = new Date().toISOString().slice(0, 10)

    db.transaction(() => {
      // 1. 庫存扣減
      db.prepare(`
        UPDATE ingredient
        SET stock_qty = stock_qty - ?
        WHERE name = ?
      `).run(body.return_qty, body.ingredient_name.trim())

      // 2. 新增退貨記錄（複合 PK：po_id + ingredient_name）
      db.prepare(`
        INSERT INTO return_order (po_id, ingredient_name, return_date, return_reason, return_qty)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        poId,
        body.ingredient_name.trim(),
        today,
        body.return_reason?.trim() ?? null,
        body.return_qty
      )
    })()

    return NextResponse.json<ApiResponse>({ success: true })

  } catch (err) {
    console.error('[POST /api/purchase-orders/:id/return]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}