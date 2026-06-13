// app/api/inventory/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface InventoryRow {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
  order_unit: string
  qty_per_order_unit: number
  supplier_name: string | null
  order_block_threshold: number | null
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/inventory — 查詢全部食材庫存（檢視用，給後台庫存頁）
// ============================================================
export async function GET() {
  try {
    const db = getDb()
    const inventory = db.prepare(`
      SELECT
        i.name,
        i.stock_qty,
        i.safety_stock,
        i.stock_unit,
        i.order_unit,
        i.qty_per_order_unit,
        i.supplier_name,
        i.order_block_threshold
      FROM ingredient i
      ORDER BY i.name
    `).all() as InventoryRow[]

    return NextResponse.json<ApiResponse<InventoryRow[]>>(
      { success: true, data: inventory },
      { status: 200 }
    )
  } catch (err) {
    console.error('[GET /api/inventory]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}