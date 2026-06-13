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
  order_block_threshold: number | null
}

interface UpdateInventoryBody {
  stock_qty: number
  note?: string
}

interface PatchInventoryBody {
  supplier_name?: string | null
  safety_stock?: number
  order_block_threshold?: number | null
  stock_qty?: number
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

const SELECT_INVENTORY_SQL = [
  'SELECT',
  '  i.name, i.stock_qty, i.safety_stock, i.stock_unit,',
  '  i.order_unit, i.qty_per_order_unit, i.supplier_name, i.order_block_threshold',
  'FROM ingredient i WHERE i.name = ?',
].join(' ')

// GET /api/inventory/:name
export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const db = getDb()
    const name = decodeURIComponent(params.name)
    const row = db.prepare(SELECT_INVENTORY_SQL).get(name) as InventoryRow | undefined

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

// PUT /api/inventory/:name — 維持舊行為：只調整 stock_qty
export async function PUT(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const body: UpdateInventoryBody = await req.json()
    const db = getDb()
    const name = decodeURIComponent(params.name)

    if (body.stock_qty === undefined || typeof body.stock_qty !== 'number' || body.stock_qty < 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'stock_qty 為必填，且需為 >= 0 的數字' },
        { status: 400 }
      )
    }

    const existing = db.prepare('SELECT name FROM ingredient WHERE name = ?').get(name)
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該食材' },
        { status: 404 }
      )
    }

    db.prepare('UPDATE ingredient SET stock_qty = ? WHERE name = ?')
      .run(body.stock_qty, name)

    return NextResponse.json<ApiResponse>({ success: true })
  } catch (err) {
    console.error('[PUT /api/inventory/:name]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// PATCH /api/inventory/:name — 部分更新（supplier / safety / block / stock）
export async function PATCH(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const body: PatchInventoryBody = await req.json()
    const db = getDb()
    const name = decodeURIComponent(params.name)

    const existing = db.prepare('SELECT name FROM ingredient WHERE name = ?').get(name)
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該食材' },
        { status: 404 }
      )
    }

    const sets: string[] = []
    const values: (string | number | null)[] = []

    if (Object.prototype.hasOwnProperty.call(body, 'supplier_name')) {
      const v = body.supplier_name
      if (v !== null && typeof v !== 'string') {
        return NextResponse.json<ApiResponse>(
          { success: false, error: 'supplier_name 必須為字串或 null' },
          { status: 400 }
        )
      }
      const normalized = v === null ? null : (v.trim() === '' ? null : v.trim())
      if (normalized !== null) {
        const s = db.prepare('SELECT name FROM supplier WHERE name = ?').get(normalized)
        if (!s) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: '找不到該供應商' },
            { status: 400 }
          )
        }
      }
      sets.push('supplier_name = ?')
      values.push(normalized)
    }

    if (Object.prototype.hasOwnProperty.call(body, 'safety_stock')) {
      if (typeof body.safety_stock !== 'number' || body.safety_stock < 0 || !Number.isFinite(body.safety_stock)) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: 'safety_stock 必須為 >= 0 的數字' },
          { status: 400 }
        )
      }
      sets.push('safety_stock = ?')
      values.push(body.safety_stock)
    }

    if (Object.prototype.hasOwnProperty.call(body, 'order_block_threshold')) {
      const v = body.order_block_threshold
      if (v !== null) {
        if (typeof v !== 'number' || v < 0 || !Number.isFinite(v)) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: 'order_block_threshold 必須為 >= 0 的數字或 null' },
            { status: 400 }
          )
        }
      }
      sets.push('order_block_threshold = ?')
      values.push(v)
    }

    if (Object.prototype.hasOwnProperty.call(body, 'stock_qty')) {
      if (typeof body.stock_qty !== 'number' || body.stock_qty < 0 || !Number.isFinite(body.stock_qty)) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: 'stock_qty 必須為 >= 0 的數字' },
          { status: 400 }
        )
      }
      sets.push('stock_qty = ?')
      values.push(body.stock_qty)
    }

    if (sets.length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '無可更新的欄位' },
        { status: 400 }
      )
    }

    values.push(name)
    db.prepare(`UPDATE ingredient SET ${sets.join(', ')} WHERE name = ?`).run(...values)

    const updated = db.prepare(SELECT_INVENTORY_SQL).get(name) as InventoryRow
    return NextResponse.json<ApiResponse<InventoryRow>>({ success: true, data: updated })
  } catch (err) {
    console.error('[PATCH /api/inventory/:name]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}
