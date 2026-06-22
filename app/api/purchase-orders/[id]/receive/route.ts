import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

// ============================================================
// POST /api/purchase-orders/:id/receive — 驗貨入庫
//
// 邏輯：
//   1. 確認採購單存在且狀態為「已下單」
//   2. 將 received_items 的數量加入食材庫存
//   3. 更新採購單狀態為「已到貨」
// ============================================================
interface ReceiveBody {
  received_items: Array<{
    ingredient_name: string
    received_qty: number
  }>
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body: ReceiveBody = await req.json()
    const pool = getPool()
    const poId = parseInt(params.id, 10)

    if (isNaN(poId)) {
      return NextResponse.json(
        { success: false, error: '無效的採購單編號' },
        { status: 400 }
      )
    }

    // 確認採購單存在
    const [poRows] = await pool.execute<RowDataPacket[]>(
      'SELECT `採購單編號`, `採購單狀態` FROM `採購單` WHERE `採購單編號` = ?',
      [poId]
    )
    if (poRows.length === 0) {
      return NextResponse.json(
        { success: false, error: '找不到該採購單' },
        { status: 404 }
      )
    }
    const po = poRows[0] as { 採購單編號: number; 採購單狀態: string }

    if (po.採購單狀態 === '已到貨') {
      return NextResponse.json(
        { success: false, error: '該採購單已驗貨完成，不可重複執行' },
        { status: 409 }
      )
    }
    if (po.採購單狀態 === '已取消') {
      return NextResponse.json(
        { success: false, error: '該採購單已取消' },
        { status: 409 }
      )
    }

    if (!body.received_items || body.received_items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'received_items 不可為空' },
        { status: 400 }
      )
    }

    // 驗證每項食材在採購單明細中存在
    for (const item of body.received_items) {
      if (typeof item.received_qty !== 'number' || item.received_qty < 0) {
        return NextResponse.json(
          { success: false, error: `${item.ingredient_name} 的 received_qty 需 >= 0` },
          { status: 400 }
        )
      }
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT `數量` FROM `採購單明細` WHERE `採購單編號` = ? AND `食材名稱` = ?',
        [poId, item.ingredient_name.trim()]
      )
      if (rows.length === 0) {
        return NextResponse.json(
          { success: false, error: `採購單中找不到食材：${item.ingredient_name}` },
          { status: 400 }
        )
      }
    }

    // Transaction：入庫 + 更新狀態
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      for (const item of body.received_items) {
        if (item.received_qty > 0) {
          await conn.execute(
            'UPDATE `食材` SET `庫存數量` = ROUND(`庫存數量` + ?, 2) WHERE `食材名稱` = ?',
            [item.received_qty, item.ingredient_name.trim()]
          )
        }
      }

      await conn.execute(
        'UPDATE `採購單` SET `採購單狀態` = ? WHERE `採購單編號` = ?',
        ['已到貨', poId]
      )

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/purchase-orders/:id/receive]', err)
    return NextResponse.json(
      { success: false, error: '伺服器錯誤' },
      { status: 500 }
    )
  }
}
