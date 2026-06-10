// scripts/migrate-fix-chicken-leg-skus.js
// 修正雞腿食材命名錯字：鱸雞腿 → 酥嫩雞腿；蘇嫩雞腿 → 滷雞腿
// FK ON UPDATE CASCADE 會自動同步 recipe / purchase_order_item 的 ingredient_name
// 同時補回單點 14 酥嫩雞腿 / 20 滷雞腿 的 recipe
const path = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(__dirname, '..', 'data', 'jinhaoke.db')
const db = new Database(dbPath)

const hasIng = (name) =>
  !!db.prepare('SELECT 1 FROM ingredient WHERE name = ?').get(name)

const tx = db.transaction(() => {
  // 1. 鱸雞腿 → 酥嫩雞腿（透過 placeholder 避免和目標名稱衝突）
  if (hasIng('鱸雞腿')) {
    db.prepare(`UPDATE ingredient SET name = '__tmp_chicken_a' WHERE name = '鱸雞腿'`).run()
  }
  // 2. 蘇嫩雞腿 → 滷雞腿
  if (hasIng('蘇嫩雞腿')) {
    db.prepare(`UPDATE ingredient SET name = '滷雞腿' WHERE name = '蘇嫩雞腿'`).run()
  }
  if (hasIng('__tmp_chicken_a')) {
    db.prepare(`UPDATE ingredient SET name = '酥嫩雞腿' WHERE name = '__tmp_chicken_a'`).run()
  }

  // 3. 補回單點 14 / 20 的 recipe（idempotent）
  const insertRecipe = db.prepare(
    'INSERT OR IGNORE INTO recipe (item_id, ingredient_name, consume_qty) VALUES (?, ?, ?)'
  )
  const itemId = (name) => {
    const row = db.prepare('SELECT item_id FROM menu_item WHERE name = ?').get(name)
    return row?.item_id
  }
  const id14 = itemId('酥嫩雞腿')
  const id20 = itemId('滷雞腿')
  if (id14 && hasIng('酥嫩雞腿')) insertRecipe.run(id14, '酥嫩雞腿', 1)
  if (id20 && hasIng('滷雞腿')) insertRecipe.run(id20, '滷雞腿', 1)
})
tx()

console.log('[migrate-fix-chicken-leg-skus] done')
db.close()
