// app/api/purchase/auto-generate/route.ts
// ============================================================
// 自動補貨建議
//   POST /api/purchase/auto-generate
//
// 兩種模式：
//   (A) 帶 body { items: [{ ingredient_name, supplier_name, order_qty }, ...] }
//       → 老闆在低庫存彈窗手動選好廠商/數量，按 supplier 分組建單
//   (B) 不帶 body（fallback 舊行為）
//       → 自動掃所有低庫存食材，用 ingredient.supplier_name 作為廠商，
//         補到 2 × safety_stock，無供應商者 skip
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

interface BodyItem {
  ingredient_name: string
  supplier_name: string
  order_qty: number
}

export async function POST(req: Request) {
  try {
    const db = getDb()

    // 解析 body（可選）
    let body: { items?: BodyItem[] } | null = null
    try {
      const text = await req.text()
      if (text && text.trim().length > 0) body = JSON.parse(text)
    } catch {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'body JSON 解析失敗' },
        { status: 400 }
      )
    }

    // ── 模式 A：老闆手動指定 items ─────────────────────────
    if (body?.items && Array.isArray(body.items) && body.items.length > 0) {
      return handleManualMode(db, body.items)
    }

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

// ============================================================
// 模式 A：依使用者指定的 {ingredient, supplier, qty} 分組建單
// ============================================================
function handleManualMode(
  db: ReturnType<typeof getDb>,
  rawItems: BodyItem[]
) {
  // 驗證每筆
  const cleaned: BodyItem[] = []
  for (const it of rawItems) {
    if (!it.ingredient_name?.trim() || !it.supplier_name?.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'items 每筆需含 ingredient_name + supplier_name' },
        { status: 400 }
      )
    }
    const qty = Number(it.order_qty)
    if (!Number.isFinite(qty) || qty <= 0) continue   // qty 為 0 視為「不下單」，過濾掉
    cleaned.push({
      ingredient_name: it.ingredient_name.trim(),
      supplier_name: it.supplier_name.trim(),
      order_qty: Math.round(qty * 10) / 10,
    })
  }
  if (cleaned.length === 0) {
    return NextResponse.json<ApiResponse<AutoGenResult>>(
      {
        success: true,
        data: { created_count: 0, created_orders: [], covered_ingredients: [], skipped_no_supplier: [] },
      },
      { status: 200 }
    )
  }

  // FK 驗證
  for (const it of cleaned) {
    const ing = db.prepare('SELECT name FROM ingredient WHERE name = ?').get(it.ingredient_name)
    if (!ing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `找不到食材：${it.ingredient_name}` },
        { status: 400 }
      )
    }
    const sup = db.prepare('SELECT name FROM supplier WHERE name = ?').get(it.supplier_name)
    if (!sup) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `找不到供應商：${it.supplier_name}` },
        { status: 400 }
      )
    }
  }

  // 按 supplier 分組（PK 衝突防護：同 supplier 內同食材合併 qty）
  const bySupplier = new Map<string, Map<string, number>>()
  for (const it of cleaned) {
    const m = bySupplier.get(it.supplier_name) ?? new Map<string, number>()
    m.set(it.ingredient_name, (m.get(it.ingredient_name) ?? 0) + it.order_qty)
    bySupplier.set(it.supplier_name, m)
  }

  const today = new Date().toISOString().slice(0, 10)
  const result: AutoGenResult = {
    created_count: 0,
    created_orders: [],
    covered_ingredients: [],
    skipped_no_supplier: [],
  }

  db.transaction(() => {
    for (const [supplier, items] of bySupplier) {
      const poResult = db.prepare(`
        INSERT INTO purchase_order (po_date, supplier_name, total_amount, status)
        VALUES (?, ?, 0, '已訂購')
      `).run(today, supplier)
      const newPoId = Number(poResult.lastInsertRowid)

      let itemCount = 0
      for (const [ingName, qty] of items) {
        // 嘗試吃 ingredient_supplier.price_per_order_unit × (qty / qty_per_order_unit) 估價
        const priceRow = db.prepare(`
          SELECT s.price_per_order_unit AS price, i.qty_per_order_unit AS perOrder
          FROM ingredient_supplier s
          JOIN ingredient i ON i.name = s.ingredient_name
          WHERE s.ingredient_name = ? AND s.supplier_name = ?
        `).get(ingName, supplier) as { price: number | null; perOrder: number } | undefined
        const estCost =
          priceRow?.price && priceRow.perOrder > 0
            ? Math.round((priceRow.price * qty) / priceRow.perOrder * 100) / 100
            : 0

        db.prepare(`
          INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, total_cost)
          VALUES (?, ?, ?, ?)
        `).run(newPoId, ingName, qty, estCost)
        result.covered_ingredients.push(ingName)
        itemCount++
      }

      if (itemCount === 0) {
        db.prepare('DELETE FROM purchase_order WHERE po_id = ?').run(newPoId)
        continue
      }

      // 彙總 total_amount
      const sum = db
        .prepare('SELECT COALESCE(SUM(total_cost), 0) AS s FROM purchase_order_item WHERE po_id = ?')
        .get(newPoId) as { s: number }
      db.prepare('UPDATE purchase_order SET total_amount = ? WHERE po_id = ?').run(sum.s, newPoId)

      result.created_count++
      result.created_orders.push({ po_id: newPoId, supplier_name: supplier, item_count: itemCount })
    }
  })()

  return NextResponse.json<ApiResponse<AutoGenResult>>(
    { success: true, data: result },
    { status: 200 }
  )
}
