// app/api/inventory/low-stock/route.ts
// ============================================================
// GET /api/inventory/low-stock
//   一次抓「低於安全庫存」的食材 + 各家可選廠商 + 建議補貨量。
//   給庫存管理頁的低庫存警示彈窗用。
// ============================================================
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface SupplierOption {
  supplier_name: string
  is_primary: number
  price_per_order_unit: number | null
}

interface LowStockItem {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
  order_unit: string
  qty_per_order_unit: number
  suggested_qty: number       // stock_unit 下的補到 2×safety 所需量
  default_supplier: string | null
  suppliers: SupplierOption[]
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function GET() {
  try {
    const db = getDb()

    const lows = db.prepare(`
      SELECT name, stock_qty, safety_stock, stock_unit, order_unit,
             qty_per_order_unit, supplier_name
      FROM ingredient
      WHERE safety_stock > 0 AND stock_qty <= safety_stock
      ORDER BY (stock_qty * 1.0 / NULLIF(safety_stock, 0)) ASC, name
    `).all() as Array<{
      name: string
      stock_qty: number
      safety_stock: number
      stock_unit: string
      order_unit: string
      qty_per_order_unit: number
      supplier_name: string | null
    }>

    if (lows.length === 0) {
      return NextResponse.json<ApiResponse<LowStockItem[]>>({ success: true, data: [] })
    }

    const supStmt = db.prepare(`
      SELECT supplier_name, is_primary, price_per_order_unit
      FROM ingredient_supplier
      WHERE ingredient_name = ?
      ORDER BY is_primary DESC, supplier_name
    `)

    const result: LowStockItem[] = lows.map(it => {
      const sups = supStmt.all(it.name) as SupplierOption[]
      // Fallback：junction 表空 → 用 ingredient.supplier_name 模擬一筆 primary
      if (sups.length === 0 && it.supplier_name) {
        sups.push({ supplier_name: it.supplier_name, is_primary: 1, price_per_order_unit: null })
      }
      const target = it.safety_stock * 2
      const needed = Math.max(0, target - it.stock_qty)
      const suggested = Math.round(needed * 10) / 10
      return {
        name: it.name,
        stock_qty: it.stock_qty,
        safety_stock: it.safety_stock,
        stock_unit: it.stock_unit,
        order_unit: it.order_unit,
        qty_per_order_unit: it.qty_per_order_unit,
        suggested_qty: suggested,
        default_supplier: it.supplier_name,
        suppliers: sups,
      }
    })

    return NextResponse.json<ApiResponse<LowStockItem[]>>({ success: true, data: result })
  } catch (err) {
    console.error('[GET /api/inventory/low-stock]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}
