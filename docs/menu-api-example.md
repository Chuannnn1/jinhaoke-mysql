# Menu API 完整範例（TypeScript）

> 本檔案為 `app/api/menu/route.ts` 的完整實作，供組員參考。

## 檔案位置

```
jinhaoker-pos/
└── app/api/menu/route.ts    ← 實作檔
```

## 完整程式碼

```typescript
// app/api/menu/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// ============================================================
// GET /api/menu — 查詢全部（可依分類篩選）
// ============================================================
export async function GET(req: Request) {
  try {
    const db = getDb()
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') // optional: ?category=主食

    let sql = 'SELECT * FROM menu_item WHERE is_active = 1 ORDER BY sort_order ASC, item_id ASC'
    const params: any[] = []

    if (category) {
      sql = 'SELECT * FROM menu_item WHERE is_active = 1 AND category = ? ORDER BY sort_order ASC, item_id ASC'
      params.push(category)
    }

    const menu = db.prepare(sql).all(...params)
    return NextResponse.json({ success: true, data: menu })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

// ============================================================
// POST /api/menu — 新增品項
// ============================================================
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, category, price, description, is_active, stock_qty } = body

    // 1. 參數驗證（缺少必填就回 400）
    if (!name || !category || price === undefined) {
      return NextResponse.json(
        { success: false, error: 'name、category、price 為必填欄位' },
        { status: 400 }
      )
    }

    // 2. 操作資料庫（INSERT）
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO menu_item (name, category, price, description, is_active, stock_qty, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
    `)
    const result = stmt.run(
      name,
      category,
      price,
      description ?? '',
      is_active ?? 1,
      stock_qty ?? 0
    )

    // 3. 回傳新建立的資料（包含自動產生的 item_id）
    const newItem = db.prepare('SELECT * FROM menu_item WHERE item_id = ?').get(result.lastInsertRowid)
    return NextResponse.json({ success: true, data: newItem }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
```

## curl 測試指令

```bash
# 查詢全部
curl http://localhost:3100/api/menu

# 依分類查詢
curl "http://localhost:3100/api/menu?category=主食"

# 新增品項
curl -X POST http://localhost:3100/api/menu \
  -H "Content-Type: application/json" \
  -d '{
    "name": "牛肉麵",
    "category": "主食",
    "price": 120,
    "description": "紅燒湯頭",
    "is_active": 1,
    "stock_qty": 50
  }'
```

## lib/db.ts 必須長這樣

```typescript
// lib/db.ts
import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'jinhaoker.db')

export function getDb() {
  return new Database(DB_PATH)
}
```

## 對照 SQL Schema（menu_item 表格）

```sql
CREATE TABLE menu_item (
  item_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  price           REAL    NOT NULL,
  description     TEXT    DEFAULT '',
  is_active       INTEGER DEFAULT 1,    -- 1=上架中, 0=已下架
  stock_qty       INTEGER DEFAULT 0,   -- 庫存數量
  low_stock_threshold INTEGER DEFAULT 10,
  sort_order      INTEGER DEFAULT 0,
  created_at      TEXT    DEFAULT (datetime('now', '+8 hours')),
  updated_at      TEXT    DEFAULT (datetime('now', '+8 hours'))
);
```