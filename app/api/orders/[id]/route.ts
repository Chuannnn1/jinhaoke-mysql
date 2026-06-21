import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

interface OrderRow extends RowDataPacket {
  訂單編號: string
  訂單日期: string
  訂單狀態: string
  顧客電話: string | null
  備註: string | null
}

interface ItemRow extends RowDataPacket {
  餐點編號: number
  餐點名稱: string
  數量: number
  餐點價格: number
  客製化: string | null
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const pool = getPool()

    const [orders] = await pool.execute<OrderRow[]>(
      'SELECT `訂單編號`, `訂單日期`, `訂單狀態`, `顧客電話`, `備註` FROM `訂單` WHERE `訂單編號` = ?',
      [params.id]
    )

    if (orders.length === 0) {
      return NextResponse.json(
        { success: false, error: '找不到該訂單' },
        { status: 404 }
      )
    }

    const order = orders[0]

    const [items] = await pool.execute<ItemRow[]>(
      `SELECT od.\`餐點編號\`, m.\`餐點名稱\`, od.\`數量\`, m.\`餐點價格\`, od.\`客製化\`
       FROM \`訂單明細\` od
       JOIN \`餐點\` m ON od.\`餐點編號\` = m.\`餐點編號\`
       WHERE od.\`訂單編號\` = ?`,
      [params.id]
    )

    const itemsData = items.map(it => ({
      item_id: it.餐點編號,
      name: it.餐點名稱,
      quantity: it.數量,
      unit_price: it.餐點價格,
      subtotal: it.餐點價格 * it.數量,
      customizations: (() => { try { return JSON.parse(it.客製化 ?? '[]') } catch { return [] } })(),
    }))

    const total = itemsData.reduce((sum, it) => sum + it.subtotal, 0)

    return NextResponse.json({
      success: true,
      data: {
        order_id: order.訂單編號,
        created_at: order.訂單日期,
        status: order.訂單狀態,
        customer_phone: order.顧客電話,
        note: order.備註,
        items: itemsData,
        total,
      },
    })
  } catch (err) {
    console.error('[GET /api/orders/:id]', err)
    return NextResponse.json(
      { success: false, error: '伺服器錯誤' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const pool = getPool()
    const body = await req.json()
    const note = body.note !== undefined ? (body.note || null) : undefined

    if (note === undefined) {
      return NextResponse.json({ success: false, error: '缺少 note 欄位' }, { status: 400 })
    }

    await pool.execute(
      'UPDATE `訂單` SET `備註` = ? WHERE `訂單編號` = ?',
      [note, params.id]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PATCH /api/orders/:id]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const pool = getPool()

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT `訂單編號`, `訂單狀態` FROM `訂單` WHERE `訂單編號` = ?',
      [params.id]
    )

    if (rows.length === 0) {
      return NextResponse.json({ success: true })
    }

    const order = rows[0] as { 訂單編號: string; 訂單狀態: string }

    if (order.訂單狀態 === '已完成') {
      return NextResponse.json(
        { success: false, error: '已完成之訂單無法取消，如需處理請聯絡管理員' },
        { status: 409 }
      )
    }

    if (order.訂單狀態 === '已取消') {
      return NextResponse.json({ success: true })
    }

    await pool.execute(
      'UPDATE `訂單` SET `訂單狀態` = ? WHERE `訂單編號` = ?',
      ['已取消', params.id]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/orders/:id]', err)
    return NextResponse.json(
      { success: false, error: '伺服器錯誤' },
      { status: 500 }
    )
  }
}
