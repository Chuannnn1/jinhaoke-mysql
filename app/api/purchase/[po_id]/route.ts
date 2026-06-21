import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket, Pool } from 'mysql2/promise'

interface PurchaseOrder {
  採購單編號: number
  採購單日期: string
  供應商名稱: string
  進貨食材總成本: number
  採購單狀態: string
  items?: POItem[]
  returns?: ReturnRecord[]
}

interface POItem {
  食材名稱: string
  數量: number
  已退數量?: number
}

interface ReturnRecord {
  退貨單編號: number
  食材名稱: string
  退貨單日期: string
  退貨原因: string | null
  退貨數量: number
}

const ALLOWED_STATUS = ['未到貨', '已到貨', '已完成驗收', '已退貨'] as const

async function loadOrder(pool: Pool, poId: number): Promise<PurchaseOrder | null> {
  const [poRows] = await pool.execute<RowDataPacket[]>(
    'SELECT `採購單編號`, `採購單日期`, `供應商名稱`, `進貨食材總成本`, `採購單狀態` FROM `採購單` WHERE `採購單編號` = ?',
    [poId]
  )
  if (poRows.length === 0) return null
  const po = poRows[0] as unknown as PurchaseOrder

  const [itemRows] = await pool.execute<RowDataPacket[]>(
    'SELECT `食材名稱`, `數量` FROM `採購單明細` WHERE `採購單編號` = ?', [poId]
  )
  const [returnedSums] = await pool.execute<RowDataPacket[]>(
    'SELECT `食材名稱`, COALESCE(SUM(`退貨數量`), 0) AS s FROM `退貨單` WHERE `採購單編號` = ? GROUP BY `食材名稱`', [poId]
  )
  const byIng = new Map((returnedSums as Array<{ 食材名稱: string; s: number }>).map(r => [r.食材名稱, Number(r.s) || 0]))
  const items: POItem[] = (itemRows as Array<{ 食材名稱: string; 數量: number }>).map(it => ({
    食材名稱: it.食材名稱,
    數量: it.數量,
    已退數量: byIng.get(it.食材名稱) || 0,
  }))
  po.items = items

  const [returnRows] = await pool.execute<RowDataPacket[]>(
    'SELECT `退貨單編號`, `食材名稱`, `退貨單日期`, `退貨原因`, `退貨數量` FROM `退貨單` WHERE `採購單編號` = ? ORDER BY `退貨單日期` DESC, `退貨單編號` DESC',
    [poId]
  )
  po.returns = returnRows as unknown as ReturnRecord[]

  return po
}

// ============================================================
// GET /api/purchase/:po_id
// ============================================================
export async function GET(
  _req: Request,
  { params }: { params: { po_id: string } }
) {
  try {
    const pool = getPool()
    const poId = parseInt(params.po_id, 10)
    if (isNaN(poId)) {
      return NextResponse.json({ success: false, error: '無效的採購單 ID' }, { status: 400 })
    }
    const po = await loadOrder(pool, poId)
    if (!po) {
      return NextResponse.json({ success: false, error: '找不到該採購單' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: po })
  } catch (err) {
    console.error('[GET /api/purchase/:po_id]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}

// ============================================================
// PATCH /api/purchase/:po_id — 改狀態（含自動入庫）
// ============================================================
interface PatchBody {
  status?: '未到貨' | '已到貨' | '已完成驗收' | '已退貨'
}

export async function PATCH(
  req: Request,
  { params }: { params: { po_id: string } }
) {
  try {
    const pool = getPool()
    const poId = parseInt(params.po_id, 10)
    if (isNaN(poId)) {
      return NextResponse.json({ success: false, error: '無效的採購單 ID' }, { status: 400 })
    }

    const [prevRows] = await pool.execute<RowDataPacket[]>(
      'SELECT `採購單編號`, `採購單狀態` FROM `採購單` WHERE `採購單編號` = ?', [poId]
    )
    if (prevRows.length === 0) {
      return NextResponse.json({ success: false, error: '找不到該採購單' }, { status: 404 })
    }
    const prevStatus = (prevRows[0] as { 採購單狀態: string }).採購單狀態

    const body: PatchBody = await req.json()

    if (body.status !== undefined) {
      if (!ALLOWED_STATUS.includes(body.status)) {
        return NextResponse.json({ success: false, error: `非法狀態：${body.status}` }, { status: 400 })
      }
    }

    const enteringReceived = body.status === '已完成驗收' && prevStatus !== '已完成驗收'

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      if (body.status !== undefined) {
        await conn.execute(
          'UPDATE `採購單` SET `採購單狀態` = ? WHERE `採購單編號` = ?',
          [body.status, poId]
        )
      }

      // 進入「已完成驗收」→ 將明細數量（扣除已退量）加回食材庫存
      if (enteringReceived) {
        const [items] = await conn.execute<RowDataPacket[]>(
          'SELECT `食材名稱`, `數量` FROM `採購單明細` WHERE `採購單編號` = ?', [poId]
        )
        const [returnedSums] = await conn.execute<RowDataPacket[]>(
          'SELECT `食材名稱`, COALESCE(SUM(`退貨數量`), 0) AS s FROM `退貨單` WHERE `採購單編號` = ? GROUP BY `食材名稱`', [poId]
        )
        const byIng = new Map((returnedSums as Array<{ 食材名稱: string; s: number }>).map(r => [r.食材名稱, Number(r.s) || 0]))

        for (const it of items as Array<{ 食材名稱: string; 數量: number }>) {
          const returned = byIng.get(it.食材名稱) || 0
          const net = it.數量 - returned
          if (net > 0) {
            await conn.execute(
              'UPDATE `食材` SET `庫存數量` = `庫存數量` + ? WHERE `食材名稱` = ?',
              [net, it.食材名稱]
            )
          }
        }
      }

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    const updated = await loadOrder(pool, poId)
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error('[PATCH /api/purchase/:po_id]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}
