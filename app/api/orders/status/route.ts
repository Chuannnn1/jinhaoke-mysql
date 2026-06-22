import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { computeOrderConsumption, type OrderItemInput } from '@/lib/order-consumption'
import type { RowDataPacket } from 'mysql2/promise'

export const dynamic = 'force-dynamic'

const statusMap: Record<string, string> = {
  pending:          '待製作',
  preparing:        '製作中',
  awaiting_payment: '待付款',
  done:             '已完成',
  cancelled:        '已取消',
}

interface OrderItemRow extends RowDataPacket {
  餐點編號: number
  數量: number
  客製化: string | null
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()

    if (!body.order_id || !body.status) {
      return NextResponse.json({ success: false, error: '缺少 order_id 或 status' }, { status: 400 })
    }

    const dbStatus = statusMap[body.status] || body.status
    const pool = getPool()

    if (dbStatus !== '已完成') {
      await pool.execute(
        'UPDATE `訂單` SET `訂單狀態` = ? WHERE `訂單編號` = ?',
        [dbStatus, body.order_id]
      )
      return NextResponse.json({ success: true })
    }

    const [orderItems] = await pool.execute<OrderItemRow[]>(
      'SELECT `餐點編號`, `數量`, `客製化` FROM `訂單明細` WHERE `訂單編號` = ?',
      [body.order_id]
    )

    if (orderItems.length === 0) {
      console.warn(`[orders/status] order ${body.order_id} 沒有品項資料，僅更新狀態不扣庫存`)
      await pool.execute(
        'UPDATE `訂單` SET `訂單狀態` = ? WHERE `訂單編號` = ?',
        ['已完成', body.order_id]
      )
      return NextResponse.json({ success: true })
    }

    const items: OrderItemInput[] = orderItems.map(o => {
      let cust: string[][] = []
      try {
        const parsed = JSON.parse(o.客製化 ?? '[]')
        if (Array.isArray(parsed)) cust = parsed
      } catch { /* ignore */ }
      return { item_id: o.餐點編號, quantity: o.數量, customizations: cust }
    })

    const consumption = await computeOrderConsumption(items)

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      await conn.execute(
        'UPDATE `訂單` SET `訂單狀態` = ? WHERE `訂單編號` = ?',
        ['已完成', body.order_id]
      )

      for (const [ingName, qty] of consumption) {
        await conn.execute(
          'UPDATE `食材` SET `庫存數量` = ROUND(`庫存數量` - ?, 2) WHERE `食材名稱` = ?',
          [qty, ingName]
        )
      }

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/orders/status error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '伺服器錯誤' },
      { status: 500 }
    )
  }
}
