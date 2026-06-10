// scripts/migrate-add-single-item-recipes.js
// 補單點品項 (item_id 12-22) 的 recipe，這樣 PATCH 訂單→已完成 才會扣肉/白米庫存
// 設計：以 menu_item.name 反查 item_id（避免硬編 ID 對不上）；只在 recipe 尚未有對應 row 才插入
const path = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(__dirname, '..', 'data', 'jinhaoke.db')
const db = new Database(dbPath)

// (menu_item.name, ingredient_name, consume_qty)
// 略過：酥嫩雞腿 / 滷雞腿（雞腿 SKU 待釐清）/ 季節炒時蔬（高麗菜暫不追蹤）
const RECIPES = [
  ['大比目魚排',   '魚排',    1],
  ['酥炸豬排',     '豬排',    1],
  ['紅麴豬五花',   '紅麴豬',  1],
  ['沙茶燴牛肉',   '牛肉',    0.2],
  ['滷排骨',       '帶骨排骨', 1],
  ['沙茶燴豬肉',   '豬肉',    0.2],
  ['酥炸排骨',     '炸排骨',  1],
  ['白飯',         '白米',    0.3],
]

const findItem = db.prepare('SELECT item_id FROM menu_item WHERE name = ?')
const findRecipe = db.prepare(
  'SELECT 1 FROM recipe WHERE item_id = ? AND ingredient_name = ?'
)
const insertRecipe = db.prepare(
  'INSERT INTO recipe (item_id, ingredient_name, consume_qty) VALUES (?, ?, ?)'
)
const findIngredient = db.prepare('SELECT 1 FROM ingredient WHERE name = ?')

let added = 0
let skipped = 0
let missing = 0

const tx = db.transaction(() => {
  for (const [menuName, ingName, qty] of RECIPES) {
    const m = findItem.get(menuName)
    if (!m) {
      console.warn(`[skip] menu_item 找不到 "${menuName}"`)
      missing++
      continue
    }
    const ing = findIngredient.get(ingName)
    if (!ing) {
      console.warn(`[skip] ingredient 找不到 "${ingName}"`)
      missing++
      continue
    }
    if (findRecipe.get(m.item_id, ingName)) {
      skipped++
      continue
    }
    insertRecipe.run(m.item_id, ingName, qty)
    added++
  }
})
tx()

console.log(
  `[migrate-add-single-item-recipes] added=${added} skipped=${skipped} missing=${missing}`
)
db.close()
