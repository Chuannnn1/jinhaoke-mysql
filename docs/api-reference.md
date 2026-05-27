# 金濠客食堂 API 文件

> 版本：v3（2026-05-26）
> 前端參考この文件後端實作

---

## 基本規格

### 通用規格
- Content-Type：`application/json`
- 回傳格式統一：`{ success: boolean, data?: T, error?: string }`
- 錯誤 HTTP Status：400（參數錯誤）、404（找不到）、500（伺服器錯誤）
- 成功 HTTP Status：200（查詢/修改）、201（新增）

### 通用錯誤回應
```json
{ "success": false, "error": "錯誤說明" }
```

---

## 📋 餐點 Menu

### `GET /api/menu` — 取得菜單

**查詢參數（可選）：**
| 參數 | 類型 | 說明 |
|------|------|------|
| `category` | string | 依分類篩選（如：`主食`）|

**成功回應（200）：**
```json
{
  "success": true,
  "data": [
    {
      "item_id": 1,
      "name": "蒜泥白肉",
      "category": "主食",
      "price": 160,
      "emoji": "🥩",
      "tag": "豬",
      "sub": "二片",
      "option": "加肉+60",
      "description": "",
      "is_active": 1
    }
  ]
}
```

---

### `POST /api/menu` — 新增品項

**請求 body：**
```json
{
  "name": "蒜泥白肉",
  "category": "主食",
  "price": 160,
  "emoji": "🥩",
  "tag": "豬",
  "sub": "二片",
  "option": "加肉+60",
  "description": "可選，品項描述"
}
```

| 欄位 | 必填 | 說明 |
|------|------|------|
| `name` | ✅ | 品項名稱 |
| `category` | ✅ | 分類（主食/湯品/小菜...）|
| `price` | ✅ | 價格（整數）|
| `emoji` | ❌ | 顯示用表情符號 |
| `tag` | ❌ | 蛋白質分類（魚/豬/雞/牛/其他），預設「其他」|
| `sub` | ❌ | 副標說明 |
| `option` | ❌ | 加購說明 |
| `description` | ❌ | 品項描述 |

**成功回應（201）：**
```json
{
  "success": true,
  "data": {
    "item_id": 26,
    "name": "蒜泥白肉",
    ...
  }
}
```

---

### `GET /api/menu/:id` — 取得單一品項

**路徑參數：**
| 參數 | 說明 |
|------|------|
| `id` | menu_item.item_id |

**成功回應（200）：**
```json
{
  "success": true,
  "data": {
    "item_id": 1,
    "name": "蒜泥白肉",
    "category": "主食",
    "price": 160,
    "emoji": "🥩",
    "tag": "豬",
    "sub": "二片",
    "option": "加肉+60",
    "description": "",
    "is_active": 1
  }
}
```

**查無此品項（404）：**
```json
{ "success": false, "error": "找不到品項" }
```

---

### `PUT /api/menu/:id` — 修改品項

**路徑參數：**
| 參數 | 說明 |
|------|------|
| `id` | menu_item.item_id |

**請求 body（所有欄位皆可局部更新）：**
```json
{
  "name": "蒜泥白肉（升級版）",
  "price": 180,
  "emoji": "🥩",
  "tag": "豬",
  "sub": "三片",
  "option": "加肉+80",
  "description": "新品上市",
  "is_active": 1
}
```

**成功回應（200）：**
```json
{ "success": true }
```

**查無此品項（404）：**
```json
{ "success": false, "error": "找不到品項" }
```

---

### `DELETE /api/menu/:id` — 刪除品項

> 實為軟刪除（is_active 設為 0），不影響历史訂單。

**路徑參數：**
| 參數 | 說明 |
|------|------|
| `id` | menu_item.item_id |

**成功回應（200）：**
```json
{ "success": true }
```

**查無此品項（404）：**
```json
{ "success": false, "error": "找不到品項" }
```

---

## 📦 訂單 Orders

### `GET /api/orders` — 取得全部訂單

**查詢參數（可選）：**
| 參數 | 類型 | 說明 |
|------|------|------|
| `status` | string | 篩選狀態（`pending`/`preparing`/`completed`）|

**成功回應（200）：**
```json
{
  "success": true,
  "data": [
    {
      "order_id": "A202605260001",
      "customer_name": "王小明",
      "status": "pending",
      "note": "不要蔥",
      "created_at": "2026-05-26 12:00:00",
      "items": [
        {
          "item_id": 1,
          "name": "蒜泥白肉",
          "quantity": 2,
          "unit_price": 160,
          "subtotal": 320
        }
      ],
      "total": 320
    }
  ]
}
```

**狀態對照表（前後台）：**
| 後台值 | 資料庫值 |
|--------|----------|
| `pending` | `待製作` |
| `preparing` | `製作中` |
| `done` | `已完成` |

---

### `POST /api/orders` — 新增訂單（前台下單）

**請求 body：**
```json
{
  "customer_name": "王小明",
  "customer_phone": "0912345678",
  "note": "不要蔥",
  "items": [
    { "item_id": 1, "quantity": 2 },
    { "item_id": 3, "quantity": 1 }
  ]
}
```

| 欄位 | 必填 | 說明 |
|------|------|------|
| `customer_name` | ✅ | 顧客姓名 |
| `customer_phone` | ❌ | 顧客電話（外送必填）|
| `note` | ❌ | 備註 |
| `items` | ✅ | 購物車內容（不可為空）|

**items 格式：**
```json
[
  { "item_id": 1, "quantity": 2 },
  { "item_id": 3, "quantity": 1 }
]
```

**成功回應（201）：**
```json
{
  "success": true,
  "data": { "order_id": "A202605260001" }
}
```

**範例錯誤：**
```json
// 姓名空白
{ "success": false, "error": "請輸入顧客姓名", "status": 400 }

// 購物車空的
{ "success": false, "error": "購物車是空的", "status": 400 }
```

---

### `PATCH /api/orders/status` — 更新訂單狀態

**請求 body：**
```json
{
  "order_id": "A202605260001",
  "status": "preparing"
}
```

| 欄位 | 必填 | 說明 |
|------|------|------|
| `order_id` | ✅ | 訂單編號 |
| `status` | ✅ | `pending` / `preparing` / `done` |

**成功回應（200）：**
```json
{ "success": true }
```

**出餐時（`done`）** — 系統會同時：
1. 依據 `recipe` 扣除各項食材庫存
2. 訂單狀態改為「已完成」

---

## 🏭 庫存 Inventory

### `GET /api/inventory` — 取得庫存列表

**成功回應（200）：**
```json
{
  "success": true,
  "data": [
    {
      "name": "胛心肉",
      "stock_qty": 5.5,
      "safety_stock": 10,
      "stock_unit": "斤",
      "supplier_name": "大園肉商"
    }
  ]
}
```

---

### `POST /api/orders/auto-restock` — 一鍵補貨

> 自動找出低於安全存量的食材，產生進貨單。

**請求 body：**
```json
{
  "supplier_name": "大園肉商"
}
```

| 欄位 | 必填 | 說明 |
|------|------|------|
| `supplier_name` | ✅ | 供應商名稱 |

**成功回應（201）：**
```json
{
  "success": true,
  "data": {
    "po_id": 1,
    "items": [
      { "ingredient_name": "胛心肉", "order_qty": 10, "total_cost": 600 }
    ]
  }
}
```

**無需補貨時（200）：**
```json
{
  "success": true,
  "data": { "po_id": null, "items": [], "message": "所有食材庫存充足" }
}
```

---

### `POST /api/purchase-orders/:id/receive` — 驗貨入庫

> 供應商送達後，確認進貨數量並入庫。

**路徑參數：**
| 參數 | 說明 |
|------|------|
| `id` | purchase_order.po_id |

**請求 body：**
```json
{
  "received_items": [
    { "ingredient_name": "胛心肉", "received_qty": 10 }
  ]
}
```

| 欄位 | 必填 | 說明 |
|------|------|------|
| `received_items` | ✅ | 驗貨項目陣列 |
| `received_items[].ingredient_name` | ✅ | 食材名稱 |
| `received_items[].received_qty` | ✅ | 實際收到的數量（stock_unit）|

**成功回應（200）：**
```json
{ "success": true }
```

---

## 👥 供應商 Supplier

### `GET /api/suppliers` — 取得供應商列表

**成功回應（200）：**
```json
{
  "success": true,
  "data": [
    { "name": "大園肉商", "phone": "03-3861234" }
  ]
}
```

---

### `POST /api/suppliers` — 新增供應商

**請求 body：**
```json
{
  "name": "大園肉商",
  "phone": "03-3861234"
}
```

| 欄位 | 必填 | 說明 |
|------|------|------|
| `name` | ✅ | 供應商名稱（PK）|
| `phone` | ❌ | 電話 |

**成功回應（201）：**
```json
{ "success": true }
```

---

### `PUT /api/suppliers/:name` — 修改供應商

**路徑參數：**
| 參數 | 說明 |
|------|------|
| `name` | supplier.name（PK）|

**請求 body：**
```json
{
  "phone": "03-3869999"
}
```

**成功回應（200）：**
```json
{ "success": true }
```

---

### `DELETE /api/suppliers/:name` — 刪除供應商

**成功回應（200）：**
```json
{ "success": true }
```

---

## 🥬 食材 Ingredient

### `GET /api/ingredients` — 取得食材列表

**成功回應（200）：**
```json
{
  "success": true,
  "data": [
    {
      "name": "胛心肉",
      "stock_qty": 5.5,
      "safety_stock": 10,
      "stock_unit": "斤",
      "order_unit": "箱",
      "qty_per_order_unit": 10,
      "supplier_name": "大園肉商"
    }
  ]
}
```

---

### `POST /api/ingredients` — 新增食材

**請求 body：**
```json
{
  "name": "胛心肉",
  "stock_qty": 0,
  "safety_stock": 10,
  "stock_unit": "斤",
  "order_unit": "箱",
  "qty_per_order_unit": 10,
  "supplier_name": "大園肉商"
}
```

| 欄位 | 必填 | 說明 |
|------|------|------|
| `name` | ✅ | 食材名稱（PK）|
| `stock_qty` | ✅ | 初始庫存 |
| `safety_stock` | ✅ | 安全存量 |
| `stock_unit` | ✅ | 庫存單位（斤/片/隻/kg）|
| `order_unit` | ✅ | 叫貨單位（箱/包/盒）|
| `qty_per_order_unit` | ✅ | 每個叫貨單位等於多少 stock_unit |
| `supplier_name` | ❌ | 供應商 |

**成功回應（201）：**
```json
{ "success": true }
```

---

### `PUT /api/ingredients/:name` — 修改食材

**路徑參數：**
| 參數 | 說明 |
|------|------|
| `name` | ingredient.name（PK）|

**請求 body（局部更新）：**
```json
{
  "stock_qty": 15.5,
  "safety_stock": 10,
  "supplier_name": "另一家肉商"
}
```

**成功回應（200）：**
```json
{ "success": true }
```

---

### `DELETE /api/ingredients/:name` — 刪除食材

**成功回應（200）：**
```json
{ "success": true }
```

---

## 📊 報表 Reports

### `GET /api/reports/daily` — 每日營收

**查詢參數（可選）：**
| 參數 | 預設值 | 說明 |
|------|--------|------|
| `date` | 今天 | 日期（YYYY-MM-DD）|

**成功回應（200）：**
```json
{
  "success": true,
  "data": {
    "date": "2026-05-26",
    "orders_count": 12,
    "total_revenue": 4560,
    "top_items": [
      { "name": "蒜泥白肉", "qty": 5, "revenue": 800 }
    ]
  }
}
```

---

### `GET /api/reports/monthly` — 月營收

**查詢參數（可選）：**
| 參數 | 預設值 | 說明 |
|------|--------|------|
| `year` | 今年 | 西元年 |
| `month` | 本月 | 月份（1-12）|

**成功回應（200）：**
```json
{
  "success": true,
  "data": {
    "year": 2026,
    "month": 5,
    "orders_count": 340,
    "total_revenue": 128500,
    "avg_per_order": 378
  }
}
```

---

## 📁 檔案結構

```
app/
├── api/
│   ├── menu/
│   │   ├── route.ts          ← GET + POST /api/menu
│   │   └── [id]/route.ts     ← GET + PUT + DELETE /api/menu/:id
│   ├── orders/
│   │   ├── route.js          ← GET + POST /api/orders（舊）
│   │   └── status/
│   │       └── route.ts      ← PATCH /api/orders/status
│   ├── inventory/
│   │   └── route.ts         ← GET /api/inventory
│   ├── suppliers/
│   │   └── route.ts         ← GET + POST /api/suppliers
│   ├── ingredients/
│   │   └── route.ts         ← GET + POST /api/ingredients
│   └── reports/
│       ├── daily/
│       │   └── route.ts
│       └── monthly/
│           └── route.ts
lib/
├── db.ts                     ← getDb() 單例
├── schema.sql                ← 10 張表結構
└── seed.sql                  ← 初始測試資料
```

---

## ⚠️ 實作提醒

### 1. Transaction 要一起成功或一起失敗
下訂單同時寫入 `order` + `order_item` + `delivery_customer`，必須包在同一筆 transaction 裡，失敗時全部 rollback。

```typescript
db.transaction(() => {
  upsertCustomer.run(...)
  insertOrder.run(...)
  for (const item of items) {
    insertOrderItem.run(...)
  }
})()
```

### 2. order_item 存單價快照
`unit_price` 是下單時的單價，不是 `menu_item.price`。未來調漲 menu_item.price 不能影響歷史訂單。

### 3. FK 約束要開啟
`PRAGMA foreign_keys = ON;` 否則 SQLite 不會阻擋無效的 FK 操作。

### 4. 食材庫存在出餐時扣除
不是下單時扣除，是 `PATCH /api/orders/status` 狀態改為 `done` 時才扣庫存。