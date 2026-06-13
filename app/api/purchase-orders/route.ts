// app/api/purchase-orders/route.ts
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

// ============================================================
// GET /api/purchase-orders — 查詢進貨單（可依供應商/狀態篩選）
// ============================================================
export async function GET(req: Request) {
  try {
    const db = getDb()
    const { searchParams } = new URL(req.url)
    const supplierName = searchParams.get('supplier_name')
    const status = searchParams.get('status')

    let sql = `SELECT po_id, po_date, supplier_name, total_amount, status FROM purchase_order WHERE 1=1`
    const params: (string | number)[] = []

    if (supplierName) {
      sql += ` AND supplier_name = ?`
      params.push(supplierName)
    }
    if (status) {
      sql += ` AND status = ?`
      params.push(status)
    }

    sql += ` ORDER BY po_date DESC, po_id DESC`

    const orders = db.prepare(sql).all(...params) as PurchaseOrder[]

    // 撈每張進貨單的明細
    for (const order of orders) {
      const items = db.prepare(`
        SELECT ingredient_name, order_qty, total_cost
        FROM purchase_order_item
        WHERE po_id = ?
      `).all(order.po_id) as PurchaseOrderItem[]
      order.items = items
    }

    return NextResponse.json<ApiResponse<PurchaseOrder[]>>(
      { success: true, data: orders },
      { status: 200 }
    )
  } catch (err) {
    console.error('[GET /api/purchase-orders]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/purchase-orders — 新建進貨單（主表 + 明細在同一 transaction）
// ============================================================
interface CreatePOBody {
  supplier_name: string
  items: Array<{
    ingredient_name: string
    order_qty: number
    total_cost: number
  }>
}

export async function POST(req: Request) {
  try {
    const body: CreatePOBody = await req.json()
    const db = getDb()

    // ── 驗證必填 ─────────────────────────
    if (!body.supplier_name || !body.items || body.items.length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'supplier_name 與 items 為必填' },
        { status: 400 }
      )
    }

    // ── FK 驗證：supplier 存在 ───────────
    const supplier = db.prepare('SELECT name FROM supplier WHERE name = ?').get(body.supplier_name.trim())
    if (!supplier) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該供應商' },
        { status: 400 }
      )
    }

    // ── 驗證每項食材存在 ─────────────────
    for (const item of body.items) {
      const ingredient = db.prepare('SELECT name FROM ingredient WHERE name = ?').get(item.ingredient_name.trim())
      if (!ingredient) {
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

    // ── Transaction：主表 + 明細一起寫 ────
    const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
    const totalAmount = body.items.reduce((sum, item) => sum + (item.total_cost ?? 0), 0)

    let newPoId: number = 0
    db.transaction(() => {
      // 1. 寫入主表
      const result = db.prepare(`
        INSERT INTO purchase_order (po_date, supplier_name, total_amount, status)
        VALUES (?, ?, ?, '已訂購')
      `).run(today, body.supplier_name.trim(), totalAmount)

      newPoId = Number(result.lastInsertRowid)

      // 2. 寫入明細
      for (const item of body.items) {
        db.prepare(`
          INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, total_cost)
          VALUES (?, ?, ?, ?)
        `).run(newPoId, item.ingredient_name.trim(), item.order_qty, item.total_cost ?? 0)
      }
    })()

    // ── 回傳新建的進貨單（含明細）──────────
    const newOrder = db.prepare('SELECT po_id, po_date, supplier_name, total_amount, status FROM purchase_order WHERE po_id = ?')
      .get(newPoId) as PurchaseOrder
    const items = db.prepare('SELECT ingredient_name, order_qty, total_cost FROM purchase_order_item WHERE po_id = ?')
      .all(newPoId) as PurchaseOrderItem[]
    newOrder.items = items

    return NextResponse.json<ApiResponse<PurchaseOrder>>(
      { success: true, data: newOrder },
      { status: 201 }
    )

  } catch (err) {
    console.error('[POST /api/purchase-orders]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}