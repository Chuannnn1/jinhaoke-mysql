import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { computeAvailability } from '@/lib/availability'
import { computeOrderConsumption, findInsufficientIngredients } from '@/lib/order-consumption'
import type { RowDataPacket } from 'mysql2/promise'

export const dynamic = 'force-dynamic'

// ============================================================
// 型別定義
// ============================================================
interface OrderJoinRow extends RowDataPacket {
  訂單編號: string
  訂單狀態: string
  訂單日期: string
  備註: string | null
  顧客電話: string | null
  餐點編號: number | null
  數量: number | null
  餐點名稱: string | null
  餐點價格: number | null
  客製化: string | null
  客製化屬性: string | null
}

interface AddonChoice {
  id: string
  label: string
  price: number
}

interface OrderItem {
  item_id: number
  name: string
  quantity: number
  unit_price: number
  subtotal: number
  customizations: string[][]
  customizations_amount: number
  customizations_detail?: AddonChoice[][]
}

interface GroupedOrder {
  order_id: string
  customer_phone: string | null
  status: string
  created_at: string
  note: string | null
  items: OrderItem[]
  total: number
}

// ============================================================
// GET /api/orders — 取得全部訂單
// ============================================================
export async function GET(request: Request) {
  try {
    const pool = getPool()
    const { searchParams } = new URL(request.url)
    const allDays = searchParams.get('all') === '1'

    let dateFilter = ''
    const params: string[] = []
    if (!allDays) {
      const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
      dateFilter = 'WHERE DATE(o.`訂單日期`) = ?'
      params.push(today)
    }

    const [rows] = await pool.execute<OrderJoinRow[]>(`
      SELECT
        o.\`訂單編號\`,
        o.\`訂單狀態\`,
        o.\`訂單日期\`,
        o.\`備註\`,
        o.\`顧客電話\`,
        od.\`餐點編號\`,
        od.\`數量\`,
        od.\`客製化\`,
        m.\`餐點名稱\`,
        m.\`餐點價格\`,
        m.\`客製化屬性\`
      FROM \`訂單\` o
      LEFT JOIN \`訂單明細\` od ON o.\`訂單編號\` = od.\`訂單編號\`
      LEFT JOIN \`餐點\` m ON od.\`餐點編號\` = m.\`餐點編號\`
      ${dateFilter}
      ORDER BY o.\`訂單日期\` DESC
    `, params)

    const grouped: Record<string, GroupedOrder> = {}
    for (const row of rows) {
      if (!grouped[row.訂單編號]) {
        grouped[row.訂單編號] = {
          order_id: row.訂單編號,
          customer_phone: row.顧客電話 ?? null,
          status: row.訂單狀態,
          created_at: row.訂單日期,
          note: row.備註 ?? null,
          items: [],
          total: 0,
        }
      }
      if (row.餐點編號 !== null && row.餐點價格 !== null) {
        let customizations: string[][] = []
        try {
          const parsed = JSON.parse(row.客製化 ?? '[]')
          if (Array.isArray(parsed)) customizations = parsed
        } catch { /* ignore */ }

        let menuAddons: AddonChoice[] = []
        try {
          const parsed = JSON.parse(row.客製化屬性 ?? '[]')
          if (Array.isArray(parsed)) menuAddons = parsed
        } catch { /* ignore */ }

        const addonMap = new Map(menuAddons.map(a => [a.id, a]))
        const detail: AddonChoice[][] = customizations.map(unit =>
          (Array.isArray(unit) ? unit : [])
            .map(id => addonMap.get(id))
            .filter((a): a is AddonChoice => !!a)
        )

        let addonTotal = 0
        for (const unit of detail) {
          for (const a of unit) addonTotal += a.price
        }

        const baseSubtotal = row.餐點價格 * row.數量!
        const subtotal = baseSubtotal + addonTotal

        grouped[row.訂單編號].items.push({
          item_id: row.餐點編號,
          name: row.餐點名稱!,
          quantity: row.數量!,
          unit_price: row.餐點價格,
          subtotal,
          customizations,
          customizations_amount: addonTotal,
          customizations_detail: detail.length > 0 ? detail : undefined,
        })
        grouped[row.訂單編號].total += subtotal
      }
    }

    return NextResponse.json({ success: true, data: Object.values(grouped) })
  } catch (error) {
    console.error('GET /api/orders error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/orders — 前台送出訂單
// ============================================================
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { customer_phone, note, items } = body

    const phoneTrim = (typeof customer_phone === 'string' ? customer_phone : '').trim()
    const noteTrim = (typeof note === 'string' ? note : '').trim()

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '購物車是空的' },
        { status: 400 }
      )
    }

    // 預檢可售性
    const availability = await computeAvailability()
    const availMap = new Map(availability.map(a => [a.item_id, a]))
    const blockedNames: string[] = []
    for (const item of items) {
      const a = availMap.get(item.item_id)
      if (a && a.blocked) blockedNames.push(a.name)
    }
    if (blockedNames.length > 0) {
      return NextResponse.json(
        { success: false, error: `品項已售完：${blockedNames.join(', ')}` },
        { status: 400 }
      )
    }

    // 算食材總需求，檢查庫存是否足夠
    const cartItems = items.map((it: { item_id: number; quantity: number; customizations?: string[][] }) => ({
      item_id: Number(it.item_id),
      quantity: Number(it.quantity),
      customizations: Array.isArray(it.customizations) ? it.customizations : [],
    }))
    const cartConsumption = await computeOrderConsumption(cartItems)
    const insufficient = await findInsufficientIngredients(cartConsumption)
    if (insufficient.length > 0) {
      const msg = insufficient
        .map(i => `${i.ingredient_name} 需 ${i.needed.toFixed(2)} / 庫存 ${i.in_stock.toFixed(2)}`)
        .join('；')
      return NextResponse.json(
        { success: false, error: `庫存不足：${msg}` },
        { status: 400 }
      )
    }

    // 產生訂單編號：A + YYYYMMDD + 4 碼當日流水
    const now = new Date(Date.now() + 8 * 3600 * 1000)
    const isoDate = now.toISOString().slice(0, 10)
    const compact = isoDate.replace(/-/g, '')
    const prefix = `A${compact}`
    const datetimeStr = now.toISOString().slice(0, 19).replace('T', ' ')

    const pool = getPool()

    // 查 menu 價格 + addons（驗證用）
    const menuIds = items.map((it: { item_id: number }) => Number(it.item_id))
    const menuPlaceholders = menuIds.map(() => '?').join(',')
    const [menuRows] = await pool.execute<RowDataPacket[]>(
      `SELECT \`餐點編號\`, \`餐點價格\`, \`客製化屬性\` FROM \`餐點\` WHERE \`餐點編號\` IN (${menuPlaceholders})`,
      menuIds
    )
    const menuMap = new Map(menuRows.map(r => [r.餐點編號 as number, r as { 餐點編號: number; 餐點價格: number; 客製化屬性: string }]))

    // Transaction
    const conn = await pool.getConnection()
    let orderId = ''
    try {
      await conn.beginTransaction()

      // 查流水號
      const [lastRows] = await conn.execute<RowDataPacket[]>(
        'SELECT `訂單編號` FROM `訂單` WHERE `訂單編號` LIKE ? ORDER BY `訂單編號` DESC LIMIT 1',
        [`${prefix}%`]
      )
      const last = lastRows[0] as { 訂單編號: string } | undefined
      const nextSeq = last ? parseInt(last.訂單編號.slice(-4), 10) + 1 : 1
      orderId = `${prefix}${String(nextSeq).padStart(4, '0')}`

      // INSERT 訂單
      await conn.execute(
        'INSERT INTO `訂單` (`訂單編號`, `訂單日期`, `訂單狀態`, `顧客電話`, `備註`) VALUES (?, ?, ?, ?, ?)',
        [orderId, datetimeStr, '待製作', phoneTrim || null, noteTrim || null]
      )

      // INSERT 訂單明細
      for (const item of items) {
        const itemId = item?.item_id
        const quantity = Number(item?.quantity)
        if (itemId === undefined || itemId === null) {
          throw new Error('品項缺少 item_id')
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`品項 ${itemId} 數量無效`)
        }
        const menuItem = menuMap.get(Number(itemId))
        if (!menuItem) {
          throw new Error(`找不到品項 ${itemId}`)
        }

        let menuAddons: { id: string; label: string; price: number }[] = []
        try {
          const parsed = JSON.parse(menuItem.客製化屬性 ?? '[]')
          if (Array.isArray(parsed)) menuAddons = parsed
        } catch { /* ignore */ }
        const addonMap = new Map(menuAddons.map(a => [a.id, a]))

        // 驗證 customizations
        const rawCust = Array.isArray(item?.customizations) ? item.customizations : []
        if (rawCust.length > 0 && rawCust.length !== quantity) {
          throw new Error(`品項 ${itemId} customizations 長度 ${rawCust.length} 不等於 quantity ${quantity}`)
        }
        const normalized: string[][] = rawCust.map((unit: unknown, idx: number) => {
          if (!Array.isArray(unit)) {
            throw new Error(`品項 ${itemId} 客製化第 ${idx + 1} 份格式錯誤`)
          }
          const ids: string[] = []
          for (const a of unit) {
            const addonId = String(a)
            if (!addonMap.has(addonId)) {
              throw new Error(`品項 ${itemId} 不支援 addon: ${addonId}`)
            }
            ids.push(addonId)
          }
          return ids
        })

        await conn.execute(
          'INSERT INTO `訂單明細` (`訂單編號`, `餐點編號`, `數量`, `客製化`) VALUES (?, ?, ?, ?)',
          [orderId, itemId, quantity, JSON.stringify(normalized)]
        )
      }

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    return NextResponse.json(
      { success: true, data: { order_id: orderId } },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/orders error:', error)
    const msg = error instanceof Error ? error.message : '未知錯誤'
    const isClientError =
      msg.startsWith('找不到品項') ||
      msg.startsWith('品項缺少') ||
      msg.includes('數量無效') ||
      msg.includes('customizations') ||
      msg.includes('客製化') ||
      msg.includes('不支援 addon')
    return NextResponse.json(
      { success: false, error: msg },
      { status: isClientError ? 400 : 500 }
    )
  }
}
