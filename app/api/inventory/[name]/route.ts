// app/api/inventory/[name]/route.ts
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
}

interface UpdateInventoryBody {
  stock_qty: number
  note?: string
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// GET /api/inventory/:name
export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const db = getDb()
    const sql = [
      'SELECT',
      '  i.name, i.stock_qty, i.safety_stock, i.stock_unit,',
      '  i.order_unit, i.qty_per_order_unit, i.supplier_name',
      'FROM ingredient i WHERE i.name = ?',
    ].join(' ')
    const row = db.prepare(sql).get(params.name) as InventoryRow | undefined

    if (!row) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該食材' },
        { status: 404 }
      )
    }

    return NextResponse.json<ApiResponse<InventoryRow>>({ success: true, data: row })
  } catch (err) {
    console.error('[GET /api/inventory/:name]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// PUT /api/inventory/:name
export async function PUT(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const body: UpdateInventoryBody = await req.json()
    const db = getDb()

    if (body.stock_qty === undefined || typeof body.stock_qty !== 'number' || body.stock_qty < 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'stock_qty 為必填，且需為 >= 0 的數字' },
        { status: 400 }
      )
    }

    const existing = db.prepare('SELECT name FROM ingredient WHERE name = ?').get(params.name)
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該食材' },
        { status: 404 }
      )
    }

    db.prepare('UPDATE ingredient SET stock_qty = ? WHERE name = ?')
      .run(body.stock_qty, params.name)

    return NextResponse.json<ApiResponse>({ success: true })
  } catch (err) {
    console.error('[PUT /api/inventory/:name]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}
