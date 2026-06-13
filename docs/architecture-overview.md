# 金濠客食堂 POS 系統 — 架構總覽

> 從瀏覽器到資料庫，request 經過哪些東西、一路怎麼走的。

---

## 一、整體架構圖

```
┌─────────────────────────────────────────────────────────┐
│  瀏覽器（Browser）                                        │
│                                                         │
│  前台：http://localhost:3100       （顧客點餐）           │
│  後台：http://localhost:3100/admin （管理員看板）         │
└──────────────────┬────────────────────────────────────┘
                   │ HTTP 請求（fetch）
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Next.js 應用程式（同一個 repo）                          │
│                                                         │
│  ├─ app/page.jsx          （前台 React 元件）            │
│  ├─ app/admin/page.jsx    （後台 React 元件）            │
│  └─ app/api/              （API Routes — 我們寫的）      │
│       ├─ menu/route.ts     GET + POST                   │
│       ├─ orders/route.ts   GET + POST                   │
│       └─ orders/status/    PATCH                        │
└──────────────────┬────────────────────────────────────┘
                   │ 呼叫這些函式
                   ↓
┌─────────────────────────────────────────────────────────┐
│  lib/db.ts — SQLite 資料庫                              │
│                                                         │
│  路徑：data/jinhaoke.db                                  │
│  資料：menu_item、order、order_item、recipe、ingredient  │
└─────────────────────────────────────────────────────────┘
```

---

## 二、兩台機器的角色

### 你現在在做的事（開發機）

```
你自己電腦（同時跑兩件事）
├── Next.js 開發伺服器（npm run dev）
│   └── 監聽 localhost:3100
│   └── 處理前端 + API + 讀寫資料庫
│
└── 瀏覽器（Chrome / Edge）
    └── 開著前台、後台頁面
    └── 發送 fetch() 請求到 Next.js
```

**都是同一台機器，只是不同程式在跑。**

---

### 部署之後（未來上線）

```
┌──────────────────┐         ┌──────────────────────────┐
│  顧客 / 管理員    │         │  VPS 雲端主機             │
│  的手機或電腦     │ HTTP    │                          │
│                  │ ──────→ │  Next.js 生產伺服器       │
│                  │         │  (npm run start)          │
│                  │ ←────── │  對外開放的 port 3100     │
└──────────────────┘         └──────────┬───────────────┘
                                         │
                                         │ 讀/寫
                                         ↓
                               ┌─────────────────────┐
                               │  SQLite 資料庫       │
                               │  data/jinhaoke.db   │
                               └─────────────────────┘
```

部署之後，顧客和管理員從**別的機器**透過網路連到你的 VPS。

---

## 三、同一個 Next.js 處理兩件事

Next.js 的 `app/` 目錄，同時容納了「頁面」和「API」：

```
app/
├── page.jsx                    ←  "/" 的頁面（前台）
├── admin/
│   └── page.jsx                 ←  "/admin" 的頁面（後台）
└── api/
    ├── menu/route.ts            ←  "/api/menu" 的 API
    ├── orders/route.ts          ←  "/api/orders" 的 API
    └── orders/status/route.ts   ←  "/api/orders/status" 的 API
```

**頁面（page.jsx）和 API（route.ts）可以同時存在**，路徑不會衝突：
- `/admin` → 找 `app/admin/page.jsx` → 渲染 HTML
- `/api/orders` → 找 `app/api/orders/route.ts` → 處理 JSON

---

## 四、前台呼叫 API 的方式

### fetch 是什麼？

fetch 是瀏覽器內建的 HTTP 請求工具，可以從 JavaScript 發送網路請求。

### 前台怎麼呼叫 API

```javascript
// app/page.jsx 裡
const res = await fetch('/api/menu')          // 送到同樣的 Next.js 伺服器
const data = await res.json()                  // 把 JSON 回應轉成 JS 物件
setMenu(data.data)                             // 用這筆資料更新畫面
```

`/api/menu` 是一個**相對路徑**，瀏覽器會自動送到同一台主機。

### 為什麼叫「同源請求」？

```
前端：      http://localhost:3100/page.jsx
API：       http://localhost:3100/api/menu
```

因為前後端都在同一台機器、同一個 port，所以叫「同源」，不需要處理跨網域（CORS）問題。

---

## 五、lib/db.ts 做了什麼

```typescript
export function getDb(): Database.Database {
  if (!db) {                          // 還沒連線過？
    db = new Database(DB_PATH)        // 建立連線
    db.pragma('foreign_keys = ON')   // 開啟外鍵約束
    db.exec(schema)                   // 跑 schema.sql（建 table）
    seedIfEmpty(db)                   // 如果 table 是空的，寫入 seed 測試資料
  }
  return db
}
```

**重點：**
- 第一次呼叫 `getDb()` 時才初始化，之後都回傳同一個連線（Singleton 模式）
- `data/jinhaoke.db` 是檔案路徑，刪掉它然後重啟 Next.js，資料庫會從零重建

---

## 六、一次請求的完整生命週期

### 情境：顧客按下「送出訂單」

```
1. 顧客在前台頁面（page.jsx）按下「送出」
      ↓
2. handleSubmit() 函式執行
   fetch('/api/orders', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(payload)
   })
      ↓
3. 瀏覽器發送 HTTP POST 到 http://localhost:3100/api/orders
      ↓
4. Next.js 根據 URL 找到 app/api/orders/route.ts
      ↓
5. 執行 POST 函式（我們寫的）
   ├─ 解析 JSON body
   ├─ 驗證參數
   ├─ 產生 order_id
   ├─ db.transaction() {
   │     INSERT INTO "order" ...
   │     INSERT INTO order_item ...
   │   }
   └─ 回傳 { success: true, data: { order_id: 'A202605280001' } }
      ↓
6. 前台收到回應，顯示「訂單成立」彈窗
```

### 情境：後台拖曳訂單卡到「已完成」

```
1. 管理員在後台（admin/page.jsx）把訂單拖到「已完成」
      ↓
2. handleDrop() → fetch('/api/orders/status', {
     method: 'PATCH',
     body: JSON.stringify({ order_id: 'A202605280001', status: 'done' })
   })
      ↓
3. Next.js 找到 app/api/orders/status/route.ts
      ↓
4. 執行 PATCH 函式
   ├─ 解析參數
   ├─ statusMap['done'] → '已完成'
   ├─ order_id 查 order_item → 找出品項與數量
   ├─ 查 recipe → 找出這些品項的配方
   ├─ db.transaction() {
   │     UPDATE order SET status = '已完成'
   │     UPDATE ingredient SET stock = stock - 消耗量
   │   }
   └─ 回傳 { success: true }
      ↓
5. 後台 UI 樂觀更新（直接搬到「已完成」欄）
```

---

## 七、資料流向總結

```
┌─────────────────────────────────────────────────────────────┐
│                         使用者瀏覽器                           │
│                                                             │
│   page.jsx（前台）────→  fetch('/api/orders')  ────→ Next.js │
│   admin/page.jsx（後台）──→  fetch('/api/orders/status') ────→ │
└─────────────────────────────────────────────────────────────┘
                                    │
                                    ↓
┌─────────────────────────────────────────────────────────────┐
│                      Next.js 伺服器                          │
│                                                             │
│   app/api/orders/route.ts   ←─ 讀/寫                         │
│   app/api/orders/status/    ←─ 讀/寫                         │
│                                                             │
│   lib/db.ts  ─────────────────────────────→ SQLite 資料庫     │
│   (getDb())                                             data/jinhaoke.db
└─────────────────────────────────────────────────────────────┘
                                    │
                                    ↓
┌─────────────────────────────────────────────────────────────┐
│                        SQLite 資料庫                          │
│                                                             │
│   menu_item（菜單）                                          │
│   order（訂單主表）                                          │
│   order_item（訂單明細）                                     │
│   recipe（配方）                                             │
│   ingredient（庫存）                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 八、什麼時候動哪個資料夾

| 資料夾 | 動什麼 | 備註 |
|--------|--------|------|
| `app/page.jsx` | 前台 UI | 顧客看到的頁面 |
| `app/admin/page.jsx` | 後台 UI | 管理員的看板 |
| `app/api/xxx/route.ts` | API 商業邏輯 | 對資料庫的讀寫操作 |
| `lib/db.ts` | 資料庫連線管理 | 一般不需動 |
| `lib/schema.sql` | 資料庫的 table 結構 | 要改 table 時才動 |
| `lib/seed.sql` | 測試資料 | 初始化或重置資料庫時用 |
| `data/jinhaoke.db` | SQLite 實體檔案 | 刪掉 + 重啟 = 重置乾淨的資料庫 |