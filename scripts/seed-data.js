// scripts/seed-data.js
// 金濠客 POS 系統 — 預設 seed 資料 + 寫入邏輯
//
// 設計：
//   - 每張表都做 COUNT 檢查，只在空表時插入（idempotent）
//   - menu_item 用 name 查回 item_id 再 seed recipe（不依賴 AUTOINCREMENT 順序）
//   - 可被 scripts/init-db.js 或 lib/db.ts 呼叫
//
// 使用：
//   const { seedAll } = require('./seed-data')
//   seedAll(db)   // db 是 better-sqlite3 instance

const SUPPLIERS = [
  { name: '海鮮批發工', phone: '05-2200001' },
  { name: '肉品大王',   phone: '05-2200002' },
  { name: '大成肉品',   phone: '05-2200003' },
  { name: '糧油行',     phone: '05-2200004' },
  { name: '蔬果行',     phone: '05-2200005' },
]

// ingredient: [name, stock_qty, safety_stock, stock_unit, order_unit, qty_per_order_unit, supplier_name]
const INGREDIENTS = [
  ['魚排',       30, 15, '片',   '箱', 60, '海鮮批發工'],
  ['豬排',       45, 20, '片',   '箱', 60, '肉品大王'],
  ['帶骨排骨',   32, 15, '片',   '箱', 65, '大成肉品'],
  ['紅麴豬',     28, 15, '份',   '包', 20, '肉品大王'],
  ['炸排骨',     8,  10, '份',   '包', 15, '大成肉品'],
  ['鱸雞腿',     22, 10, '隻',   '包', 10, '肉品大王'],
  ['蘇嫩雞腿',   15, 10, '隻',   '包', 15, '大成肉品'],
  ['牛肉',       60, 30, 'kg',   '包', 2,  '肉品大王'],
  ['豬肉',       50, 30, 'kg',   '包', 2,  '肉品大王'],
  ['沙茶雞',     6,  4,  'kg',   '盒', 1,  '肉品大王'],
  ['白米',       80, 30, '公斤', '包', 25, '糧油行'],
  ['高麗菜',     30, 8,  '顆',   '箱', 10, '蔬果行'],
]

// menu_item: { name, category, price, emoji, tag, sub, option, description }
// item_id 由 AUTOINCREMENT 自動產生，recipe 透過 name → item_id 對應
const MENU_ITEMS = [
  // 便當
  { name: '大比目魚排便當',  category: '手作便當', price: 130, emoji: '🐟', tag: '魚',   sub: '扁鱈',         option: '',                description: '扁鱈魚排配三樣配菜' },
  { name: '酥炸豬排便當',    category: '手作便當', price: 130, emoji: '🐷', tag: '豬',   sub: '',             option: '',                description: '酥炸厚切豬排配三樣配菜' },
  { name: '酥嫩雞腿便當',    category: '手作便當', price: 130, emoji: '🍗', tag: '雞',   sub: '',             option: '',                description: '酥嫩雞腿配三樣配菜' },
  { name: '紅麴豬五花便當',  category: '手作便當', price: 120, emoji: '🐷', tag: '豬',   sub: '',             option: '',                description: '紅麴豬五花配三樣配菜' },
  { name: '酥炸排骨便當',    category: '手作便當', price: 100, emoji: '🐷', tag: '豬',   sub: '無骨',         option: '',                description: '無骨酥炸排骨配三樣配菜' },
  { name: '滷豬腳便當',      category: '手作便當', price: 100, emoji: '🐷', tag: '豬',   sub: '',             option: '',                description: '滷豬腳配三樣配菜' },
  { name: '滷雞腿便當',      category: '手作便當', price: 100, emoji: '🍗', tag: '雞',   sub: '',             option: '',                description: '滷雞腿配三樣配菜' },
  { name: '滷排骨便當',      category: '手作便當', price: 100, emoji: '🥚', tag: '豬',   sub: '帶骨·附滷蛋',  option: '',                description: '帶骨滷排骨附滷蛋配三樣配菜' },

  // 燴飯
  { name: '沙茶牛肉燴飯',    category: '燴飯',     price: 110, emoji: '🥩', tag: '牛',   sub: '',             option: '加肉60 / 加菜10', description: '沙茶牛肉' },
  { name: '沙茶雞柳燴飯',    category: '燴飯',     price: 110, emoji: '🍗', tag: '雞',   sub: '',             option: '加肉60 / 加菜10', description: '沙茶雞柳' },
  { name: '沙茶豬肉燴飯',    category: '燴飯',     price: 100, emoji: '🐷', tag: '豬',   sub: '',             option: '加肉50 / 加菜10', description: '沙茶豬肉' },

  // 單點
  { name: '大比目魚排',      category: '單點',     price: 100, emoji: '🐟', tag: '魚',   sub: '扁鱈',         option: '',                description: '扁鱈魚排' },
  { name: '酥炸豬排',        category: '單點',     price: 100, emoji: '🐷', tag: '豬',   sub: '',             option: '',                description: '酥炸厚切豬排' },
  { name: '酥嫩雞腿',        category: '單點',     price: 100, emoji: '🍗', tag: '雞',   sub: '',             option: '',                description: '酥嫩雞腿' },
  { name: '紅麴豬五花',      category: '單點',     price: 90,  emoji: '🐷', tag: '豬',   sub: '',             option: '',                description: '紅麴豬五花' },
  { name: '沙茶燴牛肉',      category: '單點',     price: 90,  emoji: '🥩', tag: '牛',   sub: '',             option: '加肉60 / 加菜10', description: '沙茶燴牛肉' },
  { name: '滷排骨',          category: '單點',     price: 80,  emoji: '🐷', tag: '豬',   sub: '二片',         option: '',                description: '二片' },
  { name: '沙茶燴豬肉',      category: '單點',     price: 80,  emoji: '🐷', tag: '豬',   sub: '',             option: '加肉50 / 加菜10', description: '沙茶燴豬肉' },
  { name: '酥炸排骨',        category: '單點',     price: 70,  emoji: '🐷', tag: '豬',   sub: '無骨',         option: '',                description: '無骨' },
  { name: '滷雞腿',          category: '單點',     price: 70,  emoji: '🍗', tag: '雞',   sub: '',             option: '',                description: '滷雞腿' },
  { name: '季節炒時蔬',      category: '單點',     price: 60,  emoji: '🥬', tag: '其他', sub: '',             option: '',                description: '時令蔬菜' },
  { name: '白飯',            category: '單點',     price: 20,  emoji: '🍚', tag: '其他', sub: '',             option: '',                description: '白飯' },
  { name: '滷蛋',            category: '單點',     price: 15,  emoji: '🥚', tag: '其他', sub: '',             option: '',                description: '滷蛋' },
  { name: '加購湯品',        category: '單點',     price: 10,  emoji: '🍜', tag: '其他', sub: '',             option: '',                description: '例湯' },
  { name: '加購菜脯',        category: '單點',     price: 5,   emoji: '🥢', tag: '其他', sub: '原味/辣味',    option: '',                description: '原味/辣味' },
]

// recipe: [menu_name, ingredient_name, consume_qty]
//   menu_name 用來查 item_id（避開 AUTOINCREMENT 順序問題）
const RECIPES = [
  // 便當
  ['大比目魚排便當',  '魚排',     1],
  ['大比目魚排便當',  '白米',     0.3],
  ['酥炸豬排便當',    '豬排',     1],
  ['酥炸豬排便當',    '白米',     0.3],
  ['酥嫩雞腿便當',    '鱸雞腿',   1],
  ['酥嫩雞腿便當',    '白米',     0.3],
  ['紅麴豬五花便當',  '紅麴豬',   1],
  ['紅麴豬五花便當',  '白米',     0.3],
  ['酥炸排骨便當',    '炸排骨',   1],
  ['酥炸排骨便當',    '白米',     0.3],
  ['滷豬腳便當',      '帶骨排骨', 1],
  ['滷豬腳便當',      '白米',     0.3],
  ['滷雞腿便當',      '蘇嫩雞腿', 1],
  ['滷雞腿便當',      '白米',     0.3],
  ['滷排骨便當',      '帶骨排骨', 1],
  ['滷排骨便當',      '白米',     0.3],

  // 燴飯
  ['沙茶牛肉燴飯', '牛肉',   0.2],
  ['沙茶牛肉燴飯', '白米',   0.3],
  ['沙茶雞柳燴飯', '沙茶雞', 0.15],
  ['沙茶雞柳燴飯', '白米',   0.3],
  ['沙茶豬肉燴飯', '豬肉',   0.2],
  ['沙茶豬肉燴飯', '白米',   0.3],
]

// delivery_customer: { phone, name, address }
const DELIVERY_CUSTOMERS = [
  { phone: '0912-345-678', name: '王小明', address: '台北市大安區新生南路一段' },
  { phone: '0933-456-789', name: '陳小美', address: '新北市板橋區中山路' },
  { phone: '0944-567-890', name: '張小華', address: '台北市信義區基隆路' },
]

/**
 * 檢查 table 是否為空
 */
function isEmpty(db, table) {
  // table 已含 quote（如 "order"）或一般識別字
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get()
  return row.c === 0
}

/**
 * 寫入所有 seed 資料（idempotent — 每張表獨立檢查）
 */
function seedAll(db) {
  const log = (msg) => console.log(`[seed] ${msg}`)

  const tx = db.transaction(() => {
    // 1) supplier
    if (isEmpty(db, 'supplier')) {
      const stmt = db.prepare('INSERT INTO supplier (name, phone) VALUES (?, ?)')
      for (const s of SUPPLIERS) stmt.run(s.name, s.phone)
      log(`supplier  : 寫入 ${SUPPLIERS.length} 筆`)
    } else {
      log('supplier  : 已有資料，跳過')
    }

    // 2) ingredient（依賴 supplier）
    if (isEmpty(db, 'ingredient')) {
      const stmt = db.prepare(`
        INSERT INTO ingredient (name, stock_qty, safety_stock, stock_unit, order_unit, qty_per_order_unit, supplier_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const ing of INGREDIENTS) stmt.run(...ing)
      log(`ingredient: 寫入 ${INGREDIENTS.length} 筆`)
    } else {
      log('ingredient: 已有資料，跳過')
    }

    // 3) menu_item
    if (isEmpty(db, 'menu_item')) {
      const stmt = db.prepare(`
        INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const m of MENU_ITEMS) {
        stmt.run(m.name, m.category, m.price, m.emoji, m.tag, m.sub, m.option, m.description)
      }
      log(`menu_item : 寫入 ${MENU_ITEMS.length} 筆`)
    } else {
      log('menu_item : 已有資料，跳過')
    }

    // 4) recipe（依賴 menu_item + ingredient）
    if (isEmpty(db, 'recipe')) {
      // 透過 name 查回 item_id
      const idByName = new Map()
      const rows = db.prepare('SELECT item_id, name FROM menu_item').all()
      for (const r of rows) idByName.set(r.name, r.item_id)

      const stmt = db.prepare(`
        INSERT INTO recipe (item_id, ingredient_name, consume_qty) VALUES (?, ?, ?)
      `)
      let inserted = 0
      for (const [menuName, ingName, qty] of RECIPES) {
        const itemId = idByName.get(menuName)
        if (!itemId) {
          console.warn(`[seed] ⚠️  找不到 menu_item: ${menuName}，略過此 recipe`)
          continue
        }
        stmt.run(itemId, ingName, qty)
        inserted++
      }
      log(`recipe    : 寫入 ${inserted} 筆`)
    } else {
      log('recipe    : 已有資料，跳過')
    }

    // 5) delivery_customer（無依賴）
    if (isEmpty(db, 'delivery_customer')) {
      const stmt = db.prepare(`
        INSERT INTO delivery_customer (phone, name, address) VALUES (?, ?, ?)
      `)
      for (const c of DELIVERY_CUSTOMERS) stmt.run(c.phone, c.name, c.address)
      log(`delivery_customer: 寫入 ${DELIVERY_CUSTOMERS.length} 筆`)
    } else {
      log('delivery_customer: 已有資料，跳過')
    }

    // 注意：訂單 / 進貨單範例資料故意不 seed
    //   - 新環境不需要假訂單（會干擾真實資料）
    //   - 若要本機示範資料，請另外手動插入
  })

  tx()
}

module.exports = {
  seedAll,
  SUPPLIERS,
  INGREDIENTS,
  MENU_ITEMS,
  RECIPES,
  DELIVERY_CUSTOMERS,
}
