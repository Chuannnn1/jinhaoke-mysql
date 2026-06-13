# 金濠客食堂 POS 系統

> 前台點餐 + 後台管理系統
>
> 前端：React (JavaScript)｜API：TypeScript｜資料庫：SQLite

---

## 五層開發流程

本專案由下而上分為五層，**上一層依賴下一層**：

```
第1層  SQL（Schema + Seed）
  ↓    lib/schema.sql（10張表定義）
       lib/seed.sql（25道菜 + 12種食材測試資料）
       lib/db.ts（SQLite singleton，init 時自動執行 schema + seed）
         ↓
第2層  TypeScript API（26支）
         ↓
第3層  前台（顧客點餐）→ app/page.jsx
         ↓
第4層  後台（管理員介面）→ app/admin/
         ↓
第5層  部署：VPS + Tailscale Funnel
```

---

## 目錄結構

```
jinhaoke/
├── app/
│   ├── page.jsx                 ← 前台：顧客點餐頁（串 /api/menu、/api/orders）
│   ├── layout.jsx               ← Root Layout
│   ├── globals.css              ← Tailwind CSS 全域樣式
│   │
│   ├── admin/                   ← 後台（管理員）
│   │   ├── layout.jsx           ← AdminLayout（含側邊攔）
│   │   ├── page.jsx             ← 訂單看板（拖曳更新狀態）✅
│   │   └── inventory/
│   │       └── page.jsx         ← 庫存管理頁（待串 API）
│   │
│   └── api/                     ← TypeScript API Routes
│       ├── menu/
│       │   ├── route.ts        ← GET + POST（✅）
│       │   └── [id]/route.ts   ← GET + PUT + DELETE（✅）
│       ├── orders/
│       │   ├── route.ts        ← GET + POST（✅）
│       │   └── status/
│       │       └── route.ts    ← PATCH（✅）
│       ├── inventory/           ← GET + PUT（❌ 組員）
│       ├── suppliers/           ← CRUD（❌ 組員）
│       ├── ingredients/         ← CRUD（❌ 組員）
│       ├── purchase-orders/     ← CRUD + 驗貨 + 退貨（❌ 組員）
│       └── reports/              ← daily + monthly（❌ 組員）
│
├── lib/
│   ├── db.ts                    ← SQLite singleton
│   ├── schema.sql              ← 10張表定義（v3）✅
│   └── seed.sql                ← 測試資料 ✅
│
├── scripts/
│   ├── setup.sh                ← 一鍵建置（❌ 組員）
│   ├── init-db.sh              ← 重置資料庫（❌ 組員）
│   └── test-api.sh             ← API 測試腳本（❌ 組員）
│
├── docs/
│   ├── api-reference.md        ← 26支 API 的 request / response 格式
│   ├── api-guide.md            ← GET / POST / PUT / PATCH / DELETE 說明
│   └── schema-reference.md     ← 10張表欄位說明
│
└── ...
```

---

## 10天衝刺計畫

> **Deadline：10天內完成所有 ❌ 項目 + Deploy**

### Day 1-2：API（組員主導）

```
目標：17支 API 全部實作完成
- 組員：對照 docs/api-reference.md 實作各自認領的 API
- 你：確認出餐扣庫存邏輯（PATCH status → done 時的庫存扣除）
- 所有人：不懂的語法查 docs/api-guide.md
- 驗收：每支 API 都用 curl 測過
```

### Day 3-4：後台頁面串 API

```
目標：後台各頁面能正常讀寫
- 組員：選單管理、供應商管理、庫存頁面串 API
- 你：協助串聯、確保前台/後台不衝突
- 驗收：前後台能共同操作同一份 DB 資料
```

### Day 5-6：商業邏輯 + Reports

```
目標：出餐扣庫存、一鍵補貨、報表全部上線
- 組員：auto-restock、驗貨入庫、退貨邏輯
- 組員：daily / monthly 報表 API + 頁面
- 你：確認出餐時庫存正確減少
```

### Day 7-8：Scripts + 整合測試

```
目標：任何人都能乾淨地 clone → npm install → npm run dev
- 組員：scripts/init-db.sh、setup.sh、test-api.sh
- 全員：前后台串接測試、修 Bug
```

### Day 9-10：部署

```
目標：老師能透過 URL 訪問系統
- 你：VPS + Tailscale Funnel 部署
- 全員：Postman 測試所有 API 文件化
- 全員：準備報告文件
```

---

## API 列表（26支）含分工

| # | 方法 | 路由 | 說明 | 負責人 |
|---|------|------|------|--------|
| 1 | GET | `/api/menu` | 查詢全部菜單 | ✅ 已完成 |
| 2 | POST | `/api/menu` | 新增品項 | ✅ 已完成 |
| 3 | GET | `/api/menu/:id` | 查詢單一品項 | ✅ 已完成 |
| 4 | PUT | `/api/menu/:id` | 修改品項 | ✅ 已完成 |
| 5 | DELETE | `/api/menu/:id` | 軟刪除品項 | ✅ 已完成 |
| 6 | GET | `/api/orders` | 查詢全部訂單 | ✅ 已完成 |
| 7 | POST | `/api/orders` | 新增訂單 | ✅ 已完成 |
| 8 | PATCH | `/api/orders/status` | 更新訂單狀態 + **出餐扣庫存** | ✅ 已完成 |
| 9 | DELETE | `/api/orders/:id` | 取消訂單 | 👤 組員 |
| 10 | GET | `/api/inventory` | 查詢庫存 | 👤 組員 |
| 11 | PUT | `/api/inventory/:name` | 調整庫存 | 👤 組員 |
| 12 | GET | `/api/purchase-orders` | 查詢進貨單 | 👤 組員 |
| 13 | POST | `/api/purchase-orders` | 新建進貨單 | 👤 組員 |
| 14 | POST | `/api/orders/auto-restock` | **一鍵補貨**（低於安全存量自動產出進貨單）| 👤 組員 |
| 15 | POST | `/api/purchase-orders/:id/receive` | **驗貨入庫**（更新 purchase_order 狀態 + 實際入庫）| 👤 組員 |
| 16 | POST | `/api/purchase-orders/:id/return` | **登錄退貨**（建 return_order + 庫存扣減）| 👤 組員 |
| 17 | GET | `/api/suppliers` | 查詢供應商 | 👤 組員 |
| 18 | POST | `/api/suppliers` | 新增供應商 | 👤 組員 |
| 19 | PUT | `/api/suppliers/:name` | 修改供應商 | 👤 組員 |
| 20 | DELETE | `/api/suppliers/:name` | 刪除供應商 | 👤 組員 |
| 21 | GET | `/api/ingredients` | 查詢食材 | 👤 組員 |
| 22 | POST | `/api/ingredients` | 新增食材 | 👤 組員 |
| 23 | PUT | `/api/ingredients/:name` | 修改食材 | 👤 組員 |
| 24 | DELETE | `/api/ingredients/:name` | 刪除食材 | 👤 組員 |
| 25 | GET | `/api/reports/daily` | 每日營收 | 👤 組員 |
| 26 | GET | `/api/reports/monthly` | 月營收 | 👤 組員 |

> ✅ = 已實作　👤 = 組員實作

---

## 分工

### 👤 組員負責

| 項目 | 說明 |
|------|------|
| API（#9 - #26）| 17支 API，詳見上方表格 |
| 後台頁面 | 選單管理、供應商管理、庫存頁面、報表頁面 |
| Scripts | `setup.sh`、`init-db.sh`、`test-api.sh` |

### 你負責

| 項目 | 說明 |
|------|------|
| 出餐扣庫存 | 建議寫在 PATCH `/api/orders/status` 裡（當 status = "done" 時觸發）|
| 前台整合 | 確認前後台串聯正確 |
| 部署 | VPS + Tailscale Funnel |
| Reports 頁面 | daily / monthly 頁面（若組員來不及）|

### 實作前必讀文件

| 文件 | 什麼時候讀 |
|------|-----------|
| [docs/api-reference.md](docs/api-reference.md) | 實作任何 API 前 |
| [docs/api-guide.md](docs/api-guide.md) | 不確定 GET/PUT/PATCH 差別時 |
| [docs/schema-reference.md](docs/schema-reference.md) | 不確定某張表有哪些欄位時 |

---

## 資料庫設計（Schema v3 — 10張表）

### ER 圖

```
supplier ────────────┐
                     ▼
ingredient ───┬── recipe ──► menu_item
             │
             ├── purchase_order ── purchase_order_item ── return_order
             │
order_item ◄─┤
             │
             ▼
"order" ────► delivery_customer（外送顧客）
```

### 表說明

| 表 | 主鍵 | 用途 |
|---|------|------|
| `supplier` | name（TEXT）| 供應商（電話、名稱）|
| `ingredient` | name（TEXT）| 食材含庫存、叫貨單位設計 |
| `menu_item` | item_id（AUTO）| 菜單（emoji/tag/sub/option 為顯示用）|
| `recipe` | (item_id, ingredient_name) | 配方：每份餐點消耗哪些食材 |
| `delivery_customer` | phone（TEXT）| 外送顧客（3NF：地址在這裡，訂單只存 phone）|
| `"order"` | order_id（TEXT）| 顧客訂單含 status（待製作→製作中→待付款→已完成→已取消）|
| `order_item` | (order_id, item_id) | 訂單明細，**★ unit_price 存快照**，漲價不影響歷史 |
| `purchase_order` | po_id（AUTO）| 進貨單主表含 total_amount |
| `purchase_order_item` | (po_id, ingredient_name) | 進貨明細 |
| `return_order` | (po_id, ingredient_name) | 退貨單 |

### 設計決策摘要

1. **食材/供應商 PK 用 name**（不是 ID），減少 JOIN
2. **進貨單拆成主表 + 明細**（2NF）
3. **order_item 存單價快照**，漲價不影響歷史訂單
4. **庫存在出餐時扣除**（PATCH `/api/orders/status` → `done`），不是下單時
5. **叫貨單位設計**：`order_unit`（叫貨箱/包）× `qty_per_order_unit`（每單位等於多少 stock_unit）

### 庫存異動時機（實作時注意）

|| 動作 | 觸發 | 影響 |
|------|------|------|
| 下單 | POST `/api/orders` | 只寫入 order + order_item，**不扣庫存** |
| 出餐 | PATCH `/api/orders/status` → `done`（已完成）| 查 `recipe`，扣各項食材庫存 |
| 進貨入庫 | POST `/api/purchase-orders/:id/receive` | 增加 `ingredient.stock_qty` |
| 退貨 | POST `/api/purchase-orders/:id/return` | 減少 `ingredient.stock_qty` |

### 訂單五狀態流程

```
待製作 → 製作中 → 待付款 → 已完成（→ 出餐扣庫存）
                      ↘ 已取消（取消訂單，不扣庫存）
```

---

## API 開發規範（實作前必讀）

### 統一回應格式

```typescript
// 成功
{ "success": true, "data": { ... } }
// 失敗
{ "success": false, "error": "錯誤說明" }
```

### HTTP Status

| Status | 意義 |
|--------|------|
| 200 | 查詢/修改成功 |
| 201 | 新增成功 |
| 400 | 參數錯誤 |
| 404 | 找不到資源 |
| 500 | 伺服器錯誤 |

### 必備區塊（每支 API 都要有）

```typescript
export async function GET(req) {
  try {
    // 1. 取得參數（query / params）
    // 2. 驗證參數
    // 3. 操作資料庫
    // 4. 回傳結果
    return NextResponse.json({ success: true, data: ... })
  } catch (err) {
    console.error('[GET /api/...]', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

### Transaction 要一起成功或一起失敗

```typescript
db.transaction(() => {
  // 寫入多張表時，包在同一筆 transaction
  insertOrder.run(...)
  for (const item of items) {
    insertOrderItem.run(...)
  }
})()
// 中途失敗，全部 rollback
```

---

## 環境建置

### Windows（建議）

```powershell
# 1. 確認 Node.js
node -v    # 需要 v20.x
npm -v     # 需要 10.x.x

# 2. Clone 並安裝依賴
git clone https://github.com/Chuannnn1/jinhaoke.git
cd jinhaoke
npm install

# 3. 啟動開發伺服器
npm run dev
# 開啟 http://localhost:3000
```

> 第一次啟動時，`lib/db.ts` 會自動執行 `schema.sql` + `seed.sql`，不需手動 init 資料庫。

---

## Git 協作規範

影片說明（15分鐘）：https://youtu.be/P-nbNgIzlYE

### Branch 命名

| 類型 | 範例 | 用途 |
|------|------|------|
| 功能 | `feat/menu-api` | 新功能開發 |
| 修正 | `fix/order-status-bug` | Bug 修復 |
| 文件 | `docs/api-reference` | 文件更新 |

### Commit 訊息格式

```
<type>: <簡短說明>

[type] 可用：
  feat   — 新功能
  fix    — 修正 bug
  docs   — 文件異動
  refactor — 重構（不影響功能）
  chore  — 雜項（相依更新、脚本等）
```

### 合併流程

```
main（隨時可部署）
  └── feat/menu-api（功能完成後）
          │
          ├── PR → Code Review
          │
          └── Merge（squash merge 進 main）
```

> **重要**：所有變更透過 PR 併入 main，不要直接 push 到 main。

---

## 缴交成品規格（10天後）

- ✅ 前台：顧客觸控點餐、購物車、訂單送出
- ✅ 後台：五欄訂單看板（待製作/製作中/待付款/已完成/已取消）
- ✅ 庫存：出餐時扣庫存（PATCH orders/status → done）
- ✅ API：10/26 支（menu 5支 + orders 5支）
- ❌ API：其餘 16 支（庫存/供應商/食材/報表）
- ❌ 後台頁面：選單 CRUD、庫存管理、供應商管理、報表頁面
- ❌ 部署：VPS + Tailscale Funnel