// scripts/migrate-add-addon-menu.js
// 補既有 DB 的 menu_item 26-31：
//   26 沙茶燴雞肉（單點 90，配對 16/18）
//   27 加菜 / 28 加牛 / 29 加豬 / 30 加雞 / 31 加飯
// 對齊 CSV 匯入用的 POS code（避免 import 時被當 unmapped 跳掉）。
//
// 跑法：先停 dev server → `node scripts/migrate-add-addon-menu.js`
// Idempotent：item_id 已存在則跳過。
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'jinhaoke.db')
if (!fs.existsSync(DB_PATH)) {
  console.error('找不到 DB：', DB_PATH)
  process.exit(1)
}
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const ITEMS = [
  // [item_id, name, category, price, emoji, tag, sub, option, description, image_url]
  [26, '沙茶燴雞肉', '單點', 90, '🍗', '雞',   '', '加肉60 / 加菜10', '沙茶燴雞肉',  '/uploads/menu/沙茶雞柳燴飯.webp'],
  [27, '加菜',       '單點', 10, '🥬', '其他', '', '',                '燴飯加菜',    '/uploads/menu/單點 - 季節時蔬.webp'],
  [28, '加牛',       '單點', 60, '🥩', '牛',   '', '',                '燴飯加牛',    '/uploads/menu/沙茶牛肉燴飯.webp'],
  [29, '加豬',       '單點', 50, '🐷', '豬',   '', '',                '燴飯加豬',    '/uploads/menu/沙茶豬肉燴飯.webp'],
  [30, '加雞',       '單點', 60, '🍗', '雞',   '', '',                '燴飯加雞',    '/uploads/menu/沙茶雞柳燴飯.webp'],
  [31, '加飯',       '單點', 20, '🍚', '其他', '', '',                '加一份白飯',  '/uploads/menu/單點 - 白飯.webp'],
]

// 是否有 image_url 欄位（舊 schema 沒有，避免 INSERT 出錯）
const cols = db.prepare("PRAGMA table_info(menu_item)").all()
const hasImage = cols.some(c => c.name === 'image_url')

const insertWithImg = db.prepare(`
  INSERT INTO menu_item (item_id, name, category, price, emoji, tag, sub, option, description, image_url, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`)
const insertNoImg = db.prepare(`
  INSERT INTO menu_item (item_id, name, category, price, emoji, tag, sub, option, description, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`)
const findById = db.prepare('SELECT item_id, name FROM menu_item WHERE item_id = ?')
const findByName = db.prepare('SELECT item_id FROM menu_item WHERE name = ?')

let added = 0, skipped = 0, conflict = 0
const tx = db.transaction(() => {
  for (const it of ITEMS) {
    const [id, name, cat, price, emoji, tag, sub, opt, desc, img] = it
    const existsId = findById.get(id)
    const existsName = findByName.get(name)
    if (existsId) {
      // item_id 已被占用 — 如果就是我們要的名稱則跳過、否則警告
      if (existsId.name === name) {
        skipped++
        console.log(`  [skip] item_id=${id} 已存在 (${name})`)
      } else {
        conflict++
        console.warn(`  [conflict] item_id=${id} 已被 ${existsId.name} 占用，預期 ${name}；不覆蓋，請手動處理`)
      }
      continue
    }
    if (existsName) {
      conflict++
      console.warn(`  [conflict] 名稱「${name}」已存在於 item_id=${existsName.item_id}，跳過`)
      continue
    }
    if (hasImage) {
      insertWithImg.run(id, name, cat, price, emoji, tag, sub, opt, desc, img)
    } else {
      insertNoImg.run(id, name, cat, price, emoji, tag, sub, opt, desc)
    }
    added++
    console.log(`  [add]  ${id} ${name} (${cat}, $${price})`)
  }
})
tx()

console.log(`\n完成：新增 ${added}、已存在 ${skipped}、衝突 ${conflict}`)
db.close()
