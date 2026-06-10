// app/api/purchase/route.ts
// ============================================================
// 採購管理 API（與舊版 /api/purchase-orders 並存）
//   GET  /api/purchase           列表（含明細）
//   POST /api/purchase           建單（主表 + 明細，transaction）
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

interface CreatePOBody {
  po_date?: string
  supplier_name: string
  status?: '已訂購' | '已驗貨' | '部分退貨'
  items: Array<{
    ingredient_name: string
    order_qty: number
    total_cost?: number
  }>
}

// ============================================================
// GET /api/purchase — 列表（可依 supplier / status 篩選）
// ============================================================
export async function GET(req: Request) {
  try {
    const db = getDb()
    const { searchParams } = new URL(req.url)
    const supplierName = searchParams.get('supplier_name')
    const status = searchParams.get('status')

    let sql = `SELECT po_id, po_date, supplier_name, total_amount, status
               FROM purchase_order WHERE 1=1`
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

    const itemStmt = db.prepare(`
      SELECT ingredient_name, order_qty, total_cost
      FROM purchase_order_item
      WHERE po_id = ?
    `)
    for (const order of orders) {
      order.items = itemStmt.all(order.po_id) as PurchaseOrderItem[]
    }

    return NextResponse.json<ApiResponse<PurchaseOrder[]>>(
      { success: true, data: orders },
      { status: 200 }
    )
  } catch (err) {
    console.error('[GET /api/purchase]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/purchase — 新建採購單（主表 + 明細，transaction）
// ============================================================
export async function POST(req: Request) {
  try {
    const body: CreatePOBody = await req.json()
    const db = getDb()

    if (!body.supplier_name || !body.items || body.items.length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'supplier_name 與 items 為必填' },
        { status: 400 }
      )
    }

    const supplier = db
      .prepare('SELECT name FROM supplier WHERE name = ?')
      .get(body.supplier_name.trim())
    if (!supplier) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該供應商' },
        { status: 400 }
      )
    }

    // 驗證每項食材存在 + 數量
    for (const item of body.items) {
      const ingredient = db
        .prepare('SELECT name FROM ingredient WHERE name = ?')
        .get(item.ingredient_name.trim())
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

    // 狀態白名單
    const status = body.status ?? '已訂購'
    if (!['已訂購', '已驗貨', '部分退貨'].includes(status)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `非法狀態：${status}` },
        { status: 400 }
      )
    }

    const today = body.po_date || new Date().toISOString().slice(0, 10)
    const totalAmount = body.items.reduce(
      (sum, item) => sum + (Number(item.total_cost) || 0),
      0
    )

    let newPoId = 0
    db.transaction(() => {
      const result = db
        .prepare(`
          INSERT INTO purchase_order (po_date, supplier_name, total_amount, status)
          VALUES (?, ?, ?, ?)
        `)
        .run(today, body.supplier_name.trim(), totalAmount, status)

      newPoId = Number(result.lastInsertRowid)

      // 同食材合併（PK 是 (po_id, ingredient_name)）
      const merged = new Map<string, { order_qty: number; total_cost: number }>()
      for (const item of body.items) {
        const key = item.ingredient_name.trim()
        const prev = merged.get(key)
        if (prev) {
          prev.order_qty += item.order_qty
          prev.total_cost += Number(item.total_cost) || 0
        } else {
          merged.set(key, {
            order_qty: item.order_qty,
            total_cost: Number(item.total_cost) || 0,
          })
        }
      }
      for (const [name, v] of merged) {
        db.prepare(`
          INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, total_cost)
          VALUES (?, ?, ?, ?)
        `).run(newPoId, name, v.order_qty, v.total_cost)
      }

      // 邊界：若新建時直接 status='已驗貨'，需同步補庫存
      if (status === '已驗貨') {
        const addStock = db.prepare(
          'UPDATE ingredient SET stock_qty = stock_qty + ? WHERE name = ?'
        )
        for (const [name, v] of merged) {
          const r = addStock.run(v.order_qty, name)
          if (r.changes === 0) {
            console.warn(`[purchase 已驗貨] 找不到食材 "${name}"，跳過入庫`)
          }
        }
      }
    })()

    const newOrder = db
      .prepare(
        'SELECT po_id, po_date, supplier_name, total_amount, status FROM purchase_order WHERE po_id = ?'
      )
      .get(newPoId) as PurchaseOrder
    newOrder.items = db
      .prepare(
        'SELECT ingredient_name, order_qty, total_cost FROM purchase_order_item WHERE po_id = ?'
      )
      .all(newPoId) as PurchaseOrderItem[]

    return NextResponse.json<ApiResponse<PurchaseOrder>>(
      { success: true, data: newOrder },
      { status: 201 }
    )
  } catch (err) {
    console.error('[POST /api/purchase]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}
