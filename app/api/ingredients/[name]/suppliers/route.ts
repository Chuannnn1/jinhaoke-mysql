// app/api/ingredients/[name]/suppliers/route.ts
// ============================================================
// GET /api/ingredients/:name/suppliers
//   回傳這個食材可以叫貨的所有廠商（含 primary 標示與單價）。
//   若 ingredient_supplier 沒資料，fallback 回 ingredient.supplier_name 那一家。
// ============================================================
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface SupplierOption {
  supplier_name: string
  is_primary: number
  price_per_order_unit: number | null
  phone: string | null
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const db = getDb()
    const name = decodeURIComponent(params.name)

    const ing = db
      .prepare('SELECT name, supplier_name FROM ingredient WHERE name = ?')
      .get(name) as { name: string; supplier_name: string | null } | undefined
    if (!ing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該食材' },
        { status: 404 }
      )
    }

    const rows = db.prepare(`
      SELECT s.supplier_name, s.is_primary, s.price_per_order_unit, sup.phone
      FROM ingredient_supplier s
      JOIN supplier sup ON sup.name = s.supplier_name
      WHERE s.ingredient_name = ?
      ORDER BY s.is_primary DESC, s.supplier_name
    `).all(name) as SupplierOption[]

    // Fallback：M:N 表還沒填的舊資料，至少回傳 ingredient.supplier_name
    if (rows.length === 0 && ing.supplier_name) {
      const sup = db
        .prepare('SELECT name, phone FROM supplier WHERE name = ?')
        .get(ing.supplier_name) as { name: string; phone: string | null } | undefined
      if (sup) {
        rows.push({
          supplier_name: sup.name,
          is_primary: 1,
          price_per_order_unit: null,
          phone: sup.phone,
        })
      }
    }

    return NextResponse.json<ApiResponse<SupplierOption[]>>({ success: true, data: rows })
  } catch (err) {
    console.error('[GET /api/ingredients/:name/suppliers]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}
