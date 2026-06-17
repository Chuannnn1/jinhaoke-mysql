import { getDb } from '@/lib/db'
import { NextResponse } from 'next/server'

// ============================================================
// POST /api/orders/import
// 透過 multipart/form-data 上傳 CSV，預覽或匯入訂單
//
// CSV 格式（店家實際匯出）：
//   檔名：MMDD.csv（例 0519.csv -> 2026-05-19）
//   標頭：編號,金額,電話,付款狀態,品項,辣度
//   品項：分號分隔 code，可選 *N 表數量（例：5;21、5*14;7*12）
//   辣度：分號分隔（無/小/微/大/null），對應 items 順序，記為 note
//
// 流程：
//   1. preview 階段（confirm != '1'）回 unmapped_codes + menu_options，由 UI 補 mapping
//   2. confirm 階段（confirm == '1'）需附 mapping JSON：{ [code: string]: item_id }
//
// ────────────────────────────────────────────────────────────
// CSV 匯入「code → item_id」判斷原則（後續維護請對齊）
// ────────────────────────────────────────────────────────────
//   1. **預設 1:1 對應**：CSV `code = N` 直接對應 `menu_item.item_id = N`，
//      包含已下架（is_active=0）品項，照樣會匯入歷史紀錄。
//      這就是為什麼 menu_item 的 item_id 是「店家 POS 編號」，不要隨便重排。
//
//   2. **手動 mapping override**：preview 階段 UI 補的 mapping JSON 永遠優先，
//      自動 1:1 只在缺漏時補。用來處理「code 暫時 reassign」之類的個案。
//
//   3. **未對應 code（unmapped）→ 跳過**：CSV 出現 menu_item 沒有的 code，
//      preview 會列在 `unmapped_codes`、UI 顯示「已忽略 N 個未對應 code」，
//      實際匯入時這些品項會被 filter 掉，不會阻擋整張訂單匯入。
//      訂單若全是 unmapped 也會跳過該筆（itemsCount 不會計入）。
//
//   4. **想要新 code 被認識，請走這個 SOP**：
//      a. 在 `scripts/seed-data.js` `MENU_ITEMS` 後面 append 新項目（item_id 自動接續）
//      b. 寫一支 `scripts/migrate-add-XXX.js` migration 補進既有 DB（用 INSERT
//         指定 item_id；idempotent；參考 `migrate-add-addon-menu.js`）
//      c. 把 migration 串進 `package.json` 的 `db:migrate` script
//      d. 在 `品項對照表.txt` 或 schema 文件補上對應，未來看 CSV 才知道含義
//      e. 重 deploy 前一定要先跑 `npm run db:migrate`（VM 上是
//         `sudo -u jinhaoke DB_PATH=/var/lib/jinhaoke/jinhaoke.db npm run db:migrate`）
//
//   5. **沒打算長期支援的 code**：保留 unmapped 流程即可（會自動跳過 + log），
//      不要為了「不顯示警告」隨便塞假名稱進 menu_item。
//
//   6. **被 deactivate 的菜（is_active=0）**：仍然會被 import 認得（規則 1），
//      只是 UI 顯示時會標 [已下架]。歷史訂單照常統計營收。
//
//   現行已加入的 26-31（沙茶燴雞肉 / 加菜 / 加牛 / 加豬 / 加雞 / 加飯）已對齊
//   `品項對照表.txt` 2026-05-28 版本；CSV 內出現 27/28/29/31 都會正確 import。
// ============================================================

interface ParsedItem {
  code: number
  qty: number
}

interface ParsedRow {
  rowNum: number
  daily_seq: number        // 編號
  amount_csv: number       // 金額（cost ref，只供參考）
  phone: string            // 電話原值（可空）
  paid: boolean            // 0=未付,1=已付
  items: ParsedItem[]      // 品項列表
  spice: string[]          // 辣度列表
}

interface ValidItemPreview {
  code: number
  qty: number
  spice: string
  // 若預覽時已有 mapping 就帶 name/unit_price
  item_name?: string
  unit_price?: number
  item_id?: number
  is_active?: number          // 1=上架中, 0=已下架（如：滷豬腳便當）
}

interface ValidOrderPreview {
  order_id: string
  status: string
  items: ValidItemPreview[]
  total: number              // 用 unit_price * qty 重算（已 mapping 部分）
  amount_csv: number         // CSV 原始金額（cost ref）
  phone: string
  note: string               // 由辣度組合
}

interface RowError {
  row: number
  reason: string
}

interface MenuLookupRow {
  item_id: number
  name: string
  price: number
  is_active: number
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map(s => s.trim())
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) return { header: [], rows: [] }
  const header = splitCsvLine(lines[0])
  const rows = lines.slice(1).map(splitCsvLine)
  return { header, rows }
}

// 解析品項字串 "5;21;27*2;5*14" -> [{code:5,qty:1},{code:21,qty:1},{code:27,qty:2},{code:5,qty:14}]
function parseItems(raw: string): { ok: boolean; items: ParsedItem[]; reason?: string } {
  const items: ParsedItem[] = []
  const parts = raw.split(';').map(s => s.trim()).filter(s => s.length > 0)
  for (const p of parts) {
    let codeStr = p
    let qtyStr = '1'
    if (p.includes('*')) {
      const [c, q] = p.split('*').map(s => s.trim())
      codeStr = c
      qtyStr = q
    }
    const code = parseInt(codeStr, 10)
    const qty = parseInt(qtyStr, 10)
    if (!Number.isFinite(code) || code <= 0) {
      return { ok: false, items: [], reason: `品項 code 格式錯誤：${p}` }
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, items: [], reason: `品項 qty 格式錯誤：${p}` }
    }
    items.push({ code, qty })
  }
  return { ok: true, items }
}

// 解析辣度 "無;無;21無" -> ["無","無","21無"]
function parseSpice(raw: string): string[] {
  if (!raw || raw.toLowerCase() === 'null') return []
  return raw.split(';').map(s => s.trim())
}

// 解析電話：接受 3~15 碼數字 或 'null' 或空 -> 直接存原值或空字串
function parsePhone(raw: string): { ok: boolean; phone: string; reason?: string } {
  if (!raw || raw.toLowerCase() === 'null') return { ok: true, phone: '' }
  if (!/^\d{3,15}$/.test(raw)) return { ok: false, phone: '', reason: `電話格式錯誤：${raw}` }
  return { ok: true, phone: raw }
}

// 解析檔名 "0519.csv" / "0519" -> "2026-05-19"
function parseDateFromFilename(filename: string): { ok: boolean; date?: string; ymdCompact?: string; reason?: string } {
  const base = filename.replace(/\.csv$/i, '').trim()
  const m = base.match(/^(\d{2})(\d{2})$/)
  if (!m) return { ok: false, reason: `檔名必須為 MMDD.csv 格式（例 0519.csv），目前：${filename}` }
  const mm = m[1]
  const dd = m[2]
  const mmNum = parseInt(mm, 10)
  const ddNum = parseInt(dd, 10)
  if (mmNum < 1 || mmNum > 12 || ddNum < 1 || ddNum > 31) {
    return { ok: false, reason: `檔名月份/日期超出範圍：${filename}` }
  }
  const year = 2026
  return { ok: true, date: `${year}-${mm}-${dd}`, ymdCompact: `${year}${mm}${dd}` }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const confirm = formData.get('confirm') === '1'
    const mappingRaw = formData.get('mapping')

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { success: false, error: '請上傳 CSV 檔案' },
        { status: 400 }
      )
    }

    const filename = (file as File).name || ''
    const dateParse = parseDateFromFilename(filename)
    if (!dateParse.ok) {
      return NextResponse.json(
        { success: false, error: dateParse.reason || '檔名格式錯誤' },
        { status: 400 }
      )
    }
    const orderDate = dateParse.date!
    const ymdCompact = dateParse.ymdCompact!

    // 今日日期（台灣時區 UTC+8）：用來判斷是否「過去訂單」
    // 過去訂單一律強制 status='已完成'，避免出現在 admin kanban 的「待製作/製作中/待付款」欄
    const todayISO = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    const isPastOrder = orderDate !== todayISO

    const text = await (file as File).text()
    const { header, rows } = parseCsv(text)

    const expected = ['編號', '金額', '電話', '付款狀態', '品項', '辣度']
    if (header.length < expected.length || expected.some((c, i) => header[i] !== c)) {
      return NextResponse.json(
        { success: false, error: 'CSV 標頭必須為：編號,金額,電話,付款狀態,品項,辣度' },
        { status: 400 }
      )
    }

    const db = getDb()

    // 預載 menu_item（含已下架；用 code === item_id 自動對應，避免要使用者手動下拉）
    const menuRows = db
      .prepare('SELECT item_id, name, price, is_active FROM menu_item ORDER BY item_id')
      .all() as MenuLookupRow[]
    const menuById = new Map<number, MenuLookupRow>()
    for (const m of menuRows) menuById.set(m.item_id, m)

    // 預載既有 order_id（衝突判斷）
    const existingOrderIds = new Set<string>(
      (db.prepare('SELECT order_id FROM "order"').all() as { order_id: string }[])
        .map(r => r.order_id)
    )

    const errors: RowError[] = []
    const parsedRows: ParsedRow[] = []
    const seenSeq = new Set<number>()

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2
      const cells = rows[i]
      const [seqRaw = '', amountRaw = '', phoneRaw = '', paidRaw = '', itemsRaw = '', spiceRaw = ''] = cells

      if (!seqRaw || !itemsRaw) {
        errors.push({ row: rowNum, reason: '缺少必要欄位（編號 / 品項）' })
        continue
      }

      const seq = parseInt(seqRaw, 10)
      if (!Number.isFinite(seq) || seq <= 0) {
        errors.push({ row: rowNum, reason: `編號必須為正整數：${seqRaw}` })
        continue
      }
      if (seenSeq.has(seq)) {
        errors.push({ row: rowNum, reason: `編號重複：${seq}` })
        continue
      }

      const amount = parseInt(amountRaw, 10)
      if (amountRaw && (!Number.isFinite(amount) || amount < 0)) {
        errors.push({ row: rowNum, reason: `金額格式錯誤：${amountRaw}` })
        continue
      }

      const phoneRes = parsePhone(phoneRaw)
      if (!phoneRes.ok) {
        errors.push({ row: rowNum, reason: phoneRes.reason || '電話錯誤' })
        continue
      }

      let paid = false
      if (paidRaw === '0') paid = false
      else if (paidRaw === '1') paid = true
      else {
        errors.push({ row: rowNum, reason: `付款狀態必須為 0 或 1：${paidRaw}` })
        continue
      }

      const itemsRes = parseItems(itemsRaw)
      if (!itemsRes.ok) {
        errors.push({ row: rowNum, reason: itemsRes.reason || '品項錯誤' })
        continue
      }

      const spice = parseSpice(spiceRaw)

      // order_id 衝突判斷（格式：A + YYYYMMDD + 4 碼當日流水）
      const orderId = `A${ymdCompact}${String(seq).padStart(4, '0')}`
      if (existingOrderIds.has(orderId)) {
        errors.push({ row: rowNum, reason: `order_id 已存在：${orderId}` })
        continue
      }

      seenSeq.add(seq)
      parsedRows.push({
        rowNum,
        daily_seq: seq,
        amount_csv: Number.isFinite(amount) ? amount : 0,
        phone: phoneRes.phone,
        paid,
        items: itemsRes.items,
        spice,
      })
    }

    // 蒐集出現過的 code
    const codeSet = new Set<number>()
    for (const r of parsedRows) for (const it of r.items) codeSet.add(it.code)

    // 解析 mapping（如果 client 有傳）
    let mapping: Record<string, number> = {}
    if (mappingRaw && typeof mappingRaw === 'string') {
      try {
        const parsed = JSON.parse(mappingRaw)
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            const id = typeof v === 'number' ? v : parseInt(String(v), 10)
            if (Number.isFinite(id) && id > 0) mapping[k] = id
          }
        }
      } catch {
        return NextResponse.json(
          { success: false, error: 'mapping JSON 解析失敗' },
          { status: 400 }
        )
      }
    }

    // 自動對應：code 直接等於 menu_item.item_id（依編號表 1:1 對應，含已下架品項）
    // 使用者手動傳入的 mapping 優先生效，僅在缺漏時補上自動對應
    for (const code of Array.from(codeSet)) {
      if (!mapping[String(code)] && menuById.has(code)) {
        mapping[String(code)] = code
      }
    }

    // 計算 unmapped_codes：在 codeSet 中且 mapping 沒給對應 item_id
    const unmappedCodes: number[] = []
    for (const code of Array.from(codeSet).sort((a, b) => a - b)) {
      const mapped = mapping[String(code)]
      if (!mapped || !menuById.has(mapped)) unmappedCodes.push(code)
    }

    // 組合預覽訂單
    const valid: ValidOrderPreview[] = parsedRows.map(r => {
      const orderId = `A${ymdCompact}${String(r.daily_seq).padStart(4, '0')}`
      // 過去訂單 → 強制「已完成」（不論 CSV 付款狀態），不要污染今日 kanban
      const status = isPastOrder ? '已完成' : (r.paid ? '已完成' : '待付款')
      const items: ValidItemPreview[] = r.items.map((it, idx) => {
        const mapped = mapping[String(it.code)]
        const menu = mapped ? menuById.get(mapped) : undefined
        return {
          code: it.code,
          qty: it.qty,
          spice: r.spice[idx] ?? '',
          item_name: menu?.name,
          unit_price: menu?.price,
          item_id: menu?.item_id,
          is_active: menu?.is_active,
        }
      })
      // total：已 mapping 的相加；未 mapping 算 0（預覽時呈現部分）
      const total = items.reduce((s, it) => s + (it.unit_price ?? 0) * it.qty, 0)
      const noteParts = r.spice
        .map((sp, idx) => sp ? `${items[idx]?.item_name ?? `code${items[idx]?.code}`}:${sp}` : '')
        .filter(s => s.length > 0)
      return {
        order_id: orderId,
        status,
        items,
        total,
        amount_csv: r.amount_csv,
        phone: r.phone,
        note: noteParts.join('；'),
      }
    })

    const itemsCount = valid.reduce((s, o) => s + o.items.length, 0)
    const summary = {
      orders: valid.length,
      items: itemsCount,
      errors: errors.length,
      file: filename,
      order_date: orderDate,
    }

    // 預覽
    if (!confirm) {
      return NextResponse.json({
        success: true,
        preview: true,
        summary,
        valid,
        errors,
        unmapped_codes: unmappedCodes,
        menu_options: menuRows.map(m => ({
          item_id: m.item_id,
          name: m.name,
          price: m.price,
          is_active: m.is_active,
        })),
      })
    }

    // 確認匯入
    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: '尚有錯誤，無法匯入', errors },
        { status: 400 }
      )
    }
    if (unmappedCodes.length > 0) {
      // 不再阻擋匯入：有未對應 code 時跳過該品項，繼續匯入其餘可對應的項目
      // （unmapped 品項會在 import 階段被 filter 掉）
      console.warn(`CSV import 發現未對應 code：${unmappedCodes.join(', ')}，將跳過這些品項`)
    }

    const insertOrder = db.prepare(`
      INSERT INTO "order" (order_id, order_date, created_at, updated_at, status, customer_phone, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const insertItem = db.prepare(`
      INSERT INTO order_item (order_id, item_id, quantity, unit_price)
      VALUES (?, ?, ?, ?)
    `)
    const insertCustomer = db.prepare(`
      INSERT OR IGNORE INTO delivery_customer (phone) VALUES (?)
    `)
    const nowFallback = db.prepare(`SELECT datetime('now', '+8 hours') AS t`)
    const fallbackRow = nowFallback.get() as { t: string }
    const fallbackTime = fallbackRow.t

    const tx = db.transaction(() => {
      for (const order of valid) {
        const phoneOrNull = order.phone || null
        if (phoneOrNull) insertCustomer.run(phoneOrNull)
        insertOrder.run(
          order.order_id,
          orderDate,
          fallbackTime,
          fallbackTime,
          order.status,
          phoneOrNull,
          order.note || null
        )
        // 同 order_id + item_id 為 PK，需聚合同一 item_id 的 qty
        const agg = new Map<number, { qty: number; unit_price: number }>()
        for (const it of order.items) {
          if (!it.item_id || it.unit_price === undefined) continue
          const cur = agg.get(it.item_id)
          if (cur) {
            cur.qty += it.qty
          } else {
            agg.set(it.item_id, { qty: it.qty, unit_price: it.unit_price })
          }
        }
        for (const [itemId, info] of agg) {
          insertItem.run(order.order_id, itemId, info.qty, info.unit_price)
        }
      }
    })
    tx()

    // 實際有寫入品項的訂單數（排除全部都是 unmapped code 的訂單）
    const actualImportedOrders = valid.filter(o =>
      o.items.some(it => it.item_id !== undefined && it.unit_price !== undefined)
    )

    return NextResponse.json({
      success: true,
      preview: false,
      imported: actualImportedOrders.length,
      total_csv_orders: valid.length,
      skipped_unmapped_codes: unmappedCodes.length > 0 ? unmappedCodes : undefined,
    })
  } catch (error) {
    console.error('POST /api/orders/import error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
