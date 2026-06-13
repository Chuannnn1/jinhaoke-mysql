// app/api/ingredients/[name]/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface Ingredient {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
  order_unit: string
  qty_per_order_unit: number
  supplier_name: string | null
}

interface UpdateIngredientBody {
  stock_qty?: number
  safety_stock?: number
  stock_unit?: string
  order_unit?: string
  qty_per_order_unit?: number
  supplier_name?: string | null  // null = 解除關聯
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/ingredients/:name — 查詢單一食材
// ============================================================
export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const db = getDb()
    const ingredient = db.prepare(`
      SELECT name, stock_qty, safety_stock, stock_unit,
             order_unit, qty_per_order_unit, supplier_name
      FROM ingredient WHERE name = ?
    `).get(params.name) as Ingredient | undefined

    if (!ingredient) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該食材' },
        { status: 404 }
      )
    }

    return NextResponse.json<ApiResponse<Ingredient>>(
      { success: true, data: ingredient },
      { status: 200 }
    )
  } catch (err) {
    console.error('[GET /api/ingredients/:name]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// PUT /api/ingredients/:name — 修改食材（局部更新，name(PK) 不可改）
// ============================================================
export async function PUT(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const body: UpdateIngredientBody = await req.json()
    const db = getDb()

    // ── 確認存在 ─────────────────────────
    const existing = db.prepare('SELECT name FROM ingredient WHERE name = ?').get(params.name)
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該食材' },
        { status: 404 }
      )
    }

    // ── FK 驗證：supplier_name ───────────
    if (body.supplier_name !== undefined && body.supplier_name !== null) {
      const supplier = db.prepare('SELECT name FROM supplier WHERE name = ?').get(body.supplier_name)
      if (!supplier) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: '找不到該供應商' },
          { status: 400 }
        )
      }
    }

    // ── 收集要更新的欄位（動態 SQL）──────
    const updates: string[] = []
    const values: (string | number | null)[] = []

    if (body.stock_qty !== undefined) {
      updates.push('stock_qty = ?')
      values.push(body.stock_qty)
    }
    if (body.safety_stock !== undefined) {
      updates.push('safety_stock = ?')
      values.push(body.safety_stock)
    }
    if (body.stock_unit !== undefined) {
      updates.push('stock_unit = ?')
      values.push(body.stock_unit.trim())
    }
    if (body.order_unit !== undefined) {
      updates.push('order_unit = ?')
      values.push(body.order_unit.trim())
    }
    if (body.qty_per_order_unit !== undefined) {
      updates.push('qty_per_order_unit = ?')
      values.push(body.qty_per_order_unit)
    }
    if (body.supplier_name !== undefined) {
      updates.push('supplier_name = ?')
      values.push(body.supplier_name === null ? null : body.supplier_name.trim())
    }

    if (updates.length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '沒有要更新的欄位' },
        { status: 400 }
      )
    }

    // ── 執行更新 ─────────────────────────
    values.push(params.name)
    db.prepare(`UPDATE ingredient SET ${updates.join(', ')} WHERE name = ?`)
      .run(...values)

    // ── 回傳更新後的完整物件 ──────────────
    const updated = db.prepare(`
      SELECT name, stock_qty, safety_stock, stock_unit,
             order_unit, qty_per_order_unit, supplier_name
      FROM ingredient WHERE name = ?
    `).get(params.name) as Ingredient

    return NextResponse.json<ApiResponse<Ingredient>>(
      { success: true, data: updated },
      { status: 200 }
    )

  } catch (err) {
    console.error('[PUT /api/ingredients/:name]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// DELETE /api/ingredients/:name — 刪除食材
// ============================================================
export async function DELETE(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const db = getDb()

    const existing = db.prepare('SELECT name FROM ingredient WHERE name = ?').get(params.name)
    if (!existing) {
      // idempotent：找不到也回 200
      return NextResponse.json<ApiResponse>({ success: true })
    }

    db.prepare('DELETE FROM ingredient WHERE name = ?').run(params.name)

    return NextResponse.json<ApiResponse>({ success: true })

  } catch (err) {
    console.error('[DELETE /api/ingredients/:name]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}