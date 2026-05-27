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
第2層  TypeScript API
  ↓    app/api/（26支 API route）
         ↓
第3層  前台（顧客點餐）
  ↓    app/page.jsx
         ↓
第4層  後台（管理員介面）
  ↓    app/admin/（選單管理、訂單看板、庫存管理、供應商）
         ↓
第5層  啟動 Script
       next.config.js（PORT、Tailscale Funnel）
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
│   │   ├── page.jsx             ← 訂單看板（拖曳更新狀態）
│   │   └── inventory/
│   │       └── page.jsx         ← 庫存管理頁
│   │
│   └── api/                     ← TypeScript API Routes
│       ├── menu/
│       │   ├── route.ts         ← GET（全部）+ POST（新增）
│       │   └── [id]/route.ts    ← GET + PUT + DELETE（軟刪）
│       ├── orders/
│       │   ├── route.ts         ← GET（全部）+ POST（下單）
│       │   └── status/
│       │       └── route.ts     ← PATCH（更新狀態）
│       ├── inventory/           ← （待實作）GET + PUT
│       ├── suppliers/            ← （待實作）CRUD
│       ├── ingredients/          ← （待實作）CRUD
│       ├── purchase-orders/      ← （待實作）CRUD + 驗貨 + 退貨
│       └── reports/              ← （待實作）daily + monthly
│
├── lib/
│   ├── db.ts                    ← SQLite singleton
│   ├── schema.sql                ← 10張表定義（v3）
│   └── seed.sql                  ← 測試資料
│
├── docs/
│   ├── README.md                 ← 本檔案
│   ├── api-reference.md          ← 完整 API 文件（✅ 有）
│   ├── api-guide.md              ← HTTP 方法說明（✅ 有）
│   ├── schema-reference.md        ← 10張表欄位說明（✅ 有）
│   └── ...（其他 tutorial）
│
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

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
| `ingredient` | name（TEXT）| 食材含庫存：stock_qty、safety_stock、叫貨單位設計 |
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

---

## API 開發規範

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
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
```

---

## API 列表（26支）

| # | 方法 | 路由 | 說明 | 狀態 |
|---|------|------|------|------|
| 1 | GET | `/api/menu` | 查詢全部菜單（可 filter by category） | ✅ |
| 2 | POST | `/api/menu` | 新增品項 | ✅ |
| 3 | GET | `/api/menu/:id` | 查詢單一品項 | ✅ |
| 4 | PUT | `/api/menu/:id` | 修改品項 | ✅ |
| 5 | DELETE | `/api/menu/:id` | 軟刪除品項 | ✅ |
| 6 | GET | `/api/orders` | 查詢全部訂單 | ✅ |
| 7 | POST | `/api/orders` | 新增訂單 | ✅ |
| 8 | PATCH | `/api/orders/status` | 更新訂單狀態 | ✅ |
| 9 | DELETE | `/api/orders/:id` | 取消訂單 | ❌ |
| 10 | GET | `/api/inventory` | 查詢庫存 | ❌ |
| 11 | PUT | `/api/inventory/:name` | 調整庫存 | ❌ |
| 12 | GET | `/api/purchase-orders` | 查詢進貨單 | ❌ |
| 13 | POST | `/api/purchase-orders` | 新建進貨單 | ❌ |
| 14 | POST | `/api/orders/auto-restock` | 一鍵補貨 | ❌ |
| 15 | POST | `/api/purchase-orders/:id/receive` | 驗貨入庫 | ❌ |
| 16 | POST | `/api/purchase-orders/:id/return` | 登錄退貨 | ❌ |
| 17 | GET | `/api/suppliers` | 查詢供應商 | ❌ |
| 18 | POST | `/api/suppliers` | 新增供應商 | ❌ |
| 19 | PUT | `/api/suppliers/:name` | 修改供應商 | ❌ |
| 20 | DELETE | `/api/suppliers/:name` | 刪除供應商 | ❌ |
| 21 | GET | `/api/ingredients` | 查詢食材 | ❌ |
| 22 | POST | `/api/ingredients` | 新增食材 | ❌ |
| 23 | PUT | `/api/ingredients/:name` | 修改食材 | ❌ |
| 24 | DELETE | `/api/ingredients/:name` | 刪除食材 | ❌ |
| 25 | GET | `/api/reports/daily` | 每日營收 | ❌ |
| 26 | GET | `/api/reports/monthly` | 月營收 | ❌ |

> ✅ = 已實作　❌ = 待實作

---

## 分工建議

| 層 | 負責人 | 目前進度 |
|---|--------|---------|
| SQL | 確定 | ✅ 完成（10張表） |
| API（✅ 5支） | 確定 | 組員認領 ❌ 21支 |
| 前台 | 你 | ✅ 串 API 完成 |
| 後台 | 組員 | 部分完成（訂單看板 ✅）|
| 啟動腳本 | 待補 | 待補 |

### 協作原則
- **各層独立開發**，上一層串下一層的 API，不直接碰其他層的 code
- **API 格式必須符合** `api-reference.md`，組員實作前先看這份文件
- **HTTP 方法**看 `api-guide.md`
- **Schema 欄位**看 `docs/schema-reference.md`

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

### WSL

```bash
cd ~/jinhaoke/jinhaoke
npm install
npm run dev
```

---

## 常用指令

```bash
# 開發
npm run dev          # 開發模式（熱重載）
npm run build        # 建置 Production 版
npm start            # 啟動 Production 版

# Git
git status           # 查看變更
git add .            # 暫存變更
git commit -m "..."  # 提交
git push             # 推送到 GitHub
git pull             # 拉取並合併
```

---

## 缴交成品規格（預定）

- ✅ 前台：顧客觸控點餐、購物車、訂單送出
- ✅ 後台：訂單看板、狀態拖曳更新
- ❌ 後台：菜單 CRUD、庫存管理、供應商管理
- ❌ 報表：每日/月營收
- ❌ 庫存：自動扣庫存（出餐時）、一鍵補貨
- ❌ 部署：VPS + Tailscale Funnel

---

## 組員文件索引

| 文件 | 用途 |
|------|------|
| [README.md](README.md) | 1. 檔案架構（完整目錄樹 + 五層流程圖） |
| [docs/api-reference.md](docs/api-reference.md) | 2. 全部 26 支 API 的 request / response 格式 |
| [docs/api-guide.md](docs/api-guide.md) | 3. GET / POST / PUT / PATCH / DELETE 差異說明 + 10點實作檢查清單 |
| [docs/schema-reference.md](docs/schema-reference.md) | 4. Schema v3 完整說明（10張表欄位 + 設計決策）|

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
          ├── PR → Code Review（由 Chaeryeong 負責）
          │
          └── Merge（squash merge 進 main）
```

> **重要**：所有變更透過 PR 併入 main，不要直接 push 到 main。