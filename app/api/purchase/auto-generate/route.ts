import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise'

interface LowStockRow extends RowDataPacket {
  食材名稱: string
  庫存數量: number
  安全存量: number
  庫存單位: string
  供應商名稱: string | null
}

interface AutoGenResult {
  created_count: number
  created_orders: Array<{
    po_id: number
    supplier_name: string
    item_count: number
  }>
  covered_ingredients: string[]
  skipped_no_supplier: string[]
}

interface BodyItem {
  ingredient_name: string
  supplier_name: string
  order_qty: number
  total_cost?: number
}

export async function POST(req: Request) {
  try {
    const pool = getPool()

    let body: { items?: BodyItem[] } | null = null
    try {
      const text = await req.text()
      if (text && text.trim().length > 0) body = JSON.parse(text)
    } catch {
      return NextResponse.json(
        { success: false, error: 'body JSON 解析失敗' },
        { status: 400 }
      )
    }

    // 模式 A：手動指定
    if (body?.items && Array.isArray(body.items) && body.items.length > 0) {
      return handleManualMode(pool, body.items)
    }

    // 模式 B：自動掃低庫存
    const [lowStock] = await pool.execute<LowStockRow[]>(`
      SELECT \`食材名稱\`, \`庫存數量\`, \`安全存量\`, \`庫存單位\`, \`供應商名稱\`
      FROM \`食材\`
      WHERE \`安全存量\` > 0 AND \`庫存數量\` <= \`安全存量\`
      ORDER BY \`供應商名稱\`, \`食材名稱\`
    `)

    if (lowStock.length === 0) {
      return NextResponse.json({
        success: true,
        data: { created_count: 0, created_orders: [], covered_ingredients: [], skipped_no_supplier: [] },
      })
    }

    const bySupplier = new Map<string, LowStockRow[]>()
    const skipped: string[] = []
    for (const ing of lowStock) {
      if (!ing.供應商名稱) {
        skipped.push(ing.食材名稱)
        continue
      }
      const arr = bySupplier.get(ing.供應商名稱) ?? []
      arr.push(ing)
      bySupplier.set(ing.供應商名稱, arr)
    }

    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    const result: AutoGenResult = {
      created_count: 0,
      created_orders: [],
      covered_ingredients: [],
      skipped_no_supplier: skipped,
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      for (const [supplier, items] of bySupplier) {
        // 確認供應商存在
        const [supRows] = await conn.execute<RowDataPacket[]>(
          'SELECT `供應商名稱` FROM `供應商` WHERE `供應商名稱` = ?', [supplier]
        )
        if (supRows.length === 0) {
          for (const it of items) skipped.push(it.食材名稱)
          continue
        }

        const [poResult] = await conn.execute<ResultSetHeader>(
          'INSERT INTO `採購單` (`採購單日期`, `供應商名稱`, `進貨食材總成本`, `採購單狀態`) VALUES (?, ?, 0, ?)',
          [today, supplier, '未到貨']
        )
        const newPoId = poResult.insertId

        let itemCount = 0
        for (const ing of items) {
          const target = ing.安全存量 * 2
          const needed = Math.max(0, target - ing.庫存數量)
          const orderQty = Math.round(needed * 10) / 10
          if (orderQty <= 0) continue

          await conn.execute(
            'INSERT INTO `採購單明細` (`採購單編號`, `食材名稱`, `數量`) VALUES (?, ?, ?)',
            [newPoId, ing.食材名稱, orderQty]
          )
          result.covered_ingredients.push(ing.食材名稱)
          itemCount++
        }

        if (itemCount === 0) {
          await conn.execute('DELETE FROM `採購單` WHERE `採購單編號` = ?', [newPoId])
          continue
        }

        result.created_count++
        result.created_orders.push({ po_id: newPoId, supplier_name: supplier, item_count: itemCount })
      }

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    result.skipped_no_supplier = skipped
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error('[POST /api/purchase/auto-generate]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}

// ============================================================
// 模式 A：依使用者指定的 items 分組建單
// ============================================================
async function handleManualMode(pool: ReturnType<typeof getPool>, rawItems: BodyItem[]) {
  const cleaned: BodyItem[] = []
  for (const it of rawItems) {
    if (!it.ingredient_name?.trim() || !it.supplier_name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'items 每筆需含 ingredient_name + supplier_name' },
        { status: 400 }
      )
    }
    const qty = Number(it.order_qty)
    if (!Number.isFinite(qty) || qty <= 0) continue
    cleaned.push({
      ingredient_name: it.ingredient_name.trim(),
      supplier_name: it.supplier_name.trim(),
      order_qty: Math.round(qty * 10) / 10,
      total_cost: (it.total_cost && Number.isFinite(it.total_cost) && it.total_cost > 0)
        ? it.total_cost
        : undefined,
    })
  }
  if (cleaned.length === 0) {
    return NextResponse.json({
      success: true,
      data: { created_count: 0, created_orders: [], covered_ingredients: [], skipped_no_supplier: [] },
    })
  }

  // FK 驗證
  for (const it of cleaned) {
    const [ingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT `食材名稱` FROM `食材` WHERE `食材名稱` = ?', [it.ingredient_name]
    )
    if (ingRows.length === 0) {
      return NextResponse.json({ success: false, error: `找不到食材：${it.ingredient_name}` }, { status: 400 })
    }
    const [supRows] = await pool.execute<RowDataPacket[]>(
      'SELECT `供應商名稱` FROM `供應商` WHERE `供應商名稱` = ?', [it.supplier_name]
    )
    if (supRows.length === 0) {
      return NextResponse.json({ success: false, error: `找不到供應商：${it.supplier_name}` }, { status: 400 })
    }
  }

  const bySupplier = new Map<string, Map<string, { qty: number; userCost?: number }>>()
  for (const it of cleaned) {
    const m = bySupplier.get(it.supplier_name) ?? new Map<string, { qty: number; userCost?: number }>()
    const existing = m.get(it.ingredient_name)
    if (existing) {
      existing.qty += it.order_qty
      if (it.total_cost) existing.userCost = (existing.userCost ?? 0) + it.total_cost
    } else {
      m.set(it.ingredient_name, { qty: it.order_qty, userCost: it.total_cost })
    }
    bySupplier.set(it.supplier_name, m)
  }

  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
  const result: AutoGenResult = {
    created_count: 0,
    created_orders: [],
    covered_ingredients: [],
    skipped_no_supplier: [],
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    for (const [supplier, items] of bySupplier) {
      const [poResult] = await conn.execute<ResultSetHeader>(
        'INSERT INTO `採購單` (`採購單日期`, `供應商名稱`, `進貨食材總成本`, `採購單狀態`) VALUES (?, ?, 0, ?)',
        [today, supplier, '未到貨']
      )
      const newPoId = poResult.insertId

      let itemCount = 0
      let totalCost = 0
      for (const [ingName, { qty, userCost }] of items) {
        await conn.execute(
          'INSERT INTO `採購單明細` (`採購單編號`, `食材名稱`, `數量`) VALUES (?, ?, ?)',
          [newPoId, ingName, qty]
        )
        if (userCost) totalCost += userCost
        result.covered_ingredients.push(ingName)
        itemCount++
      }

      if (itemCount === 0) {
        await conn.execute('DELETE FROM `採購單` WHERE `採購單編號` = ?', [newPoId])
        continue
      }

      if (totalCost > 0) {
        await conn.execute('UPDATE `採購單` SET `進貨食材總成本` = ? WHERE `採購單編號` = ?', [totalCost, newPoId])
      }

      result.created_count++
      result.created_orders.push({ po_id: newPoId, supplier_name: supplier, item_count: itemCount })
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }

  return NextResponse.json({ success: true, data: result })
}
