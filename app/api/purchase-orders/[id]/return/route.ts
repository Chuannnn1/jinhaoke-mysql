import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

// POST /api/purchase-orders/:id/return — 登錄退貨
// 退貨發生在「已到貨」狀態（驗收入庫前），不影響庫存
// 全數退完自動轉「已退貨」
interface ReturnBody {
  ingredient_name: string
  return_qty: number
  return_reason?: string
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body: ReturnBody = await req.json()
    const pool = getPool()
    const poId = parseInt(params.id, 10)

    if (isNaN(poId)) {
      return NextResponse.json(
        { success: false, error: '無效的採購單編號' },
        { status: 400 }
      )
    }

    if (!body.ingredient_name || body.return_qty === undefined) {
      return NextResponse.json(
        { success: false, error: 'ingredient_name 和 return_qty 為必填' },
        { status: 400 }
      )
    }
    if (typeof body.return_qty !== 'number' || body.return_qty <= 0) {
      return NextResponse.json(
        { success: false, error: 'return_qty 需為正數' },
        { status: 400 }
      )
    }

    const ingName = body.ingredient_name.trim()

    // 採購單存在
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

    // 食材在採購單明細
    const [poItemRows] = await pool.execute<RowDataPacket[]>(
      'SELECT `數量` FROM `採購單明細` WHERE `採購單編號` = ? AND `食材名稱` = ?',
      [poId, ingName]
    )
    if (poItemRows.length === 0) {
      return NextResponse.json(
        { success: false, error: '該採購單中沒有此食材' },
        { status: 400 }
      )
    }
    const orderQty = Number(poItemRows[0].數量)

    // 累計已退數量
    const [aggRows] = await pool.execute<RowDataPacket[]>(
      'SELECT COALESCE(SUM(`退貨數量`), 0) AS total FROM `退貨單` WHERE `採購單編號` = ? AND `食材名稱` = ?',
      [poId, ingName]
    )
    const alreadyReturned = Number((aggRows[0] as { total: number }).total)
    const remaining = orderQty - alreadyReturned

    if (remaining <= 0) {
      return NextResponse.json(
        { success: false, error: `${ingName} 已全數退貨（${alreadyReturned}/${orderQty}），無法再退` },
        { status: 400 }
      )
    }
    if (body.return_qty > remaining) {
      return NextResponse.json(
        { success: false, error: `${ingName} 可退數量為 ${remaining}（已退 ${alreadyReturned}/${orderQty}），不能退 ${body.return_qty}` },
        { status: 400 }
      )
    }

    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      await conn.execute(
        'INSERT INTO `退貨單` (`採購單編號`, `食材名稱`, `退貨單日期`, `退貨原因`, `退貨數量`) VALUES (?, ?, ?, ?, ?)',
        [poId, ingName, today, body.return_reason?.trim() || null, body.return_qty]
      )

      // 檢查是否全部退完 → 自動轉 已退貨
      const [allItems] = await conn.execute<RowDataPacket[]>(
        'SELECT `食材名稱`, `數量` FROM `採購單明細` WHERE `採購單編號` = ?', [poId]
      )
      const [allReturns] = await conn.execute<RowDataPacket[]>(
        'SELECT `食材名稱`, COALESCE(SUM(`退貨數量`), 0) AS s FROM `退貨單` WHERE `採購單編號` = ? GROUP BY `食材名稱`', [poId]
      )
      const returnMap = new Map((allReturns as Array<{ 食材名稱: string; s: number }>).map(r => [r.食材名稱, Number(r.s)]))
      const fullyReturned = (allItems as Array<{ 食材名稱: string; 數量: number }>).every(
        it => (returnMap.get(it.食材名稱) || 0) >= it.數量
      )
      if (fullyReturned) {
        await conn.execute('UPDATE `採購單` SET `採購單狀態` = ? WHERE `採購單編號` = ?', ['已退貨', poId])
      }

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/purchase-orders/:id/return]', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '伺服器錯誤' },
      { status: 500 }
    )
  }
}
