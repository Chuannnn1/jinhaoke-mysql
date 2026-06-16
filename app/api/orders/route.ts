import { getDb } from '@/lib/db'
import { computeAvailability } from '@/lib/availability'
import { NextResponse } from 'next/server'

// ============================================================
// 型別定義
// ============================================================
interface OrderRow {
  order_id: string
  status: string
  created_at: string
  item_id: number | null
  quantity: number | null
  item_name: string | null
  price: number | null
  customizations: string | null            // JSON string
  customizations_amount: number | null
  menu_addons: string | null               // menu_item.addons JSON
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
  subtotal: number                         // (unit_price * qty) + customizations_amount
  customizations: string[][]               // 每份的 addon id 列表
  customizations_amount: number
  customizations_detail?: AddonChoice[][]  // 對應 customizations，但帶 label / price
}

interface GroupedOrder {
  order_id: string
  customer_name: string
  status: string
  created_at: string
  items: OrderItem[]
  total: number
}

// ============================================================
// GET /api/orders — 取得全部訂單
// ============================================================
export async function GET() {
  try {
    const db = getDb()
    const orders = db.prepare(`
      SELECT
        o.order_id,
        o.status,
        o.created_at,
        oi.item_id,
        oi.quantity,
        mi.name AS item_name,
        oi.unit_price AS price,
        oi.customizations,
        oi.customizations_amount,
        mi.addons AS menu_addons,
        dc.name AS customer_name
      FROM "order" o
      LEFT JOIN order_item oi ON o.order_id = oi.order_id
      LEFT JOIN menu_item mi ON oi.item_id = mi.item_id
      LEFT JOIN delivery_customer dc ON o.customer_phone = dc.phone
      ORDER BY o.created_at DESC
    `).all() as (OrderRow & { customer_name: string | null })[]

    // 將扁平的 join 結果整理成巢狀結構
    const grouped: Record<string, GroupedOrder> = {}
    for (const row of orders) {
      if (!grouped[row.order_id]) {
        grouped[row.order_id] = {
          order_id: row.order_id,
          customer_name: row.customer_name ?? '內用顧客',
          status: row.status,
          created_at: row.created_at,
          items: [],
          total: 0,
        }
      }
      if (row.item_id !== null && row.price !== null) {
        // 解析 customizations + 對應到 menu addons 補 label / price
        let customizations: string[][] = []
        try {
          const parsed = JSON.parse(row.customizations ?? '[]')
          if (Array.isArray(parsed)) customizations = parsed
        } catch { /* ignore malformed */ }
        let menuAddons: AddonChoice[] = []
        try {
          const parsed = JSON.parse(row.menu_addons ?? '[]')
          if (Array.isArray(parsed)) menuAddons = parsed
        } catch { /* ignore */ }
        const addonMap = new Map(menuAddons.map(a => [a.id, a]))
        const detail: AddonChoice[][] = customizations.map(unit =>
          (Array.isArray(unit) ? unit : [])
            .map(id => addonMap.get(id))
            .filter((a): a is AddonChoice => !!a)
        )
        const cAmount = row.customizations_amount ?? 0
        const baseSubtotal = row.price * row.quantity!
        grouped[row.order_id].items.push({
          item_id: row.item_id,
          name: row.item_name!,
          quantity: row.quantity!,
          unit_price: row.price,
          subtotal: baseSubtotal + cAmount,
          customizations,
          customizations_amount: cAmount,
          customizations_detail: detail.length > 0 ? detail : undefined,
        })
        grouped[row.order_id].total += baseSubtotal + cAmount
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
//
// 設計邏輯：
// - "order" 表不存 customer_name，只存 customer_phone（FK → delivery_customer）
// - delivery_customer 表存：phone(PK) / name / address
// - 內用時沒有電話 → 用時間戳產生暫時電話
// - note 存在 order 表的 customer_phone 欄位（實際上 DB 沒有 note 欄）
//   目前 order 表沒有 note，先略過
// ============================================================
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { customer_name, customer_phone, items } = body

    // 驗證必填
    if (!customer_name?.trim()) {
      return NextResponse.json(
        { success: false, error: '請輸入顧客姓名' },
        { status: 400 }
      )
    }
    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '購物車是空的' },
        { status: 400 }
      )
    }

    // 預檢可售性：任一品項 blocked 直接擋下
    const availability = computeAvailability()
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

    const db = getDb()

    // 產生訂單編號：A + YYYYMMDD + 4 碼當日流水（從 DB max 推算 + 1）
    // 注意：order_date 必須是 YYYY-MM-DD（reports 用 dashed 格式查詢）；
    //       order_id 用 compact 格式保留流水號可讀性。
    // 用台灣時區 (UTC+8) — 凌晨點餐避免 toISOString() (UTC) 把 order_date 算成前一天
    const isoDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    const compact = isoDate.replace(/-/g, '')              // '20260609'
    const prefix = `A${compact}`

    const getMenu = db.prepare('SELECT price, addons FROM menu_item WHERE item_id = ?')

    // 為避免外層作用域沒辦法取回 orderId，宣告 let 讓 transaction 內 assign
    let orderId = ''
    let phone = ''

    // Transaction：全部成功或全部失敗
    // 流水號在 transaction 內查 max，better-sqlite3 single-thread + 同步 API
    // 確保查詢→INSERT 之間不會被其它連線插入新單，避免 race。
    db.transaction(() => {
      // 0. 在 transaction 內查當日最大 order_id，推算下一個流水號
      const last = db.prepare(
        `SELECT order_id FROM "order" WHERE order_id LIKE ? ORDER BY order_id DESC LIMIT 1`
      ).get(`${prefix}%`) as { order_id: string } | undefined
      const nextSeq = last ? parseInt(last.order_id.slice(-4), 10) + 1 : 1
      orderId = `${prefix}${String(nextSeq).padStart(4, '0')}`

      // 電話處理：內用沒電話 → 產暫時電話
      phone = customer_phone?.trim() || `09${orderId.slice(-8)}`

      // 1. upsert delivery_customer（避免 FK constraint fail）
      db.prepare(`
        INSERT INTO delivery_customer (phone, name, address) VALUES (?, ?, '')
        ON CONFLICT(phone) DO UPDATE SET name = excluded.name
      `).run(phone, customer_name.trim())

      // 2. 寫入訂單主表（order 表沒有 note 欄，所以略過）
      db.prepare(`
        INSERT INTO "order" (order_id, order_date, status, customer_phone)
        VALUES (?, ?, '待製作', ?)
      `).run(orderId, isoDate, phone)

      // 3. 寫入訂單明細（用下單時的單價快照）
      //    - 防呆：item_id 缺漏 / 查不到 menu_item → throw，整個 transaction rollback
      //    - quantity 必須 > 0
      //    - customizations 是 array of arrays（每份的 addon id 列表），長度 = quantity（沒給就 []）
      //      只接受品項自己定義的 addon id，否則整單 reject（避免前端傳假 addon 偷免費 / 用別品項 addon）
      //    - customizations_amount = sum of addon prices across all units
      const insertItem = db.prepare(`
        INSERT INTO order_item (order_id, item_id, quantity, unit_price, customizations, customizations_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      for (const item of items) {
        const itemId = item?.item_id
        const quantity = Number(item?.quantity)
        if (itemId === undefined || itemId === null) {
          throw new Error('品項缺少 item_id')
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`品項 ${itemId} 數量無效`)
        }
        const menuItem = getMenu.get(itemId) as { price: number; addons: string } | undefined
        if (!menuItem) {
          throw new Error(`找不到品項 ${itemId}`)
        }

        let menuAddons: { id: string; label: string; price: number }[] = []
        try {
          const parsed = JSON.parse(menuItem.addons ?? '[]')
          if (Array.isArray(parsed)) menuAddons = parsed
        } catch { /* 容錯：當作沒 addons */ }
        const addonMap = new Map(menuAddons.map(a => [a.id, a]))

        // 驗證 + 算金額
        const rawCust = Array.isArray(item?.customizations) ? item.customizations : []
        if (rawCust.length > 0 && rawCust.length !== quantity) {
          throw new Error(`品項 ${itemId} customizations 長度 ${rawCust.length} 不等於 quantity ${quantity}`)
        }
        let cAmount = 0
        const normalized: string[][] = rawCust.map((unit: unknown, idx: number) => {
          if (!Array.isArray(unit)) {
            throw new Error(`品項 ${itemId} 客製化第 ${idx + 1} 份格式錯誤`)
          }
          const ids: string[] = []
          for (const a of unit) {
            const addonId = String(a)
            const addon = addonMap.get(addonId)
            if (!addon) {
              throw new Error(`品項 ${itemId} 不支援 addon: ${addonId}`)
            }
            ids.push(addonId)
            cAmount += addon.price
          }
          return ids
        })

        insertItem.run(
          orderId,
          itemId,
          quantity,
          menuItem.price,
          JSON.stringify(normalized),
          cAmount
        )
      }
    })()

    return NextResponse.json(
      { success: true, data: { order_id: orderId } },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/orders error:', error)
    const msg = error instanceof Error ? error.message : '未知錯誤'
    // 品項驗證錯誤回 400（前台可顯示），其它系統錯誤回 500
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