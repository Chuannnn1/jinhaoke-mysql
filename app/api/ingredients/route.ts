// app/api/ingredients/route.ts
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

interface CreateIngredientBody {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
  order_unit: string
  qty_per_order_unit: number
  supplier_name?: string
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/ingredients — 查詢全部食材
// ============================================================
export async function GET() {
  try {
    const db = getDb()
    const ingredients = db.prepare(`
      SELECT name, stock_qty, safety_stock, stock_unit,
             order_unit, qty_per_order_unit, supplier_name
      FROM ingredient
      ORDER BY name
    `).all() as Ingredient[]

    return NextResponse.json<ApiResponse<Ingredient[]>>(
      { success: true, data: ingredients },
      { status: 200 }
    )
  } catch (err) {
    console.error('[GET /api/ingredients]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/ingredients — 新增食材（PK 是 name，不能重複）
// ============================================================
export async function POST(req: Request) {
  try {
    const body: CreateIngredientBody = await req.json()
    const db = getDb()

    // ── 必填欄位驗證 ────────────────────
    const required = ['name', 'stock_qty', 'safety_stock', 'stock_unit', 'order_unit', 'qty_per_order_unit']
    for (const field of required) {
      if (body[field as keyof CreateIngredientBody] === undefined) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `${field} 為必填欄位` },
          { status: 400 }
        )
      }
    }

    if (body.name.trim() === '') {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '食材名稱不能為空' },
        { status: 400 }
      )
    }

    // ── PK 重複檢查 ─────────────────────
    const existing = db.prepare('SELECT name FROM ingredient WHERE name = ?').get(body.name.trim())
    if (existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '食材名稱已存在' },
        { status: 409 }
      )
    }

    // ── FK 驗證：supplier_name 存在？ ───
    if (body.supplier_name) {
      const supplier = db.prepare('SELECT name FROM supplier WHERE name = ?').get(body.supplier_name)
      if (!supplier) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: '找不到該供應商' },
          { status: 400 }
        )
      }
    }

    // ── 寫入 ────────────────────────────
    db.prepare(`
      INSERT INTO ingredient (name, stock_qty, safety_stock, stock_unit, order_unit, qty_per_order_unit, supplier_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.name.trim(),
      body.stock_qty,
      body.safety_stock,
      body.stock_unit.trim(),
      body.order_unit.trim(),
      body.qty_per_order_unit,
      body.supplier_name?.trim() ?? null
    )

    // ── 回傳新建的完整物件 ────────────────
    const newIngredient = db.prepare(`
      SELECT name, stock_qty, safety_stock, stock_unit,
             order_unit, qty_per_order_unit, supplier_name
      FROM ingredient WHERE name = ?
    `).get(body.name.trim()) as Ingredient

    return NextResponse.json<ApiResponse<Ingredient>>(
      { success: true, data: newIngredient },
      { status: 201 }
    )

  } catch (err) {
    console.error('[POST /api/ingredients]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}