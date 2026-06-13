// app/api/purchase-orders/[id]/route.ts
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
// GET /api/purchase-orders/:id — 查詢單一進貨單（含明細）
// ============================================================
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb()
    const poId = parseInt(params.id, 10)
    if (isNaN(poId)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '無效的進貨單 ID' },
        { status: 400 }
      )
    }

    const po = db.prepare(
      'SELECT po_id, po_date, supplier_name, total_amount, status FROM purchase_order WHERE po_id = ?'
    ).get(poId) as PurchaseOrder | undefined

    if (!po) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該進貨單' },
        { status: 404 }
      )
    }

    const items = db.prepare(
      'SELECT ingredient_name, order_qty, total_cost FROM purchase_order_item WHERE po_id = ?'
    ).all(poId) as PurchaseOrderItem[]
    po.items = items

    return NextResponse.json<ApiResponse<PurchaseOrder>>(
      { success: true, data: po },
      { status: 200 }
    )
  } catch (err) {
    console.error('[GET /api/purchase-orders/:id]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}