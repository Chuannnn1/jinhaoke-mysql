// scripts/migrate-redesign-return.js
// 採購 / 退貨流程 redesign migration：
//   1. purchase_order CHECK：'部分退貨' → '已退貨'（資料 + constraint 都改）
//   2. return_order PK：(po_id, ingredient_name) → return_id autoincrement
//      → 允許同一張 PO 的同一食材有多筆退貨記錄
//
// 跑法：先停 dev server → `node scripts/migrate-redesign-return.js`
// Idempotent：偵測現況，已遷移過會跳過。
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'jinhaoke.db')
if (!fs.existsSync(DB_PATH)) {
  console.error('找不到 DB：', DB_PATH); process.exit(1)
}
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// 暫時關 FK 才能 recreate 表（裡面有跨表 FK）
db.pragma('foreign_keys = OFF')

function tableSql(name) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(name)
  return row?.sql || ''
}

// ── 1) purchase_order：把 CHECK 裡的 '部分退貨' 換成 '已退貨' ──
const poSql = tableSql('purchase_order')
const poNeeds = poSql.includes('部分退貨')
if (!poNeeds) {
  console.log('  · purchase_order CHECK 已是新版，跳過')
} else {
  console.log('  → 重建 purchase_order（CHECK 改 已退貨）...')
  db.transaction(() => {
    // 先把資料的 '部分退貨' 換成 '已退貨'
    const r = db.prepare("UPDATE purchase_order SET status = '已退貨' WHERE status = '部分退貨'").run()
    if (r.changes > 0) console.log(`    · 既有 ${r.changes} 筆 部分退貨 → 已退貨`)

    db.exec(`
      CREATE TABLE purchase_order_new (
        po_id          INTEGER PRIMARY KEY AUTOINCREMENT,
        po_date        TEXT    NOT NULL,
        supplier_name  TEXT    NOT NULL,
        total_amount   REAL    NOT NULL DEFAULT 0,
        status         TEXT    NOT NULL DEFAULT '已訂購'
                       CHECK (status IN ('已訂購','已驗貨','已退貨')),
        FOREIGN KEY (supplier_name) REFERENCES supplier(name)
            ON UPDATE CASCADE ON DELETE RESTRICT
      );
      INSERT INTO purchase_order_new (po_id, po_date, supplier_name, total_amount, status)
      SELECT po_id, po_date, supplier_name, total_amount, status FROM purchase_order;
      DROP TABLE purchase_order;
      ALTER TABLE purchase_order_new RENAME TO purchase_order;
      CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_order(po_date);
      CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_order(supplier_name);
      CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_order(status);
    `)
  })()
  console.log('  ✓ purchase_order 完成')
}

// ── 2) return_order：PK 改 return_id autoincrement ──
const roSql = tableSql('return_order')
const roHasReturnId = roSql.includes('return_id')
if (roHasReturnId) {
  console.log('  · return_order 已是新版 schema，跳過')
} else {
  console.log('  → 重建 return_order（PK 改 return_id autoincrement）...')
  db.transaction(() => {
    db.exec(`
      CREATE TABLE return_order_new (
        return_id        INTEGER PRIMARY KEY AUTOINCREMENT,
        po_id            INTEGER NOT NULL,
        ingredient_name  TEXT    NOT NULL,
        return_date      TEXT    NOT NULL,
        return_reason    TEXT,
        return_qty       REAL    NOT NULL,
        FOREIGN KEY (po_id, ingredient_name)
            REFERENCES purchase_order_item(po_id, ingredient_name)
            ON UPDATE CASCADE ON DELETE CASCADE
      );
      INSERT INTO return_order_new (po_id, ingredient_name, return_date, return_reason, return_qty)
      SELECT po_id, ingredient_name, return_date, return_reason, return_qty FROM return_order;
      DROP TABLE return_order;
      ALTER TABLE return_order_new RENAME TO return_order;
      CREATE INDEX IF NOT EXISTS idx_return_po ON return_order(po_id);
      CREATE INDEX IF NOT EXISTS idx_return_po_ing ON return_order(po_id, ingredient_name);
    `)
  })()
  console.log('  ✓ return_order 完成')
}

db.pragma('foreign_keys = ON')

// 驗證
const fkCheck = db.prepare('PRAGMA foreign_key_check').all()
if (fkCheck.length > 0) {
  console.warn('  ⚠ 發現 FK violations:', fkCheck)
} else {
  console.log('  · FK 完整性檢查通過')
}

console.log('\n完成')
db.close()
