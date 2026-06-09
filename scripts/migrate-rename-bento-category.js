// Migration: 將 menu_item.category 的「便當」全部改回「手作便當」
// 用途：canonical 分類是「手作便當」，「便當」是後台手動誤加的，統一回正。
//
// 跑法：先停 dev server，然後 `node scripts/migrate-rename-bento-category.js`
// Idempotent：第二次跑 changes=0，不會炸。

const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

const DB_PATH = path.join(__dirname, '..', 'data', 'jinhaoke.db')

if (!fs.existsSync(DB_PATH)) {
  console.error('找不到 DB：', DB_PATH)
  process.exit(1)
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

const result = db.prepare("UPDATE menu_item SET category='手作便當' WHERE category='便當'").run()
console.log(`✓ 重命名 ${result.changes} 筆便當分類（便當 → 手作便當）`)

db.close()
