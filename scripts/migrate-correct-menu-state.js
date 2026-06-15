// scripts/migrate-correct-menu-state.js
// 一次性修正：
//   1. 滷豬腳便當 is_active 應為 0（下架）
//   2. 配菜 / 加購（21–25）image_url 應指回各自的 單點 webp，不應是 手作便當 照片
//
// 適用情境：DB 是在 commit 5613786 ~ b8aec28 之間生成的（boot-time backfill 把
//          配菜也套到套餐照），或 滷豬腳便當 從未被手動下架過。
// 跑法：先停 dev server → `node scripts/migrate-correct-menu-state.js`
// Idempotent：已對齊的不動。

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

// ── 1) 滷豬腳便當 → 下架 ──
const porkFeet = db.prepare("SELECT item_id, name, is_active FROM menu_item WHERE name = ?").get('滷豬腳便當')
if (!porkFeet) {
  console.warn('  ⚠ 找不到 滷豬腳便當')
} else if (porkFeet.is_active === 0) {
  console.log('  · 滷豬腳便當 已是下架狀態，跳過')
} else {
  db.prepare('UPDATE menu_item SET is_active = 0 WHERE item_id = ?').run(porkFeet.item_id)
  console.log('  ✓ 滷豬腳便當 已下架')
}

// ── 2) 配菜 / 加購 image_url 修正 ──
// 改回各自單點 webp（這些檔案在 commit a057c75 進的 public/uploads/menu/）
const CORRECT_SIDES = [
  { name: '季節炒時蔬', url: '/uploads/menu/單點 - 季節時蔬.webp' },
  { name: '白飯',       url: '/uploads/menu/單點 - 白飯.webp' },
  { name: '滷蛋',       url: '/uploads/menu/單點 - 滷蛋.webp' },
  { name: '加購湯品',   url: '/uploads/menu/單點 - 加購湯品.webp' },
  { name: '加購菜脯',   url: '/uploads/menu/單點  - 菜脯.webp' },  // 檔名為雙空白
]

// 知道是「歷史錯誤預設值」的 URL — 撞到才覆蓋，自訂上傳的不動
const KNOWN_BAD_URLS = new Set([
  '/uploads/menu/紅麴豬手作便當.webp',
  '/uploads/menu/炸豬排手作便當.webp',
  '/uploads/menu/滷排骨手作便當.webp',
  '/uploads/menu/炸雞腿手作便當.webp',
  '/uploads/menu/滷雞腿手作便當.webp',
])

const select = db.prepare('SELECT item_id, image_url FROM menu_item WHERE name = ?')
const update = db.prepare('UPDATE menu_item SET image_url = ? WHERE item_id = ?')

let corrected = 0
let preserved = 0
let alreadyOK = 0

for (const s of CORRECT_SIDES) {
  const row = select.get(s.name)
  if (!row) {
    console.warn(`  ⚠ 找不到 ${s.name}`)
    continue
  }
  if (row.image_url === s.url) {
    alreadyOK++
    continue
  }
  // 空 → 補；已知錯誤預設 → 覆蓋；其他（自訂上傳）→ 保留
  if (!row.image_url || KNOWN_BAD_URLS.has(row.image_url)) {
    update.run(s.url, row.item_id)
    corrected++
    console.log(`  ✓ ${s.name}: ${row.image_url || '(空)'} → ${s.url}`)
  } else {
    preserved++
    console.log(`  · ${s.name}: 保留自訂 ${row.image_url}（預設 ${s.url}）`)
  }
}

console.log(`\n完成：修正 ${corrected} 筆、已對齊 ${alreadyOK} 筆、自訂保留 ${preserved} 筆`)
db.close()
