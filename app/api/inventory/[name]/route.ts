import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

interface IngredientRow extends RowDataPacket {
  食材名稱: string
  庫存數量: number
  安全存量: number
  庫存單位: string
  供應商名稱: string | null
}

// GET /api/inventory/:name
export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const pool = getPool()
    const name = decodeURIComponent(params.name)

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT `食材名稱` AS name, `庫存數量` AS stock_qty, `安全存量` AS safety_stock, `庫存單位` AS stock_unit, `供應商名稱` AS supplier_name FROM `食材` WHERE `食材名稱` = ?',
      [name]
    )
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: '找不到該食材' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[GET /api/inventory/:name]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}

// PUT /api/inventory/:name — 修改庫存數量
export async function PUT(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const body = await req.json()
    const pool = getPool()
    const name = decodeURIComponent(params.name)

    if (body.stock_qty === undefined || typeof body.stock_qty !== 'number' || body.stock_qty < 0) {
      return NextResponse.json(
        { success: false, error: 'stock_qty 為必填，且需 >= 0' },
        { status: 400 }
      )
    }

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT `食材名稱` FROM `食材` WHERE `食材名稱` = ?', [name]
    )
    if (existing.length === 0) {
      return NextResponse.json({ success: false, error: '找不到該食材' }, { status: 404 })
    }

    await pool.execute(
      'UPDATE `食材` SET `庫存數量` = ? WHERE `食材名稱` = ?',
      [body.stock_qty, name]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/inventory/:name]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}

// PATCH /api/inventory/:name — 部分更新
export async function PATCH(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const body = await req.json()
    const pool = getPool()
    const name = decodeURIComponent(params.name)

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT `食材名稱` FROM `食材` WHERE `食材名稱` = ?', [name]
    )
    if (existing.length === 0) {
      return NextResponse.json({ success: false, error: '找不到該食材' }, { status: 404 })
    }

    const sets: string[] = []
    const values: (string | number | null)[] = []

    if (Object.prototype.hasOwnProperty.call(body, 'supplier_name')) {
      const v = body.supplier_name
      const normalized = (v === null || v === '') ? null : String(v).trim()
      if (normalized !== null) {
        const [s] = await pool.execute<RowDataPacket[]>(
          'SELECT `供應商名稱` FROM `供應商` WHERE `供應商名稱` = ?', [normalized]
        )
        if (s.length === 0) {
          return NextResponse.json({ success: false, error: '找不到該供應商' }, { status: 400 })
        }
      }
      sets.push('`供應商名稱` = ?')
      values.push(normalized)
    }

    if (Object.prototype.hasOwnProperty.call(body, 'safety_stock')) {
      if (typeof body.safety_stock !== 'number' || body.safety_stock < 0) {
        return NextResponse.json({ success: false, error: '安全存量需 >= 0' }, { status: 400 })
      }
      sets.push('`安全存量` = ?')
      values.push(body.safety_stock)
    }

    if (Object.prototype.hasOwnProperty.call(body, 'stock_qty')) {
      if (typeof body.stock_qty !== 'number' || body.stock_qty < 0) {
        return NextResponse.json({ success: false, error: '庫存數量需 >= 0' }, { status: 400 })
      }
      sets.push('`庫存數量` = ?')
      values.push(body.stock_qty)
    }

    if (sets.length === 0) {
      return NextResponse.json({ success: false, error: '無可更新的欄位' }, { status: 400 })
    }

    values.push(name)
    await pool.execute(
      `UPDATE \`食材\` SET ${sets.join(', ')} WHERE \`食材名稱\` = ?`,
      values
    )

    const [updated] = await pool.execute<RowDataPacket[]>(
      'SELECT `食材名稱` AS name, `庫存數量` AS stock_qty, `安全存量` AS safety_stock, `庫存單位` AS stock_unit, `供應商名稱` AS supplier_name FROM `食材` WHERE `食材名稱` = ?',
      [name]
    )

    return NextResponse.json({ success: true, data: updated[0] })
  } catch (err) {
    console.error('[PATCH /api/inventory/:name]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}
