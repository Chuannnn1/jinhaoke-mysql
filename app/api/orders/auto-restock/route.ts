// app/api/orders/auto-restock/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface LowStockIngredient {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
  order_unit: string
  qty_per_order_unit: number
  supplier_name: string | null
}

interface RestockItem {
  ingredient_name: string
  order_qty: number        // 叫貨數量（stock_unit）
  qty_per_order_unit: number
  order_unit: string
  total_cost: number
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// POST /api/orders/auto-restock — 一鍵補貨
//
// 商業邏輯：
//   1. 找出所有低於安全存量的食材（stock_qty < safety_stock）
//   2. 對每個食材，計算「叫貨單位」的建議量
//      → 建議量 = (safety_stock - stock_qty) × 1.5（一次性叫多一點）
//      → 轉換為 order_unit 數量（向上取整）
//   3. 按供應商分組，產出多張 purchase_order
//   4. 如果所有食材庫存都高於安全存量 → 回「無需補貨」
// ============================================================
interface AutoRestockBody {
  supplier_name?: string   // 選填：不填 = 所有低庫存食材；填了 = 只補該供應商
}

export async function POST(req: Request) {
  try {
    const db = getDb()
    const body: AutoRestockBody = await req.json().catch(() => ({}))

    // ── 查詢低於安全存量的食材 ───────────
    let sql = `
      SELECT name, stock_qty, safety_stock, stock_unit,
             order_unit, qty_per_order_unit, supplier_name
      FROM ingredient
      WHERE stock_qty < safety_stock
    `
    const params: string[] = []

    if (body.supplier_name) {
      sql += ` AND supplier_name = ?`
      params.push(body.supplier_name.trim())
    }

    sql += ` ORDER BY supplier_name, name`

    const lowStockItems = db.prepare(sql).all(...params) as LowStockIngredient[]

    if (lowStockItems.length === 0) {
      return NextResponse.json<ApiResponse>({
        success: true,
        data: { po_id: null, items: [], message: '所有食材庫存充足' }
      }, { status: 200 })
    }

    // ── 計算建議叫貨量 ────────────────────
    // 公式：補足到安全存量的 1.5 倍，換成 order_unit
    const restockPlan: RestockItem[] = lowStockItems.map(ing => {
      const deficit = ing.safety_stock - ing.stock_qty           // 差額（stock_unit）
      const target = deficit * 1.5                               // 目標補足量
      const orderQty = ing.qty_per_order_unit > 0
        ? Math.ceil(target / ing.qty_per_order_unit)            // 轉換為 order_unit
        : target                                                  // 如果沒設定轉換，則直接用 stock_unit
      return {
        ingredient_name: ing.name,
        order_qty: Math.max(1, Math.round(orderQty * 100) / 100), // 至少叫 1
        qty_per_order_unit: ing.qty_per_order_unit,
        order_unit: ing.order_unit,
        total_cost: 0,  // 成本待填（視供應商報價而定，這裡先用 0 墊著）
      }
    })

    // ── 按供應商分組，各別建立 purchase_order ──
    const groupBySupplier = new Map<string, RestockItem[]>()
    for (const item of restockPlan) {
      // 用第一筆取得 supplier_name（因為 lowStockItems 有）
      const ing = lowStockItems.find(i => i.name === item.ingredient_name)!
      if (!ing.supplier_name) continue  // 沒有供應商的跳過
      if (!groupBySupplier.has(ing.supplier_name)) {
        groupBySupplier.set(ing.supplier_name, [])
      }
      groupBySupplier.get(ing.supplier_name)!.push(item)
    }

    const createdOrders: Array<{ po_id: number; supplier_name: string; items: RestockItem[] }> = []

    db.transaction(() => {
      for (const [supplierName, items] of groupBySupplier) {
        // 確認供應商存在
        const supplier = db.prepare('SELECT name FROM supplier WHERE name = ?').get(supplierName)
        if (!supplier) continue

        const today = new Date().toISOString().slice(0, 10)
        const result = db.prepare(`
          INSERT INTO purchase_order (po_date, supplier_name, total_amount, status)
          VALUES (?, ?, 0, '已訂購')
        `).run(today, supplierName)

        const poId = Number(result.lastInsertRowid)

        for (const item of items) {
          // 這裡 total_cost 暫存為 0（實際系統應串供應商報價 API）
          db.prepare(`
            INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, total_cost)
            VALUES (?, ?, ?, ?)
          `).run(poId, item.ingredient_name, item.order_qty, 0)
        }

        createdOrders.push({
          po_id: poId,
          supplier_name: supplierName,
          items: items.map(i => ({
            ...i,
            total_cost: 0,  // 墊著，生產系統需串報價
          }))
        })
      }
    })()

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        po_id: createdOrders.length > 0 ? createdOrders[0].po_id : null,
        orders: createdOrders,
        items: restockPlan,
        message: `已為 ${createdOrders.length} 個供應商建立進貨單，共 ${restockPlan.length} 項食材需要補貨`
      }
    }, { status: 201 })

  } catch (err) {
    console.error('[POST /api/orders/auto-restock]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}