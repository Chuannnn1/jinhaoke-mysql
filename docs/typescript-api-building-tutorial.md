# TypeScript API Building Tutorial

> 適用對象：需要實作或擴展後端 API 的開發者  
> 更新日期：2026-05-25  
> API 語言：TypeScript（.ts）| 框架：Next.js 14 API Routes | 資料庫：SQLite（better-sqlite3）  
> 必讀先修：[menu-api-example.md](menu-api-example.md)、[getting-started.md](getting-started.md)

---

## 前言：什麼是 API Routes？

Next.js 的 API Routes 是**在同一部 Next.js 伺服器上處理 HTTP 請求**的機制。

```
瀏覽器/前端
    │ fetch('/api/orders', { method: 'POST', body: ... })
    ▼
Next.js Server（在 VPS 的 3100 port）
    │
    ├── app/api/orders/route.ts  ← 你寫的程式碼在這裡
    │        │
    │        ▼
    │    lib/db.ts（better-sqlite3 連線）
    │        │
    │        ▼
    │    data/jinhaoke.db（SQLite 檔案）
    │
    └── 回傳 JSON
```

**特色：**
- 前端和 API 在同一個 port（3100），不需要分開架 Server
- 用 `route.ts` 副檔名區分 TypeScript（API 層）
- 用 `route.js` 副檔名代表 JavaScript（目前混用狀態）

---

## 1. 專案現況

```
app/api/
├── orders/
│   ├── route.js        ← JavaScript 版（舊）
│   └── status/
│       ├── route.js    ← JavaScript 版（舊）
│       └── route.ts    ← 【TypeScript 版】已實作 PATCH
├── menu/               ← 尚無 route.ts（待實作）
├── inventory/          ← 尚無（待實作）
└── purchase-orders/    ← 尚無（待實作）
```

`lib/db.js` 目前仍是 **JavaScript**，尚未升級成 `db.ts`（待辨）。

---

## 2. 核心觀念：為什麼要用 TypeScript？

TypeScript 的核心價值是**在開發階段就知道錯誤**，而不是等到使用者操作才爆開。

### 2.1 問題：JavaScript 的隱形錯誤

```javascript
// JS：不會報錯，直到 cart 內容不是你要的形狀
const { order_id, status } = await request.json()
db.prepare('UPDATE "order" SET status = ?').run(status, order_id)
// 如果前端傳了 { orderId: 'xxx', newStatus: 'done' } → 默默失敗
```

### 2.2 解決：TypeScript 的介面定義

```typescript
// 明確定義 request body 應該長什麼樣子
interface UpdateStatusBody {
  order_id: string
  status: string
}

export async function PATCH(request: Request) {
  const body: UpdateStatusBody = await request.json()
  // 現在 TS 知道：body.order_id 和 body.status 一定存在
  // 如果前端傳錯了 → 編譯階段就警告
}
```

### 2.3 好處

- VS Code 自動補全（IntelliSense）
- 錯誤在開發階段就出現
- 重構時有型別保護

---

## 3. lib/db.ts（資料庫連線）

> 這是所有 API 的底層。**目前仍是 JS 版**（`lib/db.js`），教學以 TS 版說明。

### 3.1 程式碼

```typescript
// lib/db.ts
import Database from 'better-sqlite3'
import path from 'path'

// 資料庫檔案位置：jinhaoke/data/jinhaoke.db
const DB_PATH = path.join(process.cwd(), 'data', 'jinhaoke.db')

export function getDb() {
  return new Database(DB_PATH)
}
```

### 3.2 觀念重點

| 觀念 | 說明 |
|------|------|
| `process.cwd()` | 取得 Node.js 啟動時的工作目錄（專案根目錄）|
| `better-sqlite3` | 同步 API，效能比 `sqlite3` 更好（不需 callback）|
| Singleton | 每次 request 都 `new Database()` 是正常行為，SQLite 會處理連線池 |
| `path.join` | 跨平台路徑拼接（Windows/Linux 相容）|

---

## 4. API Route 寫作模板

每個 API route 檔案（`app/api/xxx/route.ts`）都長這樣：

```typescript
// app/api/xxx/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// ============================================================
// 統一回應格式（所有 API 都長這樣）
// ============================================================
interface ApiResponse {
  success: boolean
  error?: string
  data?: any
}

// ============================================================
// GET /api/xxx — 查詢
// ============================================================
export async function GET(req: Request) {
  try {
    const db = getDb()
    // 1. 取得參數（可選）
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    // 2. 操作資料庫
    const result = db.prepare('SELECT * FROM xxx WHERE id = ?').get(id)

    // 3. 回傳
    return NextResponse.json<ApiResponse>({ success: true, data: result })
  } catch (err) {
    // 4. 錯誤處理：安全地回傳錯誤訊息
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
    // 驗證必填欄位
    if (!body.name) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'name 為必填欄位' },
        { status: 400 }
      )
    }
    const db = getDb()
    const stmt = db.prepare('INSERT INTO xxx (name) VALUES (?)')
    const result = stmt.run(body.name)
    return NextResponse.json<ApiResponse>(
      { success: true, data: { id: result.lastInsertRowid } },
      { status: 201 }
    )
  } catch (err) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

---

## 5. 實作第一個完整 API：`/api/menu/route.ts`

> 這是 `docs/menu-api-example.md` 的完整解析版。

### 5.1 程式碼

```typescript
// app/api/menu/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// ============================================================
// 型別定義
// ============================================================

/** 菜單品項（對應 menu_item table）*/
interface MenuItem {
  item_id: number
  name: string
  category: string
  price: number
  description: string
  is_active: number
  stock_qty: number
  low_stock_threshold: number
  sort_order: number
  created_at: string
  updated_at: string
}

/** POST /api/menu 的 request body */
interface CreateMenuBody {
  name: string
  category: string
  price: number
  description?: string
  is_active?: number
  stock_qty?: number
  sort_order?: number
}

/** 統一回應格式 */
interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/menu — 查詢全部（可依分類篩選）
// ============================================================
export async function GET(req: Request) {
  try {
    const db = getDb()
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') // e.g. ?category=主食

    let sql = `
      SELECT * FROM menu_item
      WHERE is_active = 1
      ORDER BY sort_order ASC, item_id ASC
    `
    const params: (string | number)[] = []

    if (category) {
      sql = `
        SELECT * FROM menu_item
        WHERE is_active = 1 AND category = ?
        ORDER BY sort_order ASC, item_id ASC
      `
      params.push(category)
    }

    const menu = db.prepare(sql).all(...params) as MenuItem[]
    return NextResponse.json<ApiResponse<MenuItem[]>>({ success: true, data: menu })
  } catch (err) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/menu — 新增品項
// ============================================================
export async function POST(req: Request) {
  try {
    const body: CreateMenuBody = await req.json()

    // 1. 參數驗證
    if (!body.name || !body.category || body.price === undefined) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'name、category、price 為必填欄位' },
        { status: 400 }
      )
    }

    const db = getDb()

    // 2. 寫入資料庫
    const stmt = db.prepare(`
      INSERT INTO menu_item (
        name, category, price, description, is_active,
        stock_qty, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
    `)

    const result = stmt.run(
      body.name,
      body.category,
      body.price,
      body.description ?? '',
      body.is_active ?? 1,
      body.stock_qty ?? 0,
      body.sort_order ?? 0
    )

    // 3. 回傳新建立的資料（包含自動產生的 item_id）
    const newItem = db.prepare(
      'SELECT * FROM menu_item WHERE item_id = ?'
    ).get(result.lastInsertRowid) as MenuItem

    return NextResponse.json<ApiResponse<MenuItem>>(
      { success: true, data: newItem },
      { status: 201 }
    )
  } catch (err) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

### 5.2 型別定義的價值

```typescript
// 沒有型別時：你不知道 body 裡有什麼
const body = await req.json()
db.prepare('INSERT INTO menu_item ...').run(body.name, ...)

// 有型別時：VS Code 直接告訴你少了哪個欄位
interface CreateMenuBody {
  name: string
  category: string
  price: number
}
// 少了任一欄位 → 紅色警告（如果有用 strict 模式）
```

---

## 6. 實作 `PATCH /api/orders/status`（已存在，可對照）

```typescript
// app/api/orders/status/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface UpdateStatusBody {
  order_id: string
  status: string
}

interface ApiResponse {
  success: boolean
  error?: string
}

export async function PATCH(request: Request) {
  try {
    const body: UpdateStatusBody = await request.json()

    if (!body.order_id || !body.status) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '缺少 order_id 或 status' },
        { status: 400 }
      )
    }

    // 狀態映射（後台狀態 → DB 狀態）
    const statusMap: Record<string, string> = {
      pending: 'pending',
      preparing: 'preparing',
      done: 'completed',
    }

    const dbStatus = statusMap[body.status] || body.status
    const db = getDb()

    db.prepare(`UPDATE "order" SET status = ? WHERE order_id = ?`)
      .run(dbStatus, body.order_id)

    return NextResponse.json<ApiResponse>({ success: true })
  } catch (err) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

### 6.1 觀念：狀態映射

```
後台 UI 狀態          →    DB 儲存值
─────────────────────────
'pending'  (待處理)   →  'pending'
'preparing' (準備中)  →  'preparing'
'done'     (已完成)   →  'completed'
```

好處：前端可以有自己的狀態命名，不被 DB 欄位值綁住。

### 6.2 觀念：`"order"` 雙引號

```typescript
db.prepare(`UPDATE "order" SET status = ? WHERE order_id = ?`)
//                   ↑ ↑
//               因為 order 是 SQL 保留字
```

---

## 7. 使用 curl 測試 API

啟動伺服器後，另開一個 terminal 執行：

```bash
# ========== Menu API ==========

# GET 全部
curl http://localhost:3100/api/menu

# GET 依分類
curl "http://localhost:3100/api/menu?category=手作便當"

# POST 新增品項
curl -X POST http://localhost:3100/api/menu \
  -H "Content-Type: application/json" \
  -d '{
    "name": "測試便當",
    "category": "手作便當",
    "price": 150,
    "description": "測試用",
    "stock_qty": 99
  }'

# ========== Orders Status API ==========

# PATCH 更新狀態
curl -X PATCH http://localhost:3100/api/orders/status \
  -H "Content-Type: application/json" \
  -d '{"order_id": "202605250001", "status": "preparing"}'

# ========== 預期回應 ==========
# 成功：{ "success": true }
# 失敗：{ "success": false, "error": "錯誤訊息" }
```

---

## 8. 通用錯誤處理模式

每個 API 都應該有三層錯誤處理：

### 8.1 參數驗證錯誤（400）

```typescript
if (!body.name || body.price === undefined) {
  return NextResponse.json<ApiResponse>(
    { success: false, error: '缺少必填欄位' },
    { status: 400 }
  )
}
```

### 8.2 找不到資源（404）

```typescript
const item = db.prepare('SELECT * FROM menu_item WHERE item_id = ?').get(id)
if (!item) {
  return NextResponse.json<ApiResponse>(
    { success: false, error: '找不到該品項' },
    { status: 404 }
  )
}
```

### 8.3 伺服器錯誤（500）

```typescript
try {
  // ...
} catch (err) {
  console.error('GET /api/menu error:', err)  // 印到 server log
  return NextResponse.json<ApiResponse>(
    {
      success: false,
      // 不直接回傳 err（可能有機敏資訊）
      error: err instanceof Error ? err.message : '伺服器錯誤'
    },
    { status: 500 }
  )
}
```

> ⚠️ **安全原則**：`catch` 區塊不要回傳 `err.stack` 或完整 Error 物件給前端，攻擊者可以從錯誤堆疊推斷系統架構。

---

## 9. REST 風格路由對照

```
GET    /api/menu              → 查詢全部
POST   /api/menu              → 新增品項
GET    /api/menu/:id           → 查詢單一（需新增 app/api/menu/[id]/route.ts）
PUT    /api/menu/:id           → 更新（需新增）
DELETE /api/menu/:id           → 軟刪除（設 is_active=0）

GET    /api/orders             → 查詢全部
POST   /api/orders             → 新增訂單
GET    /api/orders/:id         → 查詢單一
PATCH  /api/orders/:id/status   → 更新狀態

GET    /api/inventory          → 查詢庫存
POST   /api/inventory          → 新增食材
PUT    /api/inventory/:id      → 更新庫存
GET    /api/inventory/check    → 低庫存警示（專用 endpoint）
```

---

## 10. 待實作 API 清單

| API | 優先順序 | 說明 |
|-----|---------|------|
| `GET /api/menu` | 高 | 前台目前是 MOCK_MENU |
| `POST /api/menu` | 高 | 後台新增品項需要 |
| `GET /api/inventory` | 中 | 後台庫存頁需要 |
| `PUT /api/inventory/:id` | 中 | 調整庫存數量 |
| `GET /api/inventory/check` | 低 | 低庫存警示 |
| `lib/db.js → lib/db.ts` | 高 | 所有 TS route 都引用它 |
| `POST /api/orders` (TS版) | 中 | 目前是 JS 版 |

---

## 11. 如何驗證你的 API

### 11.1 快速檢查清單

```bash
# 1. 確認伺服器在跑
curl http://localhost:3100

# 2. 確認 API 返回正確 JSON 格式
curl http://localhost:3100/api/menu | python3 -m json.tool

# 3. 確認錯誤處理（傳錯誤參數）
curl -X POST http://localhost:3100/api/menu \
  -H "Content-Type: application/json" \
  -d '{"name": ""}'   # 缺少必填欄位 → 400
```

### 11.2 錯誤訊息檢查

| 情境 | 預期 HTTP Status | 預期 success |
|------|-----------------|-------------|
| 正常 | 200 / 201 | `true` |
| 缺少必填欄位 | 400 | `false` + error 訊息 |
| 找不到資源 | 404 | `false` + error 訊息 |
| 伺服器錯誤 | 500 | `false` + error 訊息 |

---

## 12. 常見錯誤與修復

| 錯誤 | 原因 | 修復方式 |
|------|------|---------|
| `Cannot find module '@/lib/db'` | `next.config.js` 的 import alias 設定錯誤 | 確認 `paths: { "@/*": ["./*"] }` |
| `SQLITE_BUSY` | 同時多個寫入請求 | 確保一次只有一個 `npm run dev` 實例 |
| `no such table: menu_item` | 資料庫未初始化 | `sqlite3 data/jinhaoke.db < lib/schema.sql` |
| `err instanceof Error` 回傳 false | 錯誤不是 Error 實體（如字串）| 加 `(err instanceof Error ? err.message : String(err))` |
| TS 型別錯誤（strict mode）| `strict: true` 會檢查所有變數型別 | 確保所有區域變數都有明確型別 |

---

## 13. Pre-Ship Checklist（API 實作前必檢查）

```
□  型別定義：每個 request/response 都有明確的 interface
□  400 處理：缺少必填欄位會正確回傳 400
□  500 處理：catch 區塊安全地回傳錯誤（不暴露 stack）
□  201 vs 200：POST 建立成功回 201，GET 成功回 200
□  SQL 保留字：`"order"` 有雙引號包住
□  時間：SQL 用 `datetime('now', '+8 hours')`（SQLite 無時區）
□  curl 測試：每個 endpoint 都用 curl 驗證過
□  `err instanceof Error`：安全地處理未知錯誤型別
```

---

## 14. 下一步

1. **實作 `GET /api/menu`** → 前台串 API 替換 MOCK_MENU
2. **將 `lib/db.js` 改為 `lib/db.ts`** → 統一 TS 化
3. **實作庫存相關 API** → 後台庫存頁需要
4. **將 `app/api/orders/route.js` 改為 TS 版** → 統一是 JS 還是 TS