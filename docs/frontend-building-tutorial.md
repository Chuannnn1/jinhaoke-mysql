# 前端 Building Tutorial（前台）
## Frontend Building Tutorial — jinhaoke 前台點餐頁

> 適用對象：需要修改或擴展前台功能的前端開發者  
> 更新日期：2026-05-25  
> 前端語言：JavaScript（.jsx）| 框架：Next.js 14 App Router | 樣式：Tailwind CSS

---

## 前置知識：這份 tutorial 假設你已經

- 跑得起 `npm run dev`（http://localhost:3100）
- 看過 `app/page.jsx` 的程式碼
- 了解 React 基本鉤子（useState / useEffect）

如果還沒跑起來，先看 [getting-started.md](getting-started.md)。

---

## 1. 前台是什麼？

前台（`app/page.jsx`）是**顧客觸控點餐介面**。功能流程：

```
瀏覽菜單（依蛋白質標籤篩選）
    → 加入購物車
        → 填備註
            → 送出訂單（POST /api/orders）
                → 顯示成功彈窗（3 秒後自動清除）
```

**不涉及庫存查詢、不涉及管理功能。** 純展示 + 下單。

---

## 2. 專案架構

```
jinhaoke/
└── app/
    ├── page.jsx              ← 【前台主頁】整頁在這一支檔案裡
    ├── layout.jsx             ← Root Layout（字體、全域 metadata）
    ├── globals.css            ← Design tokens + 共用元件 (.card, .card-hover)
    └── admin/                ← 【後台】另一回事，不在這份教學範圍
```

> 前台目前**沒有抽元件**，所有 UI 邏輯都在 `page.jsx` 裡面。
> 如果要重構，會把 Sidebar / MenuCard / CartPanel / SuccessModal 抽出成獨立元件。

---

## 3. 設計系統（Design Tokens）

`tailwind.config.js` 定義了金濠客的品牌色彩。`globals.css` 定義了全域變數。

### 3.1 色彩

```
gold-50   #FBF7F0   背景色（淡米黃）
gold-100  #F5EBDA   Card 背景
gold-200  #E8D5B0   邊框
gold-400  #C4A265   主色（按鈕、選中狀態）
gold-500  #A8893E   價格文字
gold-600  #8B7030   Hover 深色

charcoal-900  #1A1A1A   主文字
charcoal-800  #2D2D2D   側邊欄背景
charcoal-700  #3D3D3D   次要文字

cream  #FFFDF8   卡片白
danger #C0392B   錯誤/刪除
success #5A8F5A  成功
```

### 3.2 字型

```
font-display  → Playfair Display（標題 logo）
font-body     → DM Sans（內文、按鈕）
font-mono     → JetBrains Mono（價格、桌號）
```

### 3.3 共用元件（globals.css）

```css
/* globals.css */
.card        → 白卡片（cream 底 + 金色微邊框 + 陰影）
.card-hover  → hover 時往上浮 2px + 陰影加深
```

使用方式：`<button className="card card-hover">`

---

## 4. 資料結構：Menu Item

目前是**靜態常數**（還沒串 API）：

```javascript
// app/page.jsx
const MOCK_MENU = [
  {
    item_id: 101,
    name: '大比目魚排便當',
    sub: '扁鱈',           // 副標（選填）
    category: '手作便當',  // 用來分組
    tag: '魚',             // 用來篩選（全部/豬/雞/牛/魚/其他）
    price: 130,
    emoji: '🐟',
    option: '加肉60/加菜10' // 備註（選填）
  },
  // ...
]
```

**實驗室即將串 API**（待辨事項），屆時會變成：

```javascript
const [menu, setMenu] = useState([])

useEffect(() => {
  fetch('/api/menu')
    .then(r => r.json())
    .then(data => setMenu(data.data))
}, [])
```

---

## 5. State 架構

| State 名稱 | 型別 | 用途 |
|-----------|------|------|
| `activeTag` | string | 目前選的蛋白質篩選（'全部'/'豬'/'雞'/...）|
| `cart` | array | 購物車內容 `[{...item, quantity: 2}]` |
| `cartOpen` | boolean | 購物車面板是否開啟（控制 slide-in）|
| `customerNote` | string | 備註文字 |
| `orderDone` | boolean | 成功彈窗是否顯示 |
| `justOrdered` | object | 最後一筆訂單資訊（用來顯示 order_id 和總金額）|

---

## 6. 核心函式邏輯

### 6.1 加入購物車

```javascript
const addToCart = (item) => {
  setCart(prev => {
    const existing = prev.find(i => i.item_id === item.item_id)
    if (existing) {
      // 已存在 → 數量 +1
      return prev.map(i =>
        i.item_id === item.item_id
          ? { ...i, quantity: i.quantity + 1 }
          : i
      )
    }
    // 不存在 → 新增，預設數量 1
    return [...prev, { ...item, quantity: 1 }]
  })
  setCartOpen(true) // 加完自動開啟購物車
}
```

### 6.2 修改數量

```javascript
const updateQuantity = (itemId, delta) => {
  setCart(prev => prev.map(i => {
    if (i.item_id === itemId) {
      const newQty = Math.max(0, i.quantity + delta)
      return newQty === 0 ? null : { ...i, quantity: newQty }
    }
    return i
  }).filter(Boolean)) // 數量變 0 就移除該項
}
```

### 6.3 送出訂單

```javascript
const handleSubmit = async () => {
  if (cart.length === 0) return alert('購物車是空的')

  const payload = {
    customer_name: '現場顧客',
    customer_phone: '',
    note: customerNote,
    items: cart.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
  }

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()

    if (!data.success) {
      alert(data.error || '送出失敗')
      return
    }

    // 成功：顯示彈窗，3 秒後清除購物車
    setJustOrdered({ orderId: data.data.order_id, items: cart.length, total })
    setOrderDone(true)

    setTimeout(() => {
      setCart([])
      setCustomerNote('')
      setOrderDone(false)
      setCartOpen(false)
    }, 3000)
  } catch (err) {
    alert('連線失敗，請稍後再試')
  }
}
```

---

## 7. Cart Panel 實作技巧

Cart Panel **不是在條件判斷時才 render**，而是**永遠在 DOM 裡**，靠 CSS `translateX` 控制位置：

```jsx
<div
  className="fixed top-0 right-0 h-screen w-[380px] ..."
  style={{ transform: cartOpen ? 'translateX(0)' : 'translateX(100%)' }}
>
```

好處：動畫流暢（300ms cubic-bezier），不會有 `display: none → block` 的跳動。

---

## 8. 從 Mock Data 改接 API（練習題）

### Step 1：把 MOCK_MENU 變成 useState

```javascript
const [menu, setMenu] = useState([])
const [loading, setLoading] = useState(true)

useEffect(() => {
  fetch('/api/menu')
    .then(r => r.json())
    .then(data => {
      setMenu(data.data || [])
      setLoading(false)
    })
    .catch(() => setLoading(false))
}, [])
```

### Step 2：把 `MOCK_MENU` 置換成 `menu`

```javascript
// 篩選
const filteredMenu = activeTag === '全部'
  ? menu
  : menu.filter(item => item.tag === activeTag)

// 類別分組（不改）
{['手作便當', '燴飯', '單點'].map(cat => {
  const catItems = filteredMenu.filter(i => i.category === cat)
  // ...
})}
```

### Step 3：API 還沒實作怎麼辦？

在 API 實作前可以先用 MSW（Mock Service Worker）或直接對 `/api/menu/route.ts` 先實作 GET endpoint。

---

## 9. 目錄範例：如何擴展前台

### 需求：新增「加購配料」功能

```
1. 修改 MOCK_MENU → 每個 item 多一個 `addons` 陣列
2. 新增 state：`const [selectedAddons, setSelectedAddons] = useState({})`
3. 在 Cart Panel 裡對每個品項 render addons 勾選框
4. 提交時把 addons 一起送給 /api/orders
```

### 需求：顯示歷史訂單

```
1. 新增 `app/history/page.jsx`
2. GET /api/orders?phone=xxx
3. 列表 render，並用顏色區分訂單狀態
```

---

## 10. 運行與驗證

```bash
# 啟動開發伺服器
npm run dev

# 開兩瀏覽器分頁
# Tab 1: http://localhost:3100      → 前台
# Tab 2: http://localhost:3100/admin → 後台
```

**功能檢查清單：**

- [ ] 蛋白質篩選按鈕（全部/豬/雞/牛/魚/其他）正常切換
- [ ] 點擊品項卡片自動開啟購物車
- [ ] +/- 按鈕數量增減正確
- [ ] 數量歸零自動移除品項
- [ ] 備註文字框可輸入
- [ ] 送出訂單後顯示成功彈窗（3 秒後自動消失）
- [ ] 送出失敗顯示錯誤訊息

---

## 11. 已知限制（待完成事項）

| 項目 | 狀態 | 說明 |
|------|------|------|
| Menu 串 API | 待實作 | 目前是 MOCK_MENU |
| 外送表單 | 僅現場顧客 | 可擴展新增姓名電話地址 |
| 優惠券/折扣 | 無 | 可擴展 cart 層級折扣 |
| 訂單查詢（電話） | 無 | 顧客查歷史訂單 |

---

## 12. 下一步

- 實作 `/api/menu` GET endpoint → [typescript-api-building-tutorial.md](typescript-api-building-tutorial.md)
- 擴展 Cart Panel → 研究 Lucide React 圖示
- 部署到 VPS → README.md Section 3