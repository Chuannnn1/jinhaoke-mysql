# 金濠客食堂 POS 系統

> 前台點餐 + 後台管理系統
> 前端：React (JavaScript)｜API：TypeScript｜資料庫：SQLite｜部署：Next.js + Tailscale Funnel

---

## 目錄

1. [系統概覽](#1-系統概覽)
2. [系統架構圖](#2-系統架構圖)
3. [開發環境建置](#3-開發環境建置)
4. [目錄結構](#4-目錄結構)
5. [資料庫設計](#5-資料庫設計)
6. [API 開發規範](#6-api-開發規範)
7. [前端開發規範](#7-前端開發規範)
8. [整合測試](#8-整合測試)
9. [分工建議](#9-git-協作規範)
10. [開始實作](#10-開始實作)
11. [繳交成品規格](#11-繳交成品規格)

---

## 1. 系統概覽

### 1.1 系統目標
建立一個針對中小型餐飲業的 POS 系統，核心功能：
- **前台**：顧客自行點餐（觸控介面）
- **後台**：管理菜單、訂單、庫存、供應商
- **報表**：每日營收、熱門品項、低庫存警示

### 1.2 Tech Stack

| 層      | 技術                      | 說明                             |
| ------ | ----------------------- | ------------------------------ |
| 前端框架   | Next.js 14 (App Router) | 前台、後台都是 React                  |
| 前端語言   | JavaScript              | 前台、後台 UI                       |
| API 層  | Next.js API Routes      | 後端商業邏輯                         |
| API 語言 | TypeScript              | 所有 `app/api/` 下的 route handler |
| 資料庫    | SQLite（better-sqlite3）  | 單一 `.db` 檔案，無需架構 DB 伺服器        |
| 樣式     | Tailwind CSS            | 響應式 UI                         |
| 部署     | VPS + Tailscale Funnel  | 自動 HTTPS URL，零設定對外暴露           |
| 網域     | Tailscale 自動產生          | `https://xxx.ts.net`           |

### 1.3 功能對應

| 功能 | 前台（顧客） | 後台（管理員） |
|------|------------|--------------|
| 瀏覽菜單 | ✅ | ✅ |
| 加入購物車 | ✅ | — |
| 提交訂單 | ✅ | — |
| 管理菜單（CRUD） | — | ✅ |
| 查看/變更訂單狀態 | — | ✅ |
| 庫存查詢與調整 | — | ✅ |
| 供應商管理 | — | ✅ |
| 儀表板統計 | — | ✅ |

---

## 2. 系統架構圖

```
┌──────────────────────────────────────────────────────────────┐
│                     租的 VPS (雲端主機)                        │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │               Next.js App (Port 3100)               │   │
│   │                                                     │   │
│   │   ┌──────────────┐         ┌────────────────────┐  │   │
│   │   │   Frontend   │         │    API Layer       │  │   │
│   │   │  (React/JS)  │         │ (TypeScript Routes)│  │   │
│   │   ├──────────────┤         ├────────────────────┤  │   │
│   │   │  前台 `/`    │──fetch──│  app/api/menu/    │  │   │
│   │   │  後台        │◀─JSON───│  app/api/orders/  │  │   │
│   │   │  /admin/*    │         │  app/api/inventory/│  │   │
│   │   └──────────────┘         └─────────┬──────────┘  │   │
│   └──────────────────────────────────────┼───────────┘   │
│                                            │               │
│                                            ▼               │
│                              ┌─────────────────────────┐   │
│                              │   lib/db.ts            │   │
│                              │   (better-sqlite3)      │   │
│                              └─────────┬───────────────┘   │
│                                        │                   │
│                                        ▼                   │
│                              ┌─────────────────────────┐   │
│                              │  data/jinhaoker.db      │   │
│                              │  (SQLite 單一檔案)       │   │
│                              └─────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │             Tailscale Funnel (Port 3100 → HTTPS)   │   │
│   │              自動產生 https://xxx.ts.net            │   │
│   └─────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
              ┌───────────────────────────────┐
              │  組員 / 老師 / 顧客  瀏覽器     │
              │                               │
              │  前台：https://xxx.ts.net/    │
              │  後台：https://xxx.ts.net/admin │
              └───────────────────────────────┘
```

---

## 3. 開發環境建置

### 3.1 硬體與網路需求

| 項目 | 需求 |
|------|------|
| 雲端 VPS | 一台（建議 1GB RAM 以上） |
| 作業系統 | Ubuntu 24.04 LTS |
| Tailscale | 已登入帳號（用于產生 public URL） |
| SSH 存取 | 組員各自的 SSH key 已加入 VPS |

### 3.2 一鍵安裝腳本

在 VPS 上執行以下指令安裝所有依賴：

```bash
# 複製此 repo
git clone git@github.com:Chuannnn1/jinhaoker-pos.git
cd jinhaoker-pos

# 執行安裝腳本
bash scripts/setup.sh
```

**`scripts/setup.sh` 會做以下事情：**
1. 安裝 Node.js 20.x（via NodeSource）
2. 安裝 npm 依賴（`npm install`）
3. 初始化 SQLite 資料庫（跑 `schema.sql` + `seed.sql`）
4. 安裝 Tailscale 並啟動
5. 啟用 Tailscale Funnel（對外暴露 3100 port）
6. 顯示 Tailscale 產生的 public URL

> ⚠️ 詳細腳本內容見 [附錄 A：setup.sh](#附錄-a：setupsh)

### 3.3 啟動方式

```bash
# 開發模式（會熱重載）
npm run dev

# 生產模式
npm start
```

### 3.4 對外 access

啟動 Tailscale Funnel 後，VPS 會自動產生一個 `https://xxx.ts.net` 的 URL。

```bash
# 查看目前產生的 URL
tailscale funnel status
```

---

## 4. 目錄結構

```
jinhaoker-pos/
├── app/
│   ├── page.jsx                  ← 前台（顧客點餐頁）
│   ├── layout.jsx                ← Root layout
│   ├── globals.css               ← 全域樣式（Tailwind）
│   │
│   ├── admin/                    ← 後台頁面
│   │   ├── layout.jsx            ← AdminLayout（含 Sidebar）
│   │   ├── dashboard/page.jsx    ← 儀表板
│   │   ├── menu/page.jsx         ← 菜單管理
│   │   ├── orders/page.jsx       ← 訂單管理
│   │   └── inventory/page.jsx    ← 庫存管理
│   │
│   └── api/                      ← API 層（TypeScript）
│       ├── health/route.js       ← 健康檢查
│       ├── menu/
│       │   ├── route.ts          ← GET list、POST 新增
│       │   ├── [id]/route.ts      ← GET one、PUT 更新、DELETE 刪除
│       │   └── categories/route.js ← GET 分類列表
│       ├── orders/
│       │   ├── route.js          ← GET list、POST 建立訂單
│       │   ├── [id]/route.js     ← GET one、PUT 更新
│       │   ├── [id]/status/route.js ← PATCH 更新狀態
│       │   └── stats/route.js    ← GET 儀表板統計
│       ├── inventory/
│       │   ├── route.js          ← GET list、POST 新增食材
│       │   ├── [id]/route.js     ← GET one、PUT 更新庫存
│       │   └── check/route.js    ← GET 低庫存警示
│       ├── purchase-orders/
│       │   ├── route.js          ← GET list、POST 建立採購單
│       │   ├── [id]/route.js     ← GET/PUT
│       │   └── [id]/returns/route.js ← POST 退貨
│       └── suppliers/
│           ├── route.js          ← GET list、POST 新增
│           └── [id]/route.js     ← GET/PUT
│
├── components/
│   └── layout/
│       └── AdminLayout.jsx       ← 後台側邊攔
│
├── lib/
│   ├── db.ts                     ← SQLite 資料庫連線（singleton）
│   ├── schema.sql                 ← 資料庫 Schema（9張表）
│   ├── seed.sql                  ← 測試資料
│   └── types.ts                  ← TypeScript 型別定義
│
├── scripts/
│   └── setup.sh                  ← 一鍵安裝部署腳本
│
├── docs/
│   ├── API-GUIDE.md              ← API 撰寫範例（必看）
│   └── jinhaoker-pos-api-demo.md  ← 完整 API 文件
│
└── package.json
```

---

## 5. 資料庫設計

### 5.1 Schema 概覽（11 張表）

```
supplier ─────┐
              ▼
ingredient ───┤
              ├─ recipe ──► menu_item    │ via ingredient_id
              │
              └─► purchase_order (單一食材)   │ via ingredient_id
                       │
                       │ 1:1 (最多一張退貨單)
                       ▼
                return_order
                         │
order_item ◄────────────┘
              │
              ▼
"order" ────────────► delivery_customer（外送顧客地址）

inventory_log（庫存異動記錄，輔助表）
```

### 5.2 命名規則

| 規則 | 範例 |
|------|------|
| Table 名稱 | 全小寫、底線分隔 `menu_item` |
| SQL 保留字 table 名 | 雙引號包住 `"order"` |
| Column 名稱 | 全小寫、底線分隔 `item_id` |
| JavaScript / TypeScript | 駝峰式 `item_id`、`customerName` |

### 5.3 重點欄位說明

| Table | 重點欄位 |
|-------|---------|
| `menu_item` | `is_active`（軟刪除）、`sort_order`（排序） |
| `ingredient` | `stock_qty`（目前庫存）、`low_stock_threshold`（低庫存警示線） |
| `"order"` | `status`（pending/cooking/delivering/completed/cancelled）、`order_id`（文字序號）；含 `customer_phone` FK 至 `delivery_customer` |
| `delivery_customer` | 外送顧客的姓名、電話、地址（解決 3NF 遞移相依） |
| `recipe` | 餐點組成（item_id + ingredient_id + consume_qty） |
| `return_order` | 退貨單，含退貨原因、退貨日期、關聯原始 purchase_order |
| `return_order_item` | 退貨單明細（item + 數量） |
| `inventory_log` | 每筆庫存異動的時間、原因、數量、餘量 |

### 5.4 新增表格說明

#### `delivery_customer`（外送顧客）
| 欄位 | 類型 | 說明 |
|------|------|------|
| `phone` | TEXT PRIMARY KEY | 電話（PK），用於關聯訂單 |
| `name` | TEXT | 顧客姓名 |
| `address` | TEXT | 外送地址 |
| `created_at` | TEXT | 建立時間 |

> **設計原因**：`"order"` 的地址欄位造成 3NF 遞移相依（order → phone → address），獨立成表消除冗餘。

#### `return_order`（退貨單）
| 欄位 | 類型 | 說明 |
|------|------|------|
| `return_id` | TEXT PRIMARY KEY | 退貨單號 |
| `purchase_order_id` | TEXT | 原始採購單（FK） |
| `return_date` | TEXT | 退貨日期 |
| `reason` | TEXT | 退貨原因 |
| `note` | TEXT | 備註 |

#### `return_order_item`（退貨單明細）
| 欄位 | 類型 | 說明 |
|------|------|------|
| `return_id` | TEXT | 隸屬退貨單（FK） |
| `ingredient_id` | INTEGER | 原料（FK） |
| `return_qty` | INTEGER | 退貨數量 |

> **設計原因**：進貨驗收不合格時，直接建立退貨單，不修改 purchase_order_item 內容。

### 5.5 Migration 流程

```bash
# 初始化（第一次架設）
sqlite3 data/jinhaoker.db < lib/schema.sql
sqlite3 data/jinhaoker.db < lib/seed.sql
```

> ⚠️ 修改 schema 前先 `DROP TABLE IF EXISTS`，再重新 `CREATE`。正式營運後要另外寫 migration script。

### 5.5 業務假設說明（Schema 設計前提）

**核心假設：金濠客食堂「一張訂購單只對應一種食材」**

這是基於實際採購習慣：肉商、菜商、糧商按品項分流，每次下單只跟一個供應商訂一種食材。此假設讓 schema 能完整對齊 3NF：

- `purchase_order` 不需要 `supplier_id`：透過 `ingredient_id → ingredient.supplier_id → supplier` 鏈式查詢即可取得
- `return_order` 不需要子明細表：一張退貨單對應一種食材，平鋪結構即可表達

**供應商查詢方式：**
```sql
SELECT po.po_id, ing.name AS ingredient_name,
       sup.name AS supplier_name, sup.phone AS supplier_phone
FROM purchase_order po
JOIN ingredient ing ON po.ingredient_id = ing.ingredient_id
JOIN supplier sup ON ing.supplier_id = sup.supplier_id
WHERE po.po_id = ?;
```

### 5.6 ERD ↔ Schema 對應表

| PDF ERD 實體/關係 | 類型 | 對應 SQL Table |
|------------------|------|----------------|
| 顧客訂單 | Entity | `"order"` |
| 顧客訂單-包含 | Relationship | `order_item` |
| 餐點 | Entity | `menu_item` |
| 食材-消耗 | Relationship | `recipe` |
| 食材 | Entity | `ingredient` |
| 供應商 | Entity | `supplier` |
| 供應（供應商 1:N 食材）| Relationship | `ingredient.supplier_id` (FK) |
| 訂購單 | Entity | `purchase_order`（單食材，平鋪結構）|
| 退貨單 | Entity | `return_order`（單食材，平鋪結構）|
| 產生（訂購單 1:1 退貨單）| Relationship | `return_order.po_id` (FK, UNIQUE) |
| 外送顧客單 | Entity | `delivery_customer` |
| — | 實作輔助 | `inventory_log`（庫存異動追蹤）|

### 5.7 SQL 語法要點

```sql
-- 時間一律用 +8 小時（SQLite 沒有時區）
INSERT INTO menu_item (...) VALUES (...)
  SET created_at = datetime('now', '+8 hours')

-- 保留字 table 名要加雙引號
SELECT * FROM "order" WHERE order_id = ?

-- Transaction 範例一：外送訂單（先寫顧客、再寫訂單、最後扣庫存）
BEGIN;
  INSERT INTO delivery_customer (name, phone, address) VALUES (?, ?, ?);
  INSERT INTO "order" (order_id, customer_name, customer_phone, status, note) VALUES (?, ?, ?, 'pending', ?);
  INSERT INTO order_item (order_id, item_id, quantity) VALUES (?, ?, ?);
  UPDATE ingredient SET stock_qty = stock_qty - ? WHERE ingredient_id = ?;
COMMIT;

-- Transaction 範例二：驗收訂購單（合格入庫，不合格觸發退貨）
BEGIN;
  -- 1. 更新訂購單狀態與數量
  UPDATE purchase_order
     SET received_qty = ?, qualified_qty = ?,
         status = CASE
           WHEN ? = ordered_qty THEN 'received'
           WHEN ? > 0 THEN 'partial'
           ELSE 'returned'
         END
   WHERE po_id = ?;

  -- 2. 合格數量入庫
  UPDATE ingredient
     SET stock_qty = stock_qty + ?
   WHERE ingredient_id = ?;

  -- 3. 有不合格就建立退貨單（qualified < received）
  INSERT INTO return_order (po_id, return_date, return_qty, return_reason)
  SELECT ?, datetime('now', '+8 hours'), ?, ?
   WHERE ? < ?;   -- 只有不合格才會執行
COMMIT;
```

---

## 6. API 開發規範

> 所有 API Route 在 `app/api/` 底下，用 TypeScript 撰寫。
> 詳細範例見 [docs/menu-api-example.md](docs/menu-api-example.md)（含完整 Menu API TypeScript 程式碼）

### 6.1 統一回傳格式

```typescript
// ✅ 成功
{ "success": true, "data": { ... } }

// ❌ 失敗
{ "success": false, "error": "錯誤原因" }
```

### 6.2 HTTP Status Code

| Status | 意義 |
|--------|------|
| 200 | 查詢/更新成功 |
| 201 | 建立成功 |
| 400 | 參數錯誤（缺少必填欄位） |
| 404 | 找不到資源 |
| 500 | 伺服器錯誤（try-catch 捕捉） |

### 6.3 必備區塊（每個 Route Handler 都要有）

```typescript
export async function GET(req) {
  try {
    // 1. 取得參數（query / params）
    // 2. 驗證參數
    // 3. 操作資料庫
    // 4. 回傳結果
    return NextResponse.json({ success: true, data: ... })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
```

### 6.4 Request / Response 範例（POST /api/orders）

**Request：**
```json
POST /api/orders
Content-Type: application/json

{
  "customer_name": "王小明",
  "customer_phone": "0912-345-678",
  "note": "不要辣",
  "items": [
    { "item_id": 1, "quantity": 2 }
  ]
}
```

**Response（成功）：**
```json
HTTP 201
{ "success": true, "data": { "order_id": "202605160001" } }
```

**Response（失敗）：**
```json
HTTP 400
{ "success": false, "error": "customer_name 和 items 為必填欄位" }
```

### 6.5 API 路由對照表

| 功能 | HTTP Method | 路由 |
|------|-------------|------|
| 查詢全部菜單 | GET | `/api/menu` |
| 新增菜單 | POST | `/api/menu` |
| 查詢單一菜單 | GET | `/api/menu/:id` |
| 更新菜單 | PUT | `/api/menu/:id` |
| 刪除菜單（軟刪除） | DELETE | `/api/menu/:id` |
| 查詢分類 | GET | `/api/menu/categories` |
| 查詢全部訂單 | GET | `/api/orders` |
| 建立訂單 | POST | `/api/orders` |
| 查詢單一訂單 | GET | `/api/orders/:id` |
| 更新訂單狀態 | PATCH | `/api/orders/:id/status` |
| 儀表板統計 | GET | `/api/orders/stats` |
| 查詢庫存 | GET | `/api/inventory` |
| 低庫存警示 | GET | `/api/inventory/check` |
| 更新庫存 | PUT | `/api/inventory/:id` |
| 新增食材 | POST | `/api/inventory` |
| 查詢採購單 | GET | `/api/purchase-orders` |
| 建立採購單 | POST | `/api/purchase-orders` |
| 退貨登記 | POST | `/api/purchase-orders/:id/returns` |
| 查詢供應商 | GET | `/api/suppliers` |
| 新增供應商 | POST | `/api/suppliers` |

---

## 7. 前端開發規範

### 7.1 語言與框架

- **Framework**：Next.js 14 App Router
- **UI 語言**：JavaScript（`page.jsx` / `layout.jsx`）
- **元件庫**：Lucide React（圖示）+ Tailwind CSS（樣式）
- **圖表**：Recharts（儀表板用）

### 7.2 前台（顧客）— `app/page.jsx`

**功能：** 瀏覽 → 加入購物車 → 填資料 → 提交訂單

**呼叫的 API：**
- `GET /api/menu`
- `GET /api/menu/categories`
- `POST /api/orders`

**流程：**
```
fetch('/api/menu') → 顯示菜單 Grid
→ 點「加入購物車」→ useState cart[]
→ 填 customer_name → POST /api/orders
→ 成功 → alert('單號：xxx')、清空 cart
```

### 7.3 後台（管理員）— `app/admin/*`

**目錄結構：**
- `dashboard/page.jsx` — 儀表板（4 格統計 + 3 張圖表）
- `menu/page.jsx` — 菜單 CRUD（Modal 表單）
- `orders/page.jsx` — 訂單狀態管理（狀態按鈕）
- `inventory/page.jsx` — 庫存查詢與調整

**共用的 Layout：** `components/layout/AdminLayout.jsx`（左側 Sidebar）

### 7.4 前端資料處理原則

```javascript
// ✅ 正確：直接取用 API 回傳的欄位名
data.map(item => item.item_id, item.name, item.price)

// ❌ 錯誤：自己定義新的欄位名對接
```

### 7.5 錯誤處理

```javascript
try {
  const res = await fetch('/api/menu')
  const result = await res.json()
  if (result.success) {
    setMenu(result.data)
  } else {
    alert('載入失敗：' + result.error)
  }
} catch (err) {
  alert('網路錯誤：' + err.message)
}
```

---

## 8. 整合測試

### 8.1 curl 測試 API

```bash
# 健康檢查
curl http://localhost:3100/api/health

# 查詢全部菜單
curl http://localhost:3100/api/menu

# 新增菜單
curl -X POST http://localhost:3100/api/menu \
  -H "Content-Type: application/json" \
  -d '{"name":"測試餐點","category":"主餐","price":99}'

# 建立訂單
curl -X POST http://localhost:3100/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customer_name":"測試","items":[{"item_id":1,"quantity":1}]}'

# 更新訂單狀態
curl -X PATCH http://localhost:3100/api/orders/202605160001/status \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```

### 8.2 前後端串接檢查清單

- [ ] 前台首頁有辦法 fetch 到 `/api/menu` 並顯示
- [ ] 提交訂單後 cart 清空、出現 alert 單號
- [ ] 後台 `/admin/orders` 可以看到訂單
- [ ] 後台更新狀態後、視圖即時刷新
- [ ] 低庫存品項在後台有不同顏色標示
- [ ] 儀表板統計數字有正常顯示（非 0 或 loading 持續很久）

---

## 9. Git 協作規範

> ⚠️ 正式協作 repo：`https://github.com/Chuannnn1/jinhaoker`
> ⚠️ 請先看過以下影片了解 Git 分支與 merge 流程：
> [【教程】Git Collaborative Development — YouTube](https://youtu.be/P-nbNgIzlYE?si=vF2JQ8Wfq0wyJHyv)

### 9.1 分支策略

```
main           ← 正式版（只有 repo 擁有者能 merge）
├── dev        ← 開發整合分支（所有人往這 PR）
└── feature/*  ← 各組員的功能分支
```

### 9.2 Merge 流程

```
組員在 feature/xxx 開發
        ↓
提交 PR → chaeryeong review → 標註問題或通過
        ↓
組長 merge 到 dev → 確認沒 conflict
        ↓
組長 merge dev → main
```

### 9.3 團隊分工

| 組員 | 負責範圍 |
| chuannnn | 前台點餐頁 + 後台全部 UI + SQL schema + Menu API |
| 組員 2 | Orders 全套 API（5 個 endpoint）+ Orders 相關前端 |
| 組員 3 | Inventory + Purchase Orders + Suppliers 全套 API |

### 9.4 交接注意事項

- **API 確定好格式再動手**：先討論好 request / response 格式，確認雙方都理解再分工
- **DB schema 有變動要通知全組**：任何 SQL 改動第一時間在群組公告
- **每天 pull 最新程式碼**：避免 merge conflict 堆積
- **PR 審核**：所有 PR 皆由 chaeryeong（agent）先行 review，再由組長 merge

---

## 10. 開始實作

### 10.1 初次環境建置

> 📖 詳細圖文教學（從零 init Next.js）：[docs/getting-started.md](docs/getting-started.md)

```bash
# 1. Clone 協作 repo
git clone git@github.com:Chuannnn1/jinhaoke.git
cd jinhaoke

# 2. 安裝 Node.js 20.x（如尚未安裝）
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. 安裝 npm 依賴
npm install

# 4. 安裝 SQLite（Linux）
apt-get install -y sqlite3

# 5. 初始化資料庫
mkdir -p data
sqlite3 data/jinhaoker.db < lib/schema.sql
sqlite3 data/jinhaoker.db < lib/seed.sql

# 6. 啟動開發伺服器
npm run dev
# 出現  => Ready  之後，開啟 http://localhost:3100
```

### 10.2 每日開發流程

```bash
# 每次開始前：拉最新程式碼
git checkout dev
git pull origin dev

# 建立自己的功能分支（名稱範例）
git checkout -b feature/menu-api       # chuannnn：menu API
git checkout -b feature/orders-api     # 組員2：orders API
git checkout -b feature/inventory-api # 組員3：inventory API

# 開發、 commit、 push
git add .
git commit -m "feat: add menu GET API"
git push origin feature/menu-api

# 在 GitHub 網頁發 PR → 等待 review → merge
```

### 10.3 快速測試 API（不開瀏覽器）

```bash
# 測試 Menu API
curl http://localhost:3100/api/menu

# 新增品項
curl -X POST http://localhost:3100/api/menu \
  -H "Content-Type: application/json" \
  -d '{"name":"牛肉麵","category":"主食","price":120}'

# 測試 Orders API
curl -X POST http://localhost:3100/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customer_name":"王小明","customer_phone":"0912-345-678","items":[{"item_id":1,"quantity":2}]}'

# 查看訂單列表
curl http://localhost:3100/api/orders

# 查看庫存
curl http://localhost:3100/api/inventory
```

### 10.4 常見問題

| 問題 | 解法 |
|------|------|
| `better-sqlite3` 安裝失敗 | `npm install --build-from-source better-sqlite3` |
| 資料庫權限錯誤 | `chmod 666 data/jinhaoker.db` 或用 `sudo` 執行 init |
| `npm run dev` 沒反應 | 確認 `.env.local` 存在（參考 `.env.example`） |
| Port 3100 被佔用 | `lsof -ti:3100 | xargs kill -9` 然後重跑 |

---




### 11.1 必要檔案

```
jinhaoker-pos/
├── app/                    ← 前台 + 後台（全部完整）
├── lib/
│   ├── schema.sql          ← 9張表 DDL
│   ├── seed.sql            ← 測試資料
│   └── db.ts               ← 資料庫連線
├── scripts/
│   └── setup.sh            ← 一鍵部署腳本
├── docs/
│   ├── API-GUIDE.md        ← API 撰寫規範
│   └── README.md           ← 本文件（專案說明書）
└── package.json
```

### 11.2 系統驗收標準

- [ ] 前台可以瀏覽菜單、加入購物車、提交訂單
- [ ] 後台可以管理菜單（CRUD）
- [ ] 後台可以查看訂單列表並更新狀態
- [ ] 後台可以查詢庫存並調整
- [ ] 儀表板顯示今日訂單數、營收統計圖表
- [ ] 所有 API 皆為 `{ success: true/false, data/error }` 格式
- [ ] 部署腳本可在乾淨的 VPS 上一次性架設完成
- [ ] 系統可透過 Tailscale Funnel URL 公開訪問

---

## 附錄 A：setup.sh

```bash
#!/bin/bash
set -e

echo "=== 金濠客食堂 POS 安裝腳本 ==="

# 1. 更新系統、安裝 Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 2. 安裝 npm 依賴
npm install

# 3. 安裝 Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# 4. 初始化資料庫
mkdir -p data
sqlite3 data/jinhaoker.db < lib/schema.sql
sqlite3 data/jinhaoker.db < lib/seed.sql

# 5. 啟動 Tailscale（需要手動登入一次）
tailscale up

# 6. 啟用 Funnel（對外暴露 3100 port）
tailscale funnel 3100

# 7. 啟動 Next.js
npm start &

echo "=== 安裝完成 ==="
echo "請存取：$(tailscale funnel status | grep https)"
```

> ⚠️ 實際部署時 `setup.sh` 需要更嚴謹的 error handling、firewall 設定、以及 Tailscale auth key 非互動式登入流程。

---

## 附錄 B：API 快速對照

> 完整 request/response 文件見 `docs/jinhaoker-pos-api-demo.md`

| Method | 路由 | 說明 |
|--------|------|------|
| GET | `/api/health` | 健康檢查 |
| GET | `/api/menu` | 查詢全部菜單 |
| GET | `/api/menu/categories` | 分類統計 |
| GET | `/api/orders` | 查詢訂單列表 |
| POST | `/api/orders` | 建立訂單（Transaction） |
| PATCH | `/api/orders/:id/status` | 更新訂單狀態 |
## 11. 繳交成品規格
| GET | `/api/inventory` | 查詢庫存 |
| GET | `/api/inventory/check` | 低庫存警示 |
| PUT | `/api/inventory/:id` | 更新庫存數量 |
| GET | `/api/suppliers` | 查詢供應商 |