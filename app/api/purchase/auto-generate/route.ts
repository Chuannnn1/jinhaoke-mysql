// app/api/purchase/auto-generate/route.ts
// ============================================================
// 自動補貨建議
//   POST /api/purchase/auto-generate
//
// 邏輯：
//   1. 找所有 stock_qty <= safety_stock 且 safety_stock > 0 的 ingredient
//   2. 按 supplier_name group（無供應商者歸入 __no_supplier__，回報但不建單）
//   3. 每個 supplier 開一張 purchase_order（status='已訂購', po_date=今天）
//      明細包含旗下所有低庫存食材，order_qty = 補到 2 倍 safety_stock 所需
//      total_cost 暫填 0（等驗貨時填入）
// ============================================================
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface LowStockIngredient {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
  supplier_name: string | null
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

interface AutoGenResult {
  created_count: number
  created_orders: Array<{
    po_id: number
    supplier_name: string
    item_count: number
  }>
  covered_ingredients: string[]
  skipped_no_supplier: string[]
}

export async function POST() {
  try {
    const db = getDb()

    const lowStock = db.prepare(`
      SELECT name, stock_qty, safety_stock, stock_unit, supplier_name
      FROM ingredient
      WHERE safety_stock > 0
        AND stock_qty <= safety_stock
      ORDER BY supplier_name, name
    `).all() as LowStockIngredient[]

    if (lowStock.length === 0) {
      return NextResponse.json<ApiResponse<AutoGenResult>>(
        {
          success: true,
          data: {
            created_count: 0,
            created_orders: [],
            covered_ingredients: [],
            skipped_no_supplier: [],
          },
        },
        { status: 200 }
      )
    }

    // 按 supplier 分組
    const bySupplier = new Map<string, LowStockIngredient[]>()
    const skipped: string[] = []
    for (const ing of lowStock) {
      if (!ing.supplier_name) {
        skipped.push(ing.name)
        continue
      }
      const arr = bySupplier.get(ing.supplier_name) ?? []
      arr.push(ing)
      bySupplier.set(ing.supplier_name, arr)
    }

    const today = new Date().toISOString().slice(0, 10)
    const result: AutoGenResult = {
      created_count: 0,
      created_orders: [],
      covered_ingredients: [],
      skipped_no_supplier: skipped,
    }

    db.transaction(() => {
      for (const [supplier, items] of bySupplier) {
        // supplier 必須存在於 supplier 表（FK）
        const sup = db
          .prepare('SELECT name FROM supplier WHERE name = ?')
          .get(supplier)
        if (!sup) {
          // 食材掛了不存在的 supplier_name → 視為 skipped
          for (const it of items) skipped.push(it.name)
          continue
        }

        const poResult = db.prepare(`
          INSERT INTO purchase_order (po_date, supplier_name, total_amount, status)
          VALUES (?, ?, 0, '已訂購')
        `).run(today, supplier)

        const newPoId = Number(poResult.lastInsertRowid)

        let itemCount = 0
        for (const ing of items) {
          // 補到 2 倍 safety_stock 所需數量（以 stock_unit 計）
          const target = ing.safety_stock * 2
          const needed = Math.max(0, target - ing.stock_qty)
          // 浮點殘留處理：四捨五入到 1 位（與 inventory 顯示一致）
          const orderQty = Math.round(needed * 10) / 10
          if (orderQty <= 0) continue

          db.prepare(`
            INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, total_cost)
            VALUES (?, ?, ?, 0)
          `).run(newPoId, ing.name, orderQty)

          result.covered_ingredients.push(ing.name)
          itemCount++
        }

        // 如果這張單沒有任何明細，回滾掉這張單
        if (itemCount === 0) {
          db.prepare('DELETE FROM purchase_order WHERE po_id = ?').run(newPoId)
          continue
        }

        result.created_count++
        result.created_orders.push({
          po_id: newPoId,
          supplier_name: supplier,
          item_count: itemCount,
        })
      }
    })()

    result.skipped_no_supplier = skipped

    return NextResponse.json<ApiResponse<AutoGenResult>>(
      { success: true, data: result },
      { status: 200 }
    )
  } catch (err) {
    console.error('[POST /api/purchase/auto-generate]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}
