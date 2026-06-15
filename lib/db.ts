// lib/db.ts
// 更新日期：2026-06-09（對齊 schema v3，整合 init-db idempotent seed）
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// DB_PATH env 優先（部署環境用 /var/lib/jinhaoke/jinhaoke.db）；
// 否則 fallback 到 repo 內 data/jinhaoke.db（本機開發預設）
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'jinhaoke.db')
const SCHEMA_PATH = path.join(process.cwd(), 'lib', 'schema.sql')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    // 確保 data 目錄存在
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // 執行 schema（IF NOT EXISTS，舊 DB 不會被破壞）
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')
    db.exec(schema)

    // 初始化 seed（per-table idempotent）
    seedIfEmpty(db)

    console.log('[db] 資料庫初始化完成，DB 路徑：', DB_PATH)
  }
  return db
}

function seedIfEmpty(database: Database.Database) {
  const seedDataPath = path.join(process.cwd(), 'scripts', 'seed-data.js')
  if (!fs.existsSync(seedDataPath)) {
    console.warn('[db] ⚠️  找不到 scripts/seed-data.js，跳過 seed')
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const seedMod = eval('require')(seedDataPath) as {
    seedAll: (db: Database.Database) => void
    MENU_ITEMS: Array<{ name: string; image_url?: string }>
  }

  const count = database.prepare('SELECT COUNT(*) as c FROM menu_item').get() as { c: number }
  if (count.c === 0) {
    console.log('[db] menu_item 為空，跑 seed...')
    seedMod.seedAll(database)
    const menuCount = database.prepare('SELECT COUNT(*) as c FROM menu_item').get() as { c: number }
    const ingCount = database.prepare('SELECT COUNT(*) as c FROM ingredient').get() as { c: number }
    console.log(`[db] seed 完成：${menuCount.c} 個餐點、${ingCount.c} 種食材`)
  }

  // 既有 DB 補預設圖：image_url 為空時用 MENU_ITEMS 對應的預設值回填。
  // 自訂圖（已有非空 image_url）不會被覆蓋。
  const cols = database.prepare("PRAGMA table_info(menu_item)").all() as Array<{ name: string }>
  const hasImageUrl = cols.some(c => c.name === 'image_url')
  if (hasImageUrl) {
    const upd = database.prepare(
      "UPDATE menu_item SET image_url = ? WHERE name = ? AND (image_url IS NULL OR image_url = '')"
    )
    let filled = 0
    for (const m of seedMod.MENU_ITEMS) {
      if (!m.image_url) continue
      const r = upd.run(m.image_url, m.name)
      if (r.changes > 0) filled++
    }
    if (filled > 0) console.log(`[db] 補入 ${filled} 筆 menu_item image_url 預設值`)
  }
}
