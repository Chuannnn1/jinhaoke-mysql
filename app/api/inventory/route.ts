import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

interface IngredientRow extends RowDataPacket {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
  supplier_name: string | null
}

// GET /api/inventory
export async function GET() {
  try {
    const pool = getPool()
    const [rows] = await pool.execute<IngredientRow[]>(`
      SELECT
        \`食材名稱\` AS name,
        \`庫存數量\` AS stock_qty,
        \`安全存量\` AS safety_stock,
        \`庫存單位\` AS stock_unit,
        \`供應商名稱\` AS supplier_name
      FROM \`食材\`
      ORDER BY \`食材名稱\`
    `)
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    console.error('[GET /api/inventory]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}
