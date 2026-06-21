import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

export const dynamic = 'force-dynamic'

interface Ingredient extends RowDataPacket {
  食材名稱: string
  庫存數量: number
  安全存量: number
  庫存單位: string
  供應商名稱: string | null
}

export async function GET() {
  try {
    const pool = getPool()
    const [rows] = await pool.execute<Ingredient[]>(
      'SELECT `食材名稱`, `庫存數量`, `安全存量`, `庫存單位`, `供應商名稱` FROM `食材` ORDER BY `食材名稱`'
    )
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    console.error('[GET /api/ingredients]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const pool = getPool()

    const name = (body.食材名稱 ?? body.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ success: false, error: '食材名稱為必填' }, { status: 400 })
    }

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT `食材名稱` FROM `食材` WHERE `食材名稱` = ?', [name]
    )
    if (existing.length > 0) {
      return NextResponse.json({ success: false, error: '食材名稱已存在' }, { status: 409 })
    }

    const stockQty = Number(body.庫存數量 ?? body.stock_qty ?? 0)
    const safetyStock = Number(body.安全存量 ?? body.safety_stock ?? 0)
    const stockUnit = (body.庫存單位 ?? body.stock_unit ?? '').trim()
    const supplierName = (body.供應商名稱 ?? body.supplier_name ?? null)?.trim() || null

    if (supplierName) {
      const [sup] = await pool.execute<RowDataPacket[]>(
        'SELECT `供應商名稱` FROM `供應商` WHERE `供應商名稱` = ?', [supplierName]
      )
      if (sup.length === 0) {
        return NextResponse.json({ success: false, error: '找不到該供應商' }, { status: 400 })
      }
    }

    await pool.execute(
      'INSERT INTO `食材` (`食材名稱`, `庫存數量`, `安全存量`, `庫存單位`, `供應商名稱`) VALUES (?, ?, ?, ?, ?)',
      [name, stockQty, safetyStock, stockUnit, supplierName]
    )

    const [rows] = await pool.execute<Ingredient[]>(
      'SELECT `食材名稱`, `庫存數量`, `安全存量`, `庫存單位`, `供應商名稱` FROM `食材` WHERE `食材名稱` = ?',
      [name]
    )

    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/ingredients]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}
