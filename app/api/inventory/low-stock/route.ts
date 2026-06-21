import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

interface LowStockRow extends RowDataPacket {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
  supplier_name: string | null
}

export async function GET() {
  try {
    const pool = getPool()

    const [rows] = await pool.execute<LowStockRow[]>(`
      SELECT
        \`食材名稱\` AS name,
        \`庫存數量\` AS stock_qty,
        \`安全存量\` AS safety_stock,
        \`庫存單位\` AS stock_unit,
        \`供應商名稱\` AS supplier_name
      FROM \`食材\`
      WHERE \`安全存量\` > 0 AND \`庫存數量\` <= \`安全存量\`
      ORDER BY (\`庫存數量\` / NULLIF(\`安全存量\`, 0)) ASC, \`食材名稱\`
    `)

    const data = rows.map(it => {
      const target = it.safety_stock * 2
      const needed = Math.max(0, target - it.stock_qty)
      return {
        name: it.name,
        stock_qty: it.stock_qty,
        safety_stock: it.safety_stock,
        stock_unit: it.stock_unit,
        suggested_qty: Math.round(needed * 10) / 10,
        default_supplier: it.supplier_name,
        suppliers: it.supplier_name
          ? [{ supplier_name: it.supplier_name, is_primary: 1, price_per_order_unit: null }]
          : [],
      }
    })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/inventory/low-stock]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}
