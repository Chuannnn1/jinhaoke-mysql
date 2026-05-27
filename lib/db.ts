// lib/db.ts
// 更新日期：2026-05-22（對齊 schema v3）
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = path.join(process.cwd(), 'data', 'jinhaoke.db')
const SCHEMA_PATH = path.join(process.cwd(), 'lib', 'schema.sql')
const SEED_PATH = path.join(process.cwd(), 'lib', 'seed.sql')

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

    // 執行 schema（會自動忽略已存在的 table）
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')
    db.exec(schema)

    // 初始化 seed（只在 table 為空時執行）
    seedIfEmpty(db)

    console.log('[db] 資料庫初始化完成，DB 路徑：', DB_PATH)
  }
  return db
}

function seedIfEmpty(db: Database.Database) {
  const count = db.prepare('SELECT COUNT(*) as c FROM menu_item').get() as { c: number }
  if (count.c > 0) return

  console.log('[db] 初始化 seed 資料...')

  // 依賴順序：supplier → ingredient → menu_item → recipe
  // delivery_customer 無依賴
  // "order" → order_item → purchase_order → purchase_order_item
  const tables = [
    'supplier',
    'ingredient',
    'menu_item',
    'delivery_customer',
    'recipe',
    '"order"',
    'order_item',
    'purchase_order',
    'purchase_order_item',
  ]

  for (const table of tables) {
    const rowCount = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }
    if (rowCount.c > 0) continue

    console.log(`[db] seed: ${table} 為空，寫入...`)
  }

  // 讀取並執行 seed.sql
  const seed = fs.readFileSync(SEED_PATH, 'utf-8')
  db.exec(seed)

  // 驗證寫入
  const menuCount = db.prepare('SELECT COUNT(*) as c FROM menu_item').get() as { c: number }
  const ingCount = db.prepare('SELECT COUNT(*) as c FROM ingredient').get() as { c: number }
  console.log(`[db] seed 完成：${menuCount.c} 個餐點、${ingCount.c} 種食材`)
}