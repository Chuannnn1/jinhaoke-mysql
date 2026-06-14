// scripts/seed-multi-supplier.js
// 把現有 5 個廠商 rename 成「姓氏+老闆」，並補上 ingredient_supplier 的 mock 資料。
// 老闆說：店家規模小，肉類會分廠商叫（牛肉 3 家、豬肉系 2~3 家），
// 所以這裡為每個食材建立 1 個 primary + 0~2 個 alt 廠商。
//
// 跑法：先停 dev server，然後 `node scripts/seed-multi-supplier.js`
// Idempotent：重複跑不會出錯，rename 已完成的會 no-op，INSERT 使用 OR IGNORE。

const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

const DB_PATH = path.join(__dirname, '..', 'data', 'jinhaoke.db')
const SCHEMA_PATH = path.join(__dirname, '..', 'lib', 'schema.sql')

if (!fs.existsSync(DB_PATH)) {
  console.error('找不到 DB：', DB_PATH)
  process.exit(1)
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// 確保 ingredient_supplier 表存在（執行 schema 是 idempotent 的）
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'))

// ──────────────────────────────────────────────────────────
// 1. rename 現有 5 個廠商 為「姓氏 + 老闆」
//    (supplier.name 是 PK + 多個 FK 透過 ON UPDATE CASCADE 會自動 propagate)
// ──────────────────────────────────────────────────────────
const RENAMES = [
  { from: '海鮮批發工', to: '黃老闆' },
  { from: '肉品大王',   to: '王老闆' },
  { from: '大成肉品',   to: '陳老闆' },
  { from: '糧油行',     to: '周老闆' },
  { from: '蔬果行',     to: '蘇老闆' },
]

const updateSupplier = db.prepare(`
  UPDATE supplier SET name = ? WHERE name = ? AND NOT EXISTS (
    SELECT 1 FROM supplier WHERE name = ?
  )
`)

for (const { from, to } of RENAMES) {
  const r = updateSupplier.run(to, from, to)
  if (r.changes > 0) console.log(`  ✓ rename: ${from} → ${to}`)
}

// ──────────────────────────────────────────────────────────
// 2. 新增其餘老闆（豬肉備援 / 牛肉專營）
// ──────────────────────────────────────────────────────────
const NEW_SUPPLIERS = [
  { name: '林老闆', phone: '05-2200010' }, // 豬肉備援
  { name: '謝老闆', phone: '05-2200011' }, // 牛肉
]

const insertSupplier = db.prepare(
  `INSERT OR IGNORE INTO supplier (name, phone) VALUES (?, ?)`
)
for (const s of NEW_SUPPLIERS) {
  const r = insertSupplier.run(s.name, s.phone)
  if (r.changes > 0) console.log(`  ✓ add supplier: ${s.name} (${s.phone})`)
}

// ──────────────────────────────────────────────────────────
// 3. ingredient_supplier mock — 每食材 primary + alt list
//    參考價格 (price_per_order_unit) 純 mock，方便之後估價/比價。
// ──────────────────────────────────────────────────────────
const ING_SUP_MAP = {
  // 豬肉系：2~3 家
  '豬排':     [{ s: '王老闆', primary: 1, price: 280 }, { s: '林老闆', primary: 0, price: 270 }],
  '紅麴豬':   [{ s: '王老闆', primary: 1, price: 320 }, { s: '林老闆', primary: 0, price: 305 }],
  '帶骨排骨': [{ s: '陳老闆', primary: 1, price: 260 }, { s: '王老闆', primary: 0, price: 275 }, { s: '林老闆', primary: 0, price: 250 }],
  '炸排骨':   [{ s: '陳老闆', primary: 1, price: 220 }, { s: '王老闆', primary: 0, price: 230 }, { s: '林老闆', primary: 0, price: 215 }],
  '豬肉':     [{ s: '王老闆', primary: 1, price: 240 }, { s: '林老闆', primary: 0, price: 230 }, { s: '陳老闆', primary: 0, price: 245 }],

  // 雞肉系：2 家
  '沙茶雞':   [{ s: '王老闆', primary: 1, price: 180 }, { s: '陳老闆', primary: 0, price: 175 }],
  '滷雞腿':   [{ s: '陳老闆', primary: 1, price: 60  }, { s: '王老闆', primary: 0, price: 62  }],
  '酥嫩雞腿': [{ s: '王老闆', primary: 1, price: 65  }, { s: '陳老闆', primary: 0, price: 63  }],

  // 牛肉：3 家
  '牛肉':     [{ s: '王老闆', primary: 1, price: 480 }, { s: '謝老闆', primary: 0, price: 460 }, { s: '陳老闆', primary: 0, price: 490 }],

  // 海鮮、蔬果、米：1 家
  '魚排':     [{ s: '黃老闆', primary: 1, price: 380 }],
  '高麗菜':   [{ s: '蘇老闆', primary: 1, price: 35  }],
  '白米':     [{ s: '周老闆', primary: 1, price: 920 }],
}

const insertIngSup = db.prepare(`
  INSERT OR IGNORE INTO ingredient_supplier
    (ingredient_name, supplier_name, is_primary, price_per_order_unit)
  VALUES (?, ?, ?, ?)
`)
const updateIngSupPrice = db.prepare(`
  UPDATE ingredient_supplier
  SET is_primary = ?, price_per_order_unit = ?
  WHERE ingredient_name = ? AND supplier_name = ?
`)
const ingredients = db.prepare('SELECT name FROM ingredient').all().map(r => r.name)

let addedRows = 0
let updatedRows = 0
db.transaction(() => {
  for (const [ing, rows] of Object.entries(ING_SUP_MAP)) {
    if (!ingredients.includes(ing)) {
      console.warn(`  ⚠ skip: ingredient "${ing}" 不存在於 DB`)
      continue
    }
    for (const r of rows) {
      const ins = insertIngSup.run(ing, r.s, r.primary, r.price)
      if (ins.changes > 0) addedRows++
      else {
        const upd = updateIngSupPrice.run(r.primary, r.price, ing, r.s)
        if (upd.changes > 0) updatedRows++
      }
    }
  }

  // 同步 ingredient.supplier_name → 跟著 primary 走（讓既有 auto-generate 也吃得到新名）
  const setPrimary = db.prepare(`
    UPDATE ingredient
    SET supplier_name = (
      SELECT supplier_name FROM ingredient_supplier
      WHERE ingredient_name = ingredient.name AND is_primary = 1
      LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM ingredient_supplier
      WHERE ingredient_name = ingredient.name AND is_primary = 1
    )
  `)
  const r = setPrimary.run()
  console.log(`  ✓ ingredient.supplier_name 同步 primary：${r.changes} 筆`)
})()

console.log(`\n完成：ingredient_supplier 新增 ${addedRows} 筆、更新 ${updatedRows} 筆。`)

// 最後 dump 一下狀態方便檢查
const summary = db.prepare(`
  SELECT i.name AS ingredient,
         GROUP_CONCAT(s.supplier_name || (CASE WHEN s.is_primary=1 THEN '*' ELSE '' END), ' / ') AS suppliers
  FROM ingredient i
  LEFT JOIN ingredient_supplier s ON s.ingredient_name = i.name
  GROUP BY i.name
  ORDER BY i.name
`).all()
console.log('\n── 食材 → 廠商 (★ = primary) ──')
for (const row of summary) {
  console.log(`  ${row.ingredient}: ${row.suppliers ?? '（無）'}`)
}

db.close()
