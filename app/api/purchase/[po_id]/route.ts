// app/api/purchase/[po_id]/route.ts
// ============================================================
//   GET   /api/purchase/:po_id    單張採購單（含明細）
//   PATCH /api/purchase/:po_id    改狀態 / upsert 明細
// ============================================================
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface PurchaseOrder {
  po_id: number
  po_date: string
  supplier_name: string
  total_amount: number
  status: string
  items?: PurchaseOrderItem[]
}

interface PurchaseOrderItem {
  ingredient_name: string
  order_qty: number
  total_cost: number
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

interface PatchBody {
  status?: '已訂購' | '已驗貨' | '部分退貨'
  items?: Array<{
    ingredient_name: string
    order_qty: number
    total_cost?: number
  }>
}

const ALLOWED_STATUS = ['已訂購', '已驗貨', '部分退貨'] as const

function loadOrder(db: ReturnType<typeof getDb>, poId: number): PurchaseOrder | null {
  const po = db
    .prepare(
      'SELECT po_id, po_date, supplier_name, total_amount, status FROM purchase_order WHERE po_id = ?'
    )
    .get(poId) as PurchaseOrder | undefined
  if (!po) return null
  po.items = db
    .prepare(
      'SELECT ingredient_name, order_qty, total_cost FROM purchase_order_item WHERE po_id = ?'
    )
    .all(poId) as PurchaseOrderItem[]
  return po
}

// ============================================================
// GET /api/purchase/:po_id
// ============================================================
export async function GET(
  _req: Request,
  { params }: { params: { po_id: string } }
) {
  try {
    const db = getDb()
    const poId = parseInt(params.po_id, 10)
    if (isNaN(poId)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '無效的採購單 ID' },
        { status: 400 }
      )
    }
    const po = loadOrder(db, poId)
    if (!po) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該採購單' },
        { status: 404 }
      )
    }
    return NextResponse.json<ApiResponse<PurchaseOrder>>(
      { success: true, data: po },
      { status: 200 }
    )
  } catch (err) {
    console.error('[GET /api/purchase/:po_id]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// PATCH /api/purchase/:po_id — 改狀態 / 更新明細
// ============================================================
export async function PATCH(
  req: Request,
  { params }: { params: { po_id: string } }
) {
  try {
    const db = getDb()
    const poId = parseInt(params.po_id, 10)
    if (isNaN(poId)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '無效的採購單 ID' },
        { status: 400 }
      )
    }

    const exists = db
      .prepare('SELECT po_id FROM purchase_order WHERE po_id = ?')
      .get(poId)
    if (!exists) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該採購單' },
        { status: 404 }
      )
    }

    const body: PatchBody = await req.json()

    // 預先驗證
    if (body.status !== undefined) {
      if (!ALLOWED_STATUS.includes(body.status)) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `非法狀態：${body.status}` },
          { status: 400 }
        )
      }
    }
    if (body.items !== undefined) {
      for (const item of body.items) {
        if (!item.ingredient_name?.trim()) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: 'ingredient_name 必填' },
            { status: 400 }
          )
        }
        const ing = db
          .prepare('SELECT name FROM ingredient WHERE name = ?')
          .get(item.ingredient_name.trim())
        if (!ing) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: `找不到食材：${item.ingredient_name}` },
            { status: 400 }
          )
        }
        if (typeof item.order_qty !== 'number' || item.order_qty <= 0) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: `${item.ingredient_name} 的 order_qty 需為正數` },
            { status: 400 }
          )
        }
      }
    }

    // 抓舊狀態，判斷是否「進入已驗貨」(用來補庫存)
    const prevRow = db
      .prepare('SELECT status FROM purchase_order WHERE po_id = ?')
      .get(poId) as { status: string }
    const prevStatus = prevRow.status
    const enteringReceived =
      body.status === '已驗貨' && prevStatus !== '已驗貨'

    db.transaction(() => {
      if (body.status !== undefined) {
        db.prepare('UPDATE purchase_order SET status = ? WHERE po_id = ?')
          .run(body.status, poId)
      }

      if (body.items !== undefined && body.items.length > 0) {
        // upsert: 同食材就 UPDATE，否則 INSERT
        const upsert = db.prepare(`
          INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, total_cost)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(po_id, ingredient_name) DO UPDATE SET
            order_qty  = excluded.order_qty,
            total_cost = excluded.total_cost
        `)
        for (const item of body.items) {
          upsert.run(
            poId,
            item.ingredient_name.trim(),
            item.order_qty,
            Number(item.total_cost) || 0
          )
        }

        // 重新彙總 total_amount
        const sum = db
          .prepare(
            'SELECT COALESCE(SUM(total_cost), 0) AS s FROM purchase_order_item WHERE po_id = ?'
          )
          .get(poId) as { s: number }
        db.prepare('UPDATE purchase_order SET total_amount = ? WHERE po_id = ?')
          .run(sum.s, poId)
      }

      // 「進入已驗貨」→ 把這張 PO 全部明細 order_qty 加回 ingredient.stock_qty
      // 為避免重複入帳，只在 prevStatus !== '已驗貨' && 新狀態 === '已驗貨' 時觸發
      if (enteringReceived) {
        const items = db
          .prepare(
            'SELECT ingredient_name, order_qty FROM purchase_order_item WHERE po_id = ?'
          )
          .all(poId) as Array<{ ingredient_name: string; order_qty: number }>
        const addStock = db.prepare(
          'UPDATE ingredient SET stock_qty = stock_qty + ? WHERE name = ?'
        )
        for (const it of items) {
          const r = addStock.run(it.order_qty, it.ingredient_name)
          if (r.changes === 0) {
            console.warn(
              `[purchase 已驗貨] 找不到食材 "${it.ingredient_name}"，跳過入庫`
            )
          }
        }
      }
    })()

    const updated = loadOrder(db, poId)
    return NextResponse.json<ApiResponse<PurchaseOrder>>(
      { success: true, data: updated! },
      { status: 200 }
    )
  } catch (err) {
    console.error('[PATCH /api/purchase/:po_id]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}
