// scripts/migrate-add-order-note-and-drop-addon-items.js
//
// 1. "order" 表新增 note TEXT 欄位（吃 import CSV 的辣度資訊 / 其它備註）
// 2. 刪 menu_item 內的純 addon 項目：27 加菜 / 28 加牛 / 29 加豬 / 30 加雞 / 31 加飯
//    這些原本是「為了讓 CSV import 1:1 對應」而存在，但實際只是客製化 addon，
//    不應該佔據菜單編號。刪除前會檢查 order_item 是否有引用：
//      - 有引用：保留紀錄 + is_active=0 軟刪（避免破壞歷史訂單 FK）
//      - 無引用：hard DELETE
//
// Idempotent：欄位 / 品項已不存在則跳過。
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'jinhaoke.db')
if (!fs.existsSync(DB_PATH)) {
  console.error('找不到 DB：', DB_PATH)
  process.exit(1)
}
const db = new Database(DB_PATH)
db.pragma('foreign_keys = ON')

function hasCol(table, col) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().some(c => c.name === col)
}

// ── 1. ALTER TABLE: order.note ─────────────────────────
if (!hasCol('order', 'note')) {
  db.exec('ALTER TABLE "order" ADD COLUMN note TEXT')
  console.log('  [+] order.note')
} else {
  console.log('  [=] order.note 已存在，跳過')
}

// ── 2. 刪純 addon 品項 ────────────────────────────────
const ADDON_IDS = [27, 28, 29, 30, 31]
const refCount = db.prepare(`
  SELECT item_id, COUNT(*) AS n
  FROM order_item
  WHERE item_id IN (${ADDON_IDS.join(',')})
  GROUP BY item_id
`).all()
const refMap = new Map(refCount.map(r => [r.item_id, r.n]))

let hardDeleted = 0, softDeleted = 0, missing = 0
const tx = db.transaction(() => {
  for (const id of ADDON_IDS) {
    const row = db.prepare('SELECT item_id, name FROM menu_item WHERE item_id = ?').get(id)
    if (!row) { missing++; continue }
    const refs = refMap.get(id) ?? 0
    if (refs > 0) {
      db.prepare('UPDATE menu_item SET is_active = 0 WHERE item_id = ?').run(id)
      console.log(`  [soft] item_id=${id} (${row.name}) 有 ${refs} 筆 order_item 引用 → is_active=0`)
      softDeleted++
    } else {
      db.prepare('DELETE FROM menu_item WHERE item_id = ?').run(id)
      console.log(`  [-]    item_id=${id} (${row.name}) 已刪除`)
      hardDeleted++
    }
  }
})
tx()

console.log(`\n完成：hard delete ${hardDeleted}、soft delete ${softDeleted}、不存在 ${missing}`)
db.close()
