# TypeScript API Building Tutorial

> 適用對象：需要實作後端 API 的組員  
> 必備能力：JavaScript 基礎、了解 SQL 是什麼  
> 更新日期：2026-05-27  
> 技術棧：Next.js 14 API Routes + TypeScript + SQLite（better-sqlite3）

---

## 1. 這個教程要教你做什麼

看完之後，你能自己實作任意一支 API。  
以現有的 `/api/menu/route.ts` 當模板，實作另外 18 支還沒寫的 API。

---

## 2. 專案現況

```
app/api/                      已實作              待實作
─────────────────────────────────────────────────────────
menu/route.ts                 GET ✅ POST ✅
menu/[id]/route.ts            GET ✅ PUT ✅ DELETE ✅
orders/route.ts               GET ✅ POST ✅
orders/status/route.ts                          PATCH ✅（其他 API 待實作）
inventory/route.ts                               GET POST
purchase-orders/route.ts                        GET POST PUT DELETE
purchase-orders/[id]/receive                    POST（驗貨入庫）
purchase-orders/auto-restock                     POST（一鍵補貨）
suppliers/route.ts                              GET POST PUT DELETE
ingredients/route.ts                            GET POST PUT DELETE
reports/daily                                   GET
reports/monthly                                 GET
─────────────────────────────────────────────────────────
                                            共 18 支待實作
```

---

## 3. API 統一規格

所有 API 的**規格都是同一套**，記住這個格式：

```
請求：Content-Type: application/json
回應：{ success: true/false, data?: ..., error?: string }
成功：200（查詢/修改）| 201（新增）
失敗：400（參數錯誤）| 404（找不到）| 500（伺服器錯誤）
```

---

## 4. 資料庫連線（lib/db.ts）

所有 API 的底層都是這個：

```typescript
// lib/db.ts
import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'jinhaoke.db')

export function getDb() {
  return new Database(DB_PATH)
}
```

> `process.cwd()` = 專案根目錄，`data/jinhaoke.db` 就是 SQLite 檔案位置。  
> 每次 API call 都 `new Database()` 是正常的，SQLite 會處理連線池。

---

## 5. API Route 標準模板

每支 `app/api/xxx/route.ts` 都長這樣：

```typescript
// app/api/xxx/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// ============================================================
// 共用型別（每支檔案幾乎都長這樣）
// ============================================================
interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/xxx — 查詢
// ============================================================
export async function GET(req: Request) {
  try {
    const db = getDb()
    const { searchParams } = new URL(req.url)

    // 從 ?key=value 取參數
    const name = searchParams.get('name')

    let sql = `SELECT * FROM xxx`
    const params: (string | number)[] = []

    if (name) {
      sql += ` WHERE name = ?`
      params.push(name)
    }

    const rows = db.prepare(sql).all(...params)
    return NextResponse.json<ApiResponse>({ success: true, data: rows })

  } catch (err) {
    console.error('[GET /api/xxx]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/xxx — 新增
// ============================================================
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const db = getDb()

    // 1. 參數驗證（必填欄位）
    if (!body.name) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'name 為必填欄位' },
        { status: 400 }
      )
    }

    // 2. 寫入
    const stmt = db.prepare(`INSERT INTO xxx (name) VALUES (?)`)
    const result = stmt.run(body.name)

    // 3. 回傳新建立的資料
    const newRow = db.prepare(`SELECT * FROM xxx WHERE id = ?`).get(result.lastInsertRowid)

    return NextResponse.json<ApiResponse>(
      { success: true, data: newRow },
      { status: 201 }
    )

  } catch (err) {
    console.error('[POST /api/xxx]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

---

## 6. 動手實作庫存 API

### 需求：`GET /api/inventory` + `POST /api/inventory`

**先看 schema**（`lib/schema.sql`）：

```sql
CREATE TABLE ingredient (
  name TEXT PRIMARY KEY,      -- 食材名稱（PK）
  stock_qty REAL DEFAULT 0,    -- 庫存數量
  safety_stock REAL DEFAULT 0,-- 安全存量
  stock_unit TEXT,             -- 庫存單位（斤、公斤）
  order_unit TEXT,             -- 叫貨單位（箱、包）
  qty_per_order_unit REAL,     -- 每單位含多少 stock_unit
  supplier_name TEXT
);
```

**實作：**

```typescript
// app/api/inventory/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function GET(req: Request) {
  try {
    const db = getDb()
    const { searchParams } = new URL(req.url)
    const lowStock = searchParams.get('low_stock') // ?low_stock=true

    let sql = `
      SELECT i.name, i.stock_qty, i.safety_stock,
             i.stock_unit, i.order_unit, i.qty_per_order_unit,
             s.name as supplier_name
      FROM ingredient i
      LEFT JOIN supplier s ON i.supplier_name = s.name
    `
    const params: string[] = []

    if (lowStock === 'true') {
      sql += ` WHERE i.stock_qty < i.safety_stock`
    }

    sql += ` ORDER BY i.name`

    const rows = db.prepare(sql).all(...params)
    return NextResponse.json<ApiResponse>({ success: true, data: rows })

  } catch (err) {
    console.error('[GET /api/inventory]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const db = getDb()

    if (!body.name) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'name 為必填欄位' },
        { status: 400 }
      )
    }

    const stmt = db.prepare(`
      INSERT INTO ingredient (name, stock_qty, safety_stock, stock_unit, order_unit, qty_per_order_unit, supplier_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      body.name,
      body.stock_qty ?? 0,
      body.safety_stock ?? 0,
      body.stock_unit ?? '斤',
      body.order_unit ?? '箱',
      body.qty_per_order_unit ?? 10,
      body.supplier_name ?? null
    )

    const newRow = db.prepare(`SELECT * FROM ingredient WHERE name = ?`).get(body.name)

    return NextResponse.json<ApiResponse>(
      { success: true, data: newRow },
      { status: 201 }
    )

  } catch (err) {
    console.error('[POST /api/inventory]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

---

## 7. 實作 suppliers API（CRUD）

```typescript
// app/api/suppliers/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare(`SELECT * FROM supplier ORDER BY name`).all()
    return NextResponse.json<ApiResponse>({ success: true, data: rows })
  } catch (err) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.name) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'name 為必填欄位' },
        { status: 400 }
      )
    }

    const db = getDb()
    db.prepare(`INSERT INTO supplier (name, phone) VALUES (?, ?)`)
      .run(body.name, body.phone ?? null)

    return NextResponse.json<ApiResponse>(
      { success: true, data: { name: body.name } },
      { status: 201 }
    )
  } catch (err) {
    console.error('[POST /api/suppliers]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

```typescript
// app/api/suppliers/[name]/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface ApiResponse {
  success: boolean
  error?: string
}

export async function GET(req: Request, { params }: { params: { name: string } }) {
  try {
    const db = getDb()
    const row = db.prepare(`SELECT * FROM supplier WHERE name = ?`).get(params.name)
    if (!row) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該供應商' },
        { status: 404 }
      )
    }
    return NextResponse.json<ApiResponse>({ success: true, data: row })
  } catch (err) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

export async function PUT(req: Request, { params }: { params: { name: string } }) {
  try {
    const body = await req.json()
    const db = getDb()

    const existing = db.prepare(`SELECT * FROM supplier WHERE name = ?`).get(params.name)
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該供應商' },
        { status: 404 }
      )
    }

    db.prepare(`UPDATE supplier SET phone = ? WHERE name = ?`)
      .run(body.phone ?? null, params.name)

    return NextResponse.json<ApiResponse>({ success: true })
  } catch (err) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request, { params }: { params: { name: string } }) {
  try {
    const db = getDb()
    db.prepare(`DELETE FROM supplier WHERE name = ?`).run(params.name)
    return NextResponse.json<ApiResponse>({ success: true })
  } catch (err) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

> **注意**：`params` 在 Next.js 14 是同步的 `{ params }`，不用 `await`。

---

## 8. 實作 purchase-orders（進貨單）

**看 schema：**

```sql
CREATE TABLE purchase_order (
  po_id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name TEXT,       -- FK → supplier.name
  status TEXT DEFAULT 'pending', -- pending / received
  created_at TEXT,
  total_cost REAL DEFAULT 0
);

CREATE TABLE purchase_order_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER,            -- FK → purchase_order.po_id
  ingredient_name TEXT,      -- FK → ingredient.name
  order_qty REAL,           -- 叫貨數量（order_unit）
  unit_cost REAL,
  received_qty REAL DEFAULT 0
);
```

**重點觀念：跨表寫入要用 transaction（還沒做到這步，先知道這個）**

```typescript
// app/api/purchase-orders/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function GET() {
  try {
    const db = getDb()
    const orders = db.prepare(`
      SELECT po.*, s.name as supplier_name
      FROM purchase_order po
      LEFT JOIN supplier s ON po.supplier_name = s.name
      ORDER BY po.created_at DESC
    `).all()

    // 順便撈 items
    const items = db.prepare(`SELECT * FROM purchase_order_item`).all()

    const result = orders.map(order => ({
      ...order,
      items: items.filter(i => i.po_id === order.po_id),
    }))

    return NextResponse.json<ApiResponse>({ success: true, data: result })
  } catch (err) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const db = getDb()

    if (!body.supplier_name || !body.items?.length) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'supplier_name 與 items 為必填' },
        { status: 400 }
      )
    }

    // 計算總成本
    const totalCost = body.items.reduce(
      (sum: number, i: { order_qty: number; unit_cost: number }) =>
        sum + i.order_qty * i.unit_cost,
      0
    )

    // 新增進貨單
    const poResult = db.prepare(`
      INSERT INTO purchase_order (supplier_name, total_cost)
      VALUES (?, ?)
    `).run(body.supplier_name, totalCost)

    const poId = poResult.lastInsertRowid

    // 新增進貨項目
    const itemStmt = db.prepare(`
      INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, unit_cost)
      VALUES (?, ?, ?, ?)
    `)

    for (const item of body.items) {
      itemStmt.run(poId, item.ingredient_name, item.order_qty, item.unit_cost)
    }

    return NextResponse.json<ApiResponse>(
      { success: true, data: { po_id: poId } },
      { status: 201 }
    )
  } catch (err) {
    console.error('[POST /api/purchase-orders]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

---

## 9. 實作 auto-restock（一鍵補貨）

當庫存低於安全存量，自動產生進貨單：

```typescript
// app/api/purchase-orders/auto-restock/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { supplier_name } = body

    if (!supplier_name) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'supplier_name 為必填' },
        { status: 400 }
      )
    }

    const db = getDb()

    // 找出該供應商旗下、低於安全存量的食材
    const lowIngredients = db.prepare(`
      SELECT * FROM ingredient
      WHERE supplier_name = ? AND stock_qty < safety_stock
    `).all(supplier_name) as Array<{
      name: string
      stock_qty: number
      safety_stock: number
      order_unit: string
      qty_per_order_unit: number
    }>

    if (lowIngredients.length === 0) {
      return NextResponse.json<ApiResponse>({
        success: true,
        data: { po_id: null, items: [], message: '所有食材庫存充足' }
      })
    }

    // 計算每次補貨數量（一次補到安全存量 × 2）
    const items = lowIngredients.map(ing => {
      const qtyNeeded = (ing.safety_stock * 2) - ing.stock_qty
      const orderQty = Math.ceil(qtyNeeded / ing.qty_per_order_unit)
      return {
        ingredient_name: ing.name,
        order_qty: orderQty,
        unit_cost: 0, // 先填空，實際要有 unit_cost 欄位
      }
    }).filter(i => i.order_qty > 0)

    // 建立進貨單
    const poResult = db.prepare(`
      INSERT INTO purchase_order (supplier_name, total_cost)
      VALUES (?, 0)
    `).run(supplier_name)

    const poId = poResult.lastInsertRowid

    const insertItem = db.prepare(`
      INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, unit_cost)
      VALUES (?, ?, ?, ?)
    `)

    for (const item of items) {
      insertItem.run(poId, item.ingredient_name, item.order_qty, item.unit_cost)
    }

    return NextResponse.json<ApiResponse>(
      { success: true, data: { po_id: poId, items } },
      { status: 201 }
    )

  } catch (err) {
    console.error('[POST /api/purchase-orders/auto-restock]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

---

## 10. 用 curl 測試你的 API

啟動 `npm run dev` 之後，另開一個 terminal：

```bash
# -------- inventory --------
curl http://localhost:3100/api/inventory

curl "http://localhost:3100/api/inventory?low_stock=true"

curl -X POST http://localhost:3100/api/inventory \
  -H "Content-Type: application/json" \
  -d '{"name":"胭脂肉","stock_qty":5,"safety_stock":10,"stock_unit":"斤","order_unit":"箱","qty_per_order_unit":10,"supplier_name":"大園肉商"}'

# -------- suppliers --------
curl http://localhost:3100/api/suppliers

curl -X POST http://localhost:3100/api/suppliers \
  -H "Content-Type: application/json" \
  -d '{"name":"大園肉商","phone":"03-3861234"}'

# -------- purchase-orders --------
curl http://localhost:3100/api/purchase-orders

curl -X POST http://localhost:3100/api/purchase-orders \
  -H "Content-Type: application/json" \
  -d '{"supplier_name":"大園肉商","items":[{"ingredient_name":"胭脂肉","order_qty":2,"unit_cost":100}]}'

curl -X POST http://localhost:3100/api/purchase-orders/auto-restock \
  -H "Content-Type: application/json" \
  -d '{"supplier_name":"大園肉商"}'
```

---

## 11. 實作查詢類 API

```typescript
// app/api/ingredients/route.ts — GET + POST
export async function GET() {
  const db = getDb()
  const rows = db.prepare(`
    SELECT i.*, s.name as supplier_name
    FROM ingredient i
    LEFT JOIN supplier s ON i.supplier_name = s.name
    ORDER BY i.name
  `).all()
  return NextResponse.json<ApiResponse>({ success: true, data: rows })
}
```

```typescript
// app/api/reports/daily/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') // 格式：2026-05-27

  const db = getDb()
  const rows = db.prepare(`
    SELECT o.*, COUNT(oi.id) as item_count
    FROM "order" o
    LEFT JOIN order_item oi ON o.order_id = oi.order_id
    WHERE date(o.created_at) = ?
    GROUP BY o.order_id
    ORDER BY o.created_at DESC
  `).all(date || new Date().toISOString().split('T')[0])

  return NextResponse.json<ApiResponse>({ success: true, data: rows })
}
```

---

## 12. 實作數值扣庫存（出餐時）

當後台把訂單狀態改成 `done`，要從 `recipe` 查原料比例、扣庫存：

```typescript
// app/api/orders/status/route.ts 補充 logic
if (body.status === 'done') {
  // 取得該訂單的所有品項
  const orderItems = db.prepare(`
    SELECT oi.item_id, oi.quantity, r.ingredient_name, r.qty_per_unit
    FROM order_item oi
    JOIN recipe r ON oi.item_id = r.item_id
    WHERE oi.order_id = ?
  `).all(body.order_id) as Array<{
    item_id: number; quantity: number; ingredient_name: string; qty_per_unit: number
  }>

  // 扣除庫存
  const updateStock = db.prepare(`
    UPDATE ingredient SET stock_qty = stock_qty - ?
    WHERE name = ?
  `)

  for (const row of orderItems) {
    const consumed = row.quantity * row.qty_per_unit
    updateStock.run(consumed, row.ingredient_name)
  }
}
```

---

## 13. Pre-Ship Checklist（自己檢查）

每實作完一支 API，自己對照這個清單：

- [ ] 有 `try / catch`，catch 區塊有 `console.error` + 500 回應
- [ ] 必填參數有驗證，缺少時回 400
- [ ] 找不到資源時回 404
- [ ] 新增成功時回 201 + 回傳新建立的資料
- [ ] 用 `curl` 測試過（成功與失敗都要測）
- [ ] 如果要跨表寫入（同時寫入 2 張以上 table）→ 改用 transaction（目前先知道這件事）

---

## 14. 還沒實作的 18 支 API

```
庫存（2支）
  GET /api/inventory
  POST /api/inventory

供應商（4支）
  GET /api/suppliers
  POST /api/suppliers
  PUT /api/suppliers/[name]
  DELETE /api/suppliers/[name]

食材（4支）
  GET /api/ingredients
  POST /api/ingredients
  PUT /api/ingredients/[name]
  DELETE /api/ingredients/[name]

進貨單（6支）
  GET /api/purchase-orders
  POST /api/purchase-orders
  PUT /api/purchase-orders/[id]
  DELETE /api/purchase-orders/[id]
  POST /api/purchase-orders/auto-restock
  POST /api/purchase-orders/[id]/receive

報表（2支）
  GET /api/reports/daily
  GET /api/reports/monthly
```

---

## 15. 遇到問題時的思路

```
1. 跑不起來 → 先看 terminal 錯誤訊息
2. API 404   → 確認檔案路徑正確：app/api/xxx/route.ts
3. 資料沒進 DB → 先用 DBeaver 直接看 jinhaoke.db 有沒有資料
4. POST Body 取不到 → 確認 Content-Type: application/json
5. SQLite 錯誤 → 把 SQL 語法複製到 DBeaver 的 SQL Editor 直接跑一次
```