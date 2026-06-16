// scripts/migrate-add-customization-schema.js
// 既有 DB 補：
//   1. menu_item.addons        TEXT '[]'   — 每品項可選的客製化 addon 表
//   2. order_item.customizations          TEXT '[]'  — 每張訂單每品項實際選了什麼
//   3. order_item.customizations_amount   INT  0     — 客製化加總金額 snapshot
// 同時：把手作便當 1-8 + 燴飯 9-11 的 addons 填好（其他品項保持 '[]'）。
// 加肉：便當用對應「單點」價、燴飯用 60/60/50（依 牛 / 雞 / 豬）；加飯統一 +10。
// Idempotent：欄位已存在 / addons 已寫過則跳過。
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
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)
}

// ── 1. ALTER TABLE 補欄位 ────────────────────────────
let altered = 0
if (!hasCol('menu_item', 'addons')) {
  db.exec("ALTER TABLE menu_item ADD COLUMN addons TEXT NOT NULL DEFAULT '[]'")
  console.log('  [+] menu_item.addons')
  altered++
}
if (!hasCol('order_item', 'customizations')) {
  db.exec("ALTER TABLE order_item ADD COLUMN customizations TEXT NOT NULL DEFAULT '[]'")
  console.log('  [+] order_item.customizations')
  altered++
}
if (!hasCol('order_item', 'customizations_amount')) {
  db.exec("ALTER TABLE order_item ADD COLUMN customizations_amount INTEGER NOT NULL DEFAULT 0")
  console.log('  [+] order_item.customizations_amount')
  altered++
}
if (altered === 0) console.log('  欄位都已存在，跳過 ALTER')

// ── 2. 填 menu_item.addons ─────────────────────────
const ADDON_RICE  = { id: 'extra_rice', label: '加飯', price: 10 }
const ADDON_VEG   = { id: 'extra_veg',  label: '加菜', price: 10 }

const bentoAddons = (meatLabel, meatPrice) => JSON.stringify([
  { id: 'extra_meat', label: meatLabel, price: meatPrice },
  ADDON_RICE,
])
const sauceAddons = (meatLabel, meatPrice) => JSON.stringify([
  ADDON_VEG,
  { id: 'extra_meat', label: meatLabel, price: meatPrice },
  ADDON_RICE,
])
const RICE_ONLY = JSON.stringify([ADDON_RICE])

const ADDON_BY_ID = {
  1:  bentoAddons('加魚排',   100),
  2:  bentoAddons('加豬排',   100),
  3:  bentoAddons('加雞腿',   100),
  4:  bentoAddons('加豬五花',  90),
  5:  bentoAddons('加排骨',    70),
  6:  RICE_ONLY,                     // 滷豬腳便當（下架）只給加飯
  7:  bentoAddons('加滷雞腿',  70),
  8:  bentoAddons('加滷排骨',  80),
  9:  sauceAddons('加牛',      60),
  10: sauceAddons('加雞',      60),
  11: sauceAddons('加豬',      50),
}

const upd = db.prepare('UPDATE menu_item SET addons = ? WHERE item_id = ?')
let updated = 0, skipped = 0
const tx = db.transaction(() => {
  for (const [idStr, addons] of Object.entries(ADDON_BY_ID)) {
    const id = parseInt(idStr, 10)
    const cur = db.prepare('SELECT addons FROM menu_item WHERE item_id = ?').get(id)
    if (!cur) {
      console.log(`  [skip] item_id=${id} 不存在`)
      continue
    }
    if (cur.addons && cur.addons !== '[]') {
      skipped++
      continue
    }
    upd.run(addons, id)
    updated++
  }
})
tx()

console.log(`\n完成：alter ${altered}、addons 寫入 ${updated}、已存在跳過 ${skipped}`)
db.close()
