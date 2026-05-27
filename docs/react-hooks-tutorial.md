# React Hooks 入门教學

> 適用對象：想理解 React Hooks 機制的同學  
> 必備知識：JavaScript 基礎（let/const、陣列、函式）  
> 更新日期：2025-05-25

---

## 前言：什麼是 Hooks？

Hooks 是 React 16.8 引入的功能，讓函式元件（function component）可以使用「狀態」和「生命週期」。

在 Hooks 出現之前，只有 Class 元件才能用 state。現在用函式就能做到同樣的事。

**基本原則：**
- Hooks 只能在元件的最上層呼叫（不能放在 if / for 裡面）
- 只能在 React 函式元件內部呼叫（不能在普通函式裡呼叫）

---

## 1. useState — 讓元件「記得」事情

### 1.1 用生活中的例子理解 useState

想像你是服務生，客人點了菜。

- **沒有用 useState**：你用一張紙寫「1桌3份雞腿飯」，但廚房改完你紙上還是舊的，客人看到永遠是「1桌0份」。畫面不會跟著資料更新。

- **有用 useState**：廚房改完，你立刻更新那張紙（`setCount(3)`），客人看到的數字馬上跟著變。

**useState 的核心功能：當資料變了，畫面跟著更新。**

---

### 1.2 第一個計數器

```jsx
'use client'
import { useState } from 'react'

function Counter() {
  // count = 目前的數字（就像服務生手上那張紙）
  // setCount = 更新那張紙的方式
  const [count, setCount] = useState(0)  // 0 是初始值：一開始從 0 開始數

  return (
    <button onClick={() => setCount(count + 1)}>
      點了 {count} 次
    </button>
  )
}
```

把這個檔案存成 `.jsx`，放到 Next.js 的 `app/` 底下，掛上去就能跑。點一次按鈕數字就 +1。

---

### 1.3 常見例子：購物車開關

```jsx
// 購物車一開始是關的
const [cartOpen, setCartOpen] = useState(false)

// 按按鈕，把 cartOpen 改成 true（開啟）
const openCart = () => setCartOpen(true)

// 按另一個按鈕，把 cartOpen 改成 false（關閉）
const closeCart = () => setCartOpen(false)

// 或者直接切換
const toggleCart = () => setCartOpen(!cartOpen)
```

cartOpen 是 `false` 的時候，購物車面板用 `translateX(100%)` 藏在畫面外面。  
cartOpen 變成 `true` 的時候，麵板滑進來。就是這個原理。

---

### 1.4 購物車品項清單

```jsx
// 購物車一開始是空的
const [cart, setCart] = useState([])

// 加一個品項到購物車
const addItem = (item) => {
  setCart([...cart, item])  // 把現有 cart 的東西都拿出來，加上新 item
}

// 清除購物車
const clearCart = () => setCart([])
```

---

### 1.5 更安全的寫法：prev

```jsx
// ❌ 常見錯誤：直接改陣列
cart.push(newItem)
setCart(cart)  // 这样 React 不会重新渲染，因为引用没变

// ✅ 正確：建立新的陣列
setCart([...cart, newItem])

// ✅ 更安全：用函式写法（prev = 現在的值）
setCart(prev => [...prev, newItem])
```

**什麼時候用 `prev =>` 這種寫法？**

當你更新狀態的時候，需要知道原來的值是多少。

```jsx
// 例子：數量 +1（必須知道原來是幾才能加）
setCart(prev => prev.map(item =>
  item.item_id === id ? { ...item, quantity: item.quantity + 1 } : item
))
```

如果用 `setCart([...cart])` 直接替換，React 有時會因為「看不出來有改變」而不重新渲染。

---

### 1.6 jinhaoke 前台真實程式碼對照

打開 `app/page.jsx`，找到這段：

```jsx
const [activeTag, setActiveTag] = useState('全部')   // 目前選的蛋白質篩選
const [cart, setCart] = useState([])                // 購物車品項
const [cartOpen, setCartOpen] = useState(false)     // 購物車面板是否開啟
const [customerNote, setCustomerNote] = useState('') // 顧客填的備註
const [orderDone, setOrderDone] = useState(false)    // 成功彈窗是否顯示
const [justOrdered, setJustOrdered] = useState(null) // 最後一筆訂單資訊
```

這 6 個 `useState` 控制了整個前台頁面的動態內容：

| State | 目前的值 | 改變時畫面會... |
|-------|---------|----------------|
| `activeTag` | `'全部'` / `'豬'` / `'雞'`... | 菜單列表跟著過濾 |
| `cart` | `[ {item, quantity}, ... ]` | 購物車內品項數量變化 |
| `cartOpen` | `true` / `false` | 側邊購物車面板滑入/滑出 |
| `customerNote` | `'不要辣'` | 備註文字顯示出來 |
| `orderDone` | `true` / `false` | 成功彈窗出現/消失 |
| `justOrdered` | `null` / `{orderId, items, total}` | 彈窗內顯示訂單編號和金額 |

---

### 1.7 核心觀念：state 是唯讀的，不能直接改

```jsx
// ❌ 錯誤：直接修改 state
cart[0].quantity = 99

// ❌ 錯誤：等同一行沒有作用
setCart(cart)

// ✅ 正確：建立一個新的（覆蓋舊的）
setCart(cart.map(i =>
  i.item_id === itemId ? { ...i, quantity: 99 } : i
))
```

記住這句話：**state = 快照。要更新就要替換成新的，React 才會發現不一樣。**

---

## 2. useEffect — 什麼時候該用？（用大白話解釋）

### 2.1 先搞懂「副作用」是什麼

**副作用這個詞可以先不管它。** 你只需要知道：

> **「這行程式碼執行後，需要做一件跟 UI 本身無關的事。」**

這件事可能是：
- 開機時抓資料（頁面載入後跟 API 要資料）
- 設定計時器（倒數計時、延遲關閉）
- 監聽事件（使用者滾動頁面、按下鍵盤）
- 改變網頁標題（`document.title = '...'`，不是元件的事）

這些都是「需要另外處理的東西」，不是 UI 的職責。

---

### 2.2 生活比喻

```
React 元件 = 餐廳服務生（只負責上菜、把菜單顯示給客人）

額外事情交給 useEffect：
= 大夜班保全（監控有沒有人鬧事）
= 會計系統（記錄今天營業額）
= 清潔人員（客人走了打掃桌面）
```

服務生不該自己去監控保全系統，所以把這些事交給 `useEffect` 處理。

---

### 2.3 什麼時候需要 useEffect？

**常見的三種情况：**

```
情况一：組件「出現」的時候要做一件事
  → 頁面打開時抓 API 顯示菜單

情况二：某个「資料」改變時要做事
  → 使用者切換篩選條件，重新計算顯示內容

情况三：組件「消失」的時候要做事
  → 計時器要記得清除，不然記憶體會一直跑
```

---

### 2.4 語法拆解

```jsx
useEffect(() => {
  // 這裡放「要做的事」
}, [ /* 依賴：什麼時候做這件事 */ ])
```

```
沒有依赖数组  → 每次 render 都执行
[]             → 只有组件第一次出现时执行
[count]         → count 改变时执行
```

---

### 2.5 情況一：組件「出現」時（等於計數器加一時）

```jsx
// 這個 useEffect 只有在整個元件第一次「出現」時執行一次
useEffect(() => {
  // 就像動漫或綜藝一開始的開場口白：「掌聲歡迎！」
  // 這裡可以做：抓 API、要資料、設定初始值
  console.log('頁面打開了')
}, [])  // 空陣列 = 只做一次
```

**jinhaoke 未來串 API 時會這樣用：**

```jsx
useEffect(() => {
  fetch('/api/menu')
    .then(r => r.json())
    .then(data => setMenu(data.data))
}, [])  // 頁面打開時只抓一次
```

---

### 2.6 情況二：資料改變時

```jsx
// activeTag 改變的時候就執行
useEffect(() => {
  console.log('篩選條件變了，目前是：', activeTag)
}, [activeTag])  // activeTag 改變時執行
```

---

### 2.7 情況三：組件「消失」時（cleanup）

**為什麼需要 cleanup？**

計時器就像餐廳的定時鬧鐘。如果客人走了（組件消失）但鬧鐘還在響，就浪費資源。

```jsx
useEffect(() => {
  const timer = setTimeout(() => {
    console.log('3 秒到了')
  }, 3000)

  // 這個 return 的函式，就是「組件消失時」要執行的
  return () => {
    clearTimeout(timer)  // 把計時器清掉
  }
}, [])
```

**jinhaoke 裡計時器的實際例子（3秒後自動清除購物車）：**

```jsx
setTimeout(() => {
  setCart([])
  setCustomerNote('')
  setOrderDone(false)
  setCartOpen(false)
}, 3000)
// 這不是 useEffect，但是同樣的道理：計時器存在就要想辦法清除
```

---

### 2.8 jinhaoke 前台目前幾乎不用 useEffect

```jsx
// 現況：MOCK_MENU 是靜態資料，根本不需要抓 API
const MOCK_MENU = [ ... ]  // 直接在檔案最上層定義，不經過 API

// 所以目前的程式碼根本沒有 useEffect
// 未來串 API 時才會需要加入 useEffect(() => { fetch('/api/menu') ... }, [])
```

---

### 2.9 簡化思維：99%的情況只需要這兩種

```jsx
// 只需要區分「做一次」和「每次都做」

// 1. 做一次（頁面打開、組件出現）
useEffect(() => {
  fetchData()
}, [])

// 2. 某個變數改變時做
useEffect(() => {
  doSomething(variable)
}, [variable])

// 其他的都是這兩種的變形
```

**不需要把 useEffect 想得太複雜。**

---

## 3. useRef — 存放會變動但不想觸發 render 的值

### 3.1 useState vs useRef

| 特性 | useState | useRef |
|------|----------|--------|
| 改變時會觸發 re-render | ✅ 會 | ❌ 不會 |
| 初始值 | 放在 `useState(initial)` | 放在 `useRef(initial)` |
| 用途 | 需要更新 UI 的資料 | 存放「改變了但不需要重新 render」的資料 |
| 更新方式 | `setState()` | `ref.current = xxx` |

### 3.2 常見用途一：存放計時器 ID

```jsx
import { useRef } from 'react'

function AutoCloseModal() {
  const timerRef = useRef(null)  // 存放計時器 ID一開始是 null

  const show = () => {
    // 儲存計時器 ID（不用 setState，因為計時器 ID 不需要顯示在 UI）
    timerRef.current = setTimeout(() => {
      console.log('3 秒到了')
    }, 3000)
  }

  const cancel = () => {
    // 用 ref.current 拿到計時器 ID 並清除
    clearTimeout(timerRef.current)
  }

  return (
    <>
      <button onClick={show}>開啟</button>
      <button onClick={cancel}>取消</button>
    </>
  )
}
```

### 3.3 常見用途二：操作 DOM 元素

```jsx
import { useRef } from 'react'

function FocusInput() {
  const inputRef = useRef(null)

  const handleClick = () => {
    // focus 到 input 這個 DOM 元素
    inputRef.current.focus()
  }

  return (
    <>
      {/* ref={inputRef} 把 DOM 元素掛到 ref.current */}
      <input ref={inputRef} type="text" />
      <button onClick={handleClick}>聚焦</button>
    </>
  )
}
```

### 3.4 常見用途三：jinhaoke 裡的實例

目前前台還沒有 `useRef` 的應用，但未來可能用到的場景：

```jsx
// 場景：點擊空白處關閉購物車
const cartPanelRef = useRef(null)

useEffect(() => {
  const handleClickOutside = (e) => {
    // 如果點擊的範圍不在 cartPanel 裡，就關閉
    if (cartPanelRef.current && !cartPanelRef.current.contains(e.target)) {
      setCartOpen(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])
```

---

## 4. useCallback — 快取函式，避免不必要的重建

### 4.1 問題：每次 render 函式都會重新建立

```jsx
function Parent() {
  const [count, setCount] = useState(0)

  // ❌ 問題：每次 Parent render，這個函式都會是新物件
  const handleClick = () => {
    console.log('clicked')
  }

  // Child 因為接收的 handleClick 一直是新的，所以會跟著 re-render
  return <Child onClick={handleClick} />
}
```

### 4.2 解決：用 useCallback

```jsx
import { useCallback } from 'react'

function Parent() {
  const [count, setCount] = useState(0)

  // ✅ 只有當 count 改變時，handleClick 才會是新的
  const handleClick = useCallback(() => {
    console.log('clicked', count)
  }, [count])

  return <Child onClick={handleClick} />
}
```

### 4.3 什麼時候需要 useCallback？

- 傳遞函式給子元件，且子元件有 `React.memo` 包裝
- 傳遞函式作為 `useEffect` 的依賴

**過早優化反而浪費效能。** 大多數情況不需要用它。

---

## 5. useMemo — 快取計算結果

### 5.1 問題：複雜計算每次 render 都會重算

```jsx
function ExpensiveList({ items, filter }) {
  // ❌ 問題：每次 render，filterItems 都會重算
  const filterItems = items.filter(item => item.tag === filter)

  return <List data={filterItems} />
}
```

### 5.2 解決：用 useMemo

```jsx
import { useMemo } from 'react'

function ExpensiveList({ items, filter }) {
  // ✅ 只有當 items 或 filter 改變時，才會重算
  const filterItems = useMemo(() => {
    console.log('計算中...')  // 測試用
    return items.filter(item => item.tag === filter)
  }, [items, filter])

  return <List data={filterItems} />
}
```

### 5.3 jinhaoke 裡的實例

```jsx
// 前台的品項分組
const groupedMenu = useMemo(() => {
  return {
    '手作便當': filteredMenu.filter(i => i.category === '手作便當'),
    '燴飯': filteredMenu.filter(i => i.category === '燴飯'),
    '單點': filteredMenu.filter(i => i.category === '單點'),
  }
}, [filteredMenu])

// 總金額
const total = useMemo(() => {
  return cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
}, [cart])
```

---

## 6. 自訂 Hooks — 把重複邏輯抽出來

### 6.1 什麼是自訂 Hook？

當好幾個元件有相同的邏輯時，可以把它抽成一個「自訂 Hook」：

```jsx
// useCart.js
import { useState } from 'react'

export function useCart() {
  const [cart, setCart] = useState([])

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.item_id === item.item_id)
      if (existing) {
        return prev.map(i =>
          i.item_id === item.item_id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }
      return [...prev, { ...item, quantity: 1 }]
    })
  }

  const removeFromCart = (itemId) => {
    setCart(prev => prev.filter(i => i.item_id !== itemId))
  }

  const updateQuantity = (itemId, delta) => {
    setCart(prev => prev.map(i => {
      if (i.item_id === itemId) {
        const newQty = Math.max(0, i.quantity + delta)
        return newQty === 0 ? null : { ...i, quantity: newQty }
      }
      return i
    }).filter(Boolean))
  }

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return { cart, addToCart, removeFromCart, updateQuantity, total }
}
```

### 6.2 使用自訂 Hook

```jsx
// app/page.jsx
import { useCart } from '@/hooks/useCart'

function CustomerOrderPage() {
  // 一行取得所有購物車相關的 state 和函式
  const { cart, addToCart, removeFromCart, updateQuantity, total } = useCart()

  return (
    // ... JSX
  )
}
```

### 6.3 自訂 Hook 命名規則

- 檔案名：`useCart.js`
- 匯出名稱：`useCart`
- **開頭一定要是 `use`**，否則 React 無法識別這是 Hook

---

## 7. 常用 Hooks 總整理

| Hook | 用途 | 常見場景 |
|------|------|---------|
| `useState` | 儲存要顯示在畫面上的狀態 | 購物車、篩選條件、彈窗開關 |
| `useEffect` | 處理副作用（fetch、計時器、事件監聽）| 初始載入、滾動監聽 |
| `useRef` | 存放不想觸發 re-render 的值 | DOM 元素、操作計時器 ID |
| `useCallback` | 快取函式，避免子元件多餘 re-render | 大量子元件列表 |
| `useMemo` | 快取計算結果 | 複雜篩選、排序後的資料 |
| `useContext` | 跨元件傳遞資料（不用層層 props）| 全域主題、登入狀態 |
| `useReducer` | 管理複雜的多狀態邏輯 | 表單、多步驟流程 |

---

## 8. jinhaoke 前台Hooks 使用地圖

```
app/page.jsx

useState
├── [activeTag, setActiveTag]          → 蛋白質篩選
├── [cart, setCart]                    → 購物車品項
├── [cartOpen, setCartOpen]            → 購物車面板開關
├── [customerNote, setCustomerNote]    → 顧客備註
├── [orderDone, setOrderDone]          → 成功彈窗顯示
└── [justOrdered, setJustOrdered]      → 最後一筆訂單資訊

useEffect
└── 未來串 API 時用（目前 menu 是 MOCK 常數）

（將來重構後）
useCart (自訂Hook) → { cart, addToCart, removeFromCart, updateQuantity, total }
useMenuFetch (自訂Hook) → { menu, loading, error }
```

---

## 9. 練習題

### 練習一：計數器加一

```jsx
// 需求：點擊按鈕，數字 +1
// 提示：useState + setCount
```

### 練習二：跟隨 filter

```jsx
// 需求：選擇篩選條件時，下方列表跟著過濾
// 提示：useState + useMemo
// 已有 items: [{name: '牛肉', tag: '牛'}, {name: '豬肉', tag: '豬'}, ...]
// 已有 selectedTag: 'all'
```

### 練習三：購物車加總

```jsx
// 需求：購物車品項加總顯示
// 提示：reduce + useMemo
// cart = [{price: 130, quantity: 2}, {price: 100, quantity: 1}]
// 期望輸出：360
```

---

## 10. 延伸學習資源

- [React 官方文檔 - Hooks](https://react.dev/reference/react)
- [React 官方教學](https://react.dev/learn)
- 觀念區分：State vs Ref vs Memo（參見上方表格）

---

看完這篇之後，你可以對著 `app/page.jsx` 的 6 個 useState，一一說出：

1. 這個 state 是用來控制什麼的？
2. 改變這個 state 會讓畫面哪裡跟著變？
3. 哪個 useState 的更新是用函式寫法的？為什麼？

能回答這三個問題，就代表觀念理解了。