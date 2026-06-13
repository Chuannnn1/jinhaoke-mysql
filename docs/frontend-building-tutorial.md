# 前端 Building Tutorial（前台點餐頁）

> 適用對象：負責前台 UI 的組員  
> 必備能力：JavaScript 基礎、知道 React 是什麼（useState / useEffect）  
> 更新日期：2026-05-27

---

## 1. 這份文件要教你做什麼

把 `app/page.jsx` 從無到有讀懂，然後能自己改功能、加功能。

---

## 2. 環境確認

```bash
# 1. 進到專案資料夾
cd C:\Users\Chuannnn\Documents\GitHub\jinhaoke

# 2. 啟動開發伺服器
npm run dev

# 3. 開瀏覽器
http://localhost:3100
```

看到「金濠客食堂」的側邊欄 + 分類篩選 + 購物車就代表正常。

---

## 3. 程式碼結構一覽

```
jinhaoke/
└── app/
    ├── page.jsx          ← 前台全部在這支（側邊欄 + 菜單 + 購物車）
    ├── layout.jsx        ← 根元件（只放字體、metadata）
    └── globals.css       ← 全域樣式（卡片、陰影等共用樣式）
```

> 目前**沒有抽元件**，全部寫在一支 `page.jsx`（419 行）。看懂這支再去想要怎麼重構。

---

## 4. State 架構（弄懂這些就能動手改）

```jsx
export default function CustomerOrderPage() {

  // ---- 菜單狀態 ----
  const [menu, setMenu]           = useState([])      // 從 API 拿來的菜單
  const [menuLoading, setMenuLoading] = useState(true)
  const [menuError, setMenuError] = useState(null)
  const [activeTag, setActiveTag] = useState('全部')   // 目前的蛋白質篩選

  // ---- 購物車狀態 ----
  const [cart, setCart]           = useState([])       // [{...item, quantity: 2}, ...]
  const [cartOpen, setCartOpen]   = useState(false)   // 購物車面板是否展開
  const [customerNote, setCustomerNote] = useState('') // 顧客備註

  // ---- 訂單完成彈窗 ----
  const [justOrdered, setJustOrdered] = useState(null) // { orderId, items, total }
  const [orderDone, setOrderDone] = useState(false)
```

---

## 5. 從 API 取菜單

```jsx
useEffect(() => {
  fetch('/api/menu')
    .then(r => r.json())
    .then(data => {
      if (data.success) setMenu(data.data)
      setMenuLoading(false)
    })
    .catch(() => {
      // API 掛了就把 FALLBACK_MENU 拿出來撐著
      setMenu(FALLBACK_MENU)
      setMenuLoading(false)
    })
}, [])
```

> `FALLBACK_MENU` 是靜態常數（line 12-38），純粹是防止 API 掛掉時 UI 全空。  
> 如果 API 正常，永遠用 `menu` state，不會用到 `FALLBACK_MENU`。

---

## 6. 蛋白質篩選（所有 / 豬 / 雞 / 牛 / 魚 / 其他）

```jsx
// line 8
const PROTEIN_TAGS = ['全部', '豬', '雞', '牛', '魚', '其他']

// 畫面上：
<button
  className={activeTag === tag ? '...' : '...'}
  onClick={() => setActiveTag(tag)}
>
  {tag}
</button>

// 篩選邏輯：
const filteredMenu = activeTag === '全部'
  ? menu
  : menu.filter(item => item.tag === activeTag)
```

---

## 7. 類別分組（手作便當 / 燴飯 / 單點）

```jsx
// 所有菜單先依蛋白質篩選，再依類別分組展示
const CATEGORIES = ['手作便當', '燴飯', '單點']

{CATEGORIES.map(cat => {
  const catItems = filteredMenu.filter(i => i.category === cat)
  if (catItems.length === 0) return null
  return (
    <div key={cat}>
      <h3>{cat}</h3>
      {catItems.map(item => <MenuCard key={item.item_id} item={item} />)}
    </div>
  )
})}
```

---

## 8. 加入購物車（每一行都要懂）

```jsx
const addToCart = (item) => {
  setCart(prev => {
    // 檢查購物車裡有沒有這個品項
    const existing = prev.find(i => i.item_id === item.item_id)

    if (existing) {
      // 有 → 數量 +1，回傳新陣列
      return prev.map(i =>
        i.item_id === item.item_id
          ? { ...i, quantity: i.quantity + 1 }
          : i
      )
    }

    // 沒有 → 新增，預設 quantity = 1
    return [...prev, { ...item, quantity: 1 }]
  })

  // 加完自動開啟購物車面板
  setCartOpen(true)
}
```

> **為什麼不用 `cart.push()`？**  
> 因為 React 要用新陣列才會觸發 re-render。`push` 會改變同一個陣列，React 不知道有變化。

---

## 9. 修改數量（+1 / -1）

```jsx
const updateQuantity = (itemId, delta) => {
  setCart(prev => prev.map(i => {
    if (i.item_id === itemId) {
      const newQty = i.quantity + delta
      return newQty === 0 ? null : { ...i, quantity: newQty }
    }
    return i
  }).filter(Boolean))  // 數量變 0 的品項直接移除
}
```

---

## 10. 送出訂單（POST /api/orders）

```jsx
const handleSubmit = async () => {
  if (cart.length === 0) {
    alert('購物車是空的')
    return
  }

  const payload = {
    customer_name: '現場顧客',  // 前台目前不收集姓名
    customer_phone: '',
    note: customerNote,
    // 前端只傳 item_id + quantity，後端查價格
    items: cart.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
  }

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

  // 成功：顯示訂單編號，3 秒後清除所有狀態
  setJustOrdered({
    orderId: data.data.order_id,
    items: cart.length,
    total: cart.reduce((sum, i) => sum + i.price * i.quantity, 0),
  })
  setOrderDone(true)

  setTimeout(() => {
    setCart([])
    setCustomerNote('')
    setOrderDone(false)
    setCartOpen(false)
  }, 3000)
}
```

---

## 11. 購物車面板（slide-in 動畫）

面板**永遠在 DOM 裡**，靠 CSS 控制顯示/隱藏：

```jsx
<div
  className="fixed top-0 right-0 h-screen w-[380px] ..."
  style={{ transform: cartOpen ? 'translateX(0)' : 'translateX(100%)' }}
>
```

- `cartOpen = true` → `translateX(0)` → 面板從右邊滑進來
- `cartOpen = false` → `translateX(100%)` → 滑出去

好處：動畫流暢，不會像 `display: none` 那樣跳一下。

---

## 12. 設計系統（配色/字型）

### 色彩
```
炭黑 #1a1a1a   → 側邊欄背景
金色 #d4a84b   → 主要按鈕、選中狀態
奶油白 #faf8f5 → 背景、卡片
```

### 字型
```
font-display  → Playfair Display（Logo 標題）
font-body    → DM Sans（內文、按鈕）
font-mono    → JetBrains Mono（價格、桌號）
```

---

## 13. 功能檢查清單（完成後逐項打勾）

- [ ] 分類篩選（全部/豬/雞/牛/魚/其他）正常切換
- [ ] 點任一餐點卡自動開啟購物車
- [ ] +/- 按鈕增減數量正確
- [ ] 數量減到 0 自動移除該品項
- [ ] 送出訂單顯示訂單編號
- [ ] 3 秒後自動清除購物車
- [ ] 送出失敗顯示錯誤訊息
- [ ] API 掛掉時有 FALLBACK_MENU 撐著（UI 不全空）

---

## 14. 常見改動示範

### 需求：加上顧客姓名輸入框

**Step 1**：在 cart panel 加一個 input
```jsx
<input
  type="text"
  placeholder="請輸入姓名"
  value={customerName}
  onChange={e => setCustomerName(e.target.value)}
/>
```

**Step 2**：加 state
```jsx
const [customerName, setCustomerName] = useState('')
```

**Step 3**：POST payload 加上
```jsx
customer_name: customerName || '現場顧客',
```

---

### 需求：加「加購配料」

menu_item 已有 `option` 欄位（字串），例如 `"加肉+60 / 加菜+10"`。

在 MenuCard 顯示：
```jsx
{item.option && (
  <p className="text-xs text-charcoal-700 mt-1">{item.option}</p>
)}
```

---

## 15. 下一步（給你自己的練習）

1. 把 FALLBACK_MENU 改成真的串 API（現在已經串好了）
2. 把 `page.jsx` 抽出成元件：`<Sidebar>`、`<MenuCard>`、`<CartPanel>`、`<SuccessModal>`
3. 加桌號輸入（目前寫死 `桌號 · A3`）