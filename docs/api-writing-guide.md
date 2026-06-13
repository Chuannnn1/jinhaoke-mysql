# API 怎麼寫：PATCH /api/orders/status 逐段解析

> 以 `app/api/orders/status/route.ts` 為例，從頭到尾一行一行說明。

---

## 1. 最上面的 import

```typescript
import { getDb } from '@/lib/db'
import { NextResponse } from 'next/server'
```

- `getDb` 是你自己寫的工具，負責拿 SQLite 連線（singleton 模式，效能較好）
- `NextResponse` 是 Next.js 封裝好的 HTTP 回應工具，用來回傳 JSON

`@/` 是 path alias，在 `tsconfig.json` 裡定義指向專案根目錄：
```json
"paths": { "@/*": ["./*"] }
```
所以 `@/lib/db` = `lib/db.ts`（不管檔案在哪個資料夾層級都用同一個路徑）。

---

## 2. 型別定義（先定義資料的形狀）

```typescript
interface UpdateStatusBody {
  order_id: string
  status: string
}

interface ApiResponse {
  success: boolean
  error?: string
}

interface OrderItemRow {
  item_id: number
  quantity: number
  item_name: string
}

interface RecipeRow {
  item_id: number
  ingredient_name: string
  consume_qty: number
  stock: number
  stock_unit: string
}
```

**為什麼要先寫 interface？**

TypeScript 要知道「這筆資料長怎樣」才能幫你檢查錯誤。

沒有 interface 時，`db.prepare().all()` 回傳的型別是 `unknown[]`，TS 會把 `row.item_id` 當 unknown，任何操作都會被 TS 攔截、紅字一片。

有 interface + `as Xxx[]` 強制作業後，TS 知道 `row.item_id` 是 `number`，可以正常運算。

---

## 3. 進入點 — export async function PATCH

```typescript
export async function PATCH(request: Request) {
```

Next.js App Router 會自動把同個檔案裡的 `GET`、`POST`、`PATCH` 對應到對應的 HTTP verb。

所有函式都是 `async`（非同步），因為資料庫操作是 I/O，必須等待。

---

## 4. 解析 request body

```typescript
const body: UpdateStatusBody = await request.json()
```

`await request.json()` 把前端送來的 JSON 解析成 JS 物件。

加 `: UpdateStatusBody` 是強制作業，讓 TypeScript 知道這筆資料的形狀，後面用到 `body.order_id` 時才不會爆 unknown 錯誤。

---

## 5. 參數驗證（第一層防守）

```typescript
if (!body.order_id || !body.status) {
  return NextResponse.json<ApiResponse>(
    { success: false, error: '缺少 order_id 或 status' },
    { status: 400 }
  )
}
```

- `400` = 客戶端送來的東西不對，是他們的錯
- 如果參數驗證都不過，剩下的程式碼根本不需要執行，直接 return 擋掉
- 這叫 **fail fast**（先失敗、先離開）

---

## 6. 拿資料庫連線

```typescript
const db = getDb()
```

到這裡才真正去碰 DB。之前都是在處理參數，沒道理先拿連線。

`getDb()` 回傳的是一個 `Database` 實例，後面 `.prepare()`、`.transaction()` 都從這裡來。

---

## 7. 早期返回（非已完成就直接更新）

```typescript
// 不是「已完成」：只更新狀態，不扣庫存
if (dbStatus !== '已完成') {
  db.prepare(`UPDATE "order" SET status = ? WHERE order_id = ?`)
    .run(dbStatus, body.order_id)
  return NextResponse.json<ApiResponse>({ success: true })
}
```

如果目標狀態不是「已完成」，就只是一般狀態更新，不需要扣庫存，直接 UPDATE → return。

這叫 **early return**，先處理的先離開，讓邏輯更清楚。

- 待製作 → 製作中：只更新 status
- 製作中 → 待製作：只更新 status
- 製作中 → 已完成：**才需要扣庫存**

---

## 8. Step 1：查這張訂單的品項

```typescript
const orderItems = db.prepare(`
  SELECT oi.item_id, oi.quantity, mi.name AS item_name
  FROM order_item oi
  JOIN menu_item mi ON oi.item_id = mi.item_id
  WHERE oi.order_id = ?
`).all(body.order_id) as OrderItemRow[]
```

- `.all()` = 執行 SQL，回傳所有符合的列（陣列）
- `as OrderItemRow[]` = 強制作業，讓 TS 知道每個欄位的型別
- `JOIN` 同時帶出名稱，是為了未來可能需要顯示在 UI 上

---

## 9. Step 2：查這些品項的配方

```typescript
const itemIds = orderItems.map(i => i.item_id)
const recipes = db.prepare(`
  SELECT r.item_id, r.ingredient_name, r.consume_qty, i.stock, i.stock_unit
  FROM recipe r
  JOIN ingredient i ON r.ingredient_name = i.name
  WHERE r.item_id IN (${itemIds.map(() => '?').join(',')})
`).all(...itemIds) as RecipeRow[]
```

**動態產生 SQL 的 `IN` 子句：**
```javascript
itemIds = [1, 3, 7]
itemIds.map(() => '?')  // ['?', '?', '?']
itemIds.map(() => '?').join(',')  // '?,?,?'
```

這樣不管這張訂單點了幾品項，SQL 都能正確產生。

`...itemIds` 把陣列攤開成參數傳給 `.all()`（不是包在陣列裡）。

---

## 10. Step 3：Transaction（最重要的一步）

```typescript
db.transaction(() => {
  // 3a. 更新訂單狀態為已完成
  db.prepare(`UPDATE "order" SET status = ? WHERE order_id = ?`)
    .run('已完成', body.order_id)

  // 3b. 扣庫存：對每個品項 × 每個食材
  for (const orderItem of orderItems) {
    const itemRecipes = recipes.filter(r => r.item_id === orderItem.item_id)
    for (const recipe of itemRecipes) {
      const consumed = recipe.consume_qty * orderItem.quantity
      db.prepare(`
        UPDATE ingredient
        SET stock = stock - ?
        WHERE name = ?
      `).run(consumed, recipe.ingredient_name)
    }
  }
})()
```

**Transaction 的意義：**

正常情況：全部執行 → 自動 commit，資料庫寫入完成。

炸機情況：執行到一半伺服器當機 → 自動 rollback，資料庫完全恢復，不留「訂單已完成但庫存只扣一半」的髒資料。

`db.transaction(() => { ... })()` 語法：外面括號觸發執行，等同於：
```typescript
const fn = db.transaction(() => { ... })
fn()
```

---

## 11. 錯誤處理的最後一道防線

```typescript
} catch (error) {
  console.error('PATCH /api/orders/status error:', error)
  return NextResponse.json<ApiResponse>(
    { success: false, error: error instanceof Error ? error.message : '未知錯誤' },
    { status: 500 }
  )
}
```

- `500` = 伺服器自己炸了，不是客戶端的問題
- `error instanceof Error` 是安全檢查，因為 catch 拿到的 `error` 型別是 `unknown`，不能假設它有 `.message`
- `console.error` 留 log，伺服器崩潰時才能追查

---

## 12. 最終回傳格式

```typescript
return NextResponse.json<ApiResponse>({ success: true })
```

所有 API 統一格式：
```json
{ "success": true }                        // 成功
{ "success": false, "error": "錯誤訊息" }   // 失敗
```

前端收到之後只要判斷 `data.success` 就知道結果。

---

## 完整流程圖

```
收到 request
    ↓
解析 JSON + 強制作業
    ↓
參數驗證 → 不過就 400 + return
    ↓
getDb() 拿連線
    ↓
不是「已完成」→ UPDATE status → return
    ↓
是「已完成」才繼續...
    ↓
Step 1：查 order_item（這張單點了什麼、幾份）
    ↓
Step 2：查 recipe（這些餐的配方、消耗量）
    ↓
Step 3：Transaction {
    UPDATE order.status = '已完成'
    迴圈扣每個食材庫存
}
    ↓
成功 → { success: true }
失敗 → catch → 500 + { success: false, error: ... }
```

---

## 這支 API 涵蓋的所有要點

| 要點 | 出現在哪裡 |
|------|-----------|
| 型別定義 | 第 2 段 |
| 參數驗證（fail fast） | 第 5 段 |
| Early return | 第 7 段 |
| SQL JOIN | 第 8、9 段 |
| 動態 SQL（IN 子句） | 第 9 段 |
| Transaction（資料一致性） | 第 10 段 |
| 雙層迴圈（業務邏輯） | 第 10 段 |
| 錯誤處理（unknown 安全） | 第 11 段 |
| 統一回傳格式 | 第 12 段 |