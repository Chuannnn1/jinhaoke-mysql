// ============================================================
// 教學範例：React 三劍客 — State、map、onClick
// 位置：app/demo/learn-react/page.jsx
// 學習目標：搞懂這三個，就能看懂 80% 的 React 程式碼
// ============================================================

'use client'
import { useState } from 'react'

// ============================================================
// 模擬資料（未來會從 API fetch 而來）
// ============================================================
const DEMO_FOODS = [
  { id: 1, name: '大比目魚排便當', price: 130, tag: '魚', emoji: '🐟' },
  { id: 2, name: '酥炸豬排便當',   price: 130, tag: '豬', emoji: '🐷' },
  { id: 3, name: '酥嫩雞腿便當',   price: 130, tag: '雞', emoji: '🍗' },
  { id: 4, name: '紅麴豬五花便當', price: 120, tag: '豬', emoji: '🐷' },
  { id: 5, name: '沙茶牛肉燴飯',   price: 110, tag: '牛', emoji: '🥩' },
  { id: 6, name: '沙茶雞柳燴飯',   price: 110, tag: '雞', emoji: '🍗' },
  { id: 7, name: '滷蛋',           price:  15, tag: '其他', emoji: '🥚' },
  { id: 8, name: '白飯',           price:  20, tag: '其他', emoji: '🍚' },
]

const TAGS = ['全部', '豬', '雞', '牛', '魚', '其他']

// ============================================================
// 實驗 1：最簡單的 Counter（示範 useState）
// ============================================================
function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div className="bg-gray-100 p-4 rounded-lg mb-4">
      <h3 className="font-bold mb-2">實驗 1：計數器（useState 最基礎用法）</h3>
      <p className="text-2xl font-mono mb-2">計數：{count}</p>
      <div className="flex gap-2">
        <button
          onClick={() => setCount(count - 1)}
          className="px-3 py-1 bg-red-400 text-white rounded"
        >-</button>
        <button
          onClick={() => setCount(0)}
          className="px-3 py-1 bg-gray-400 text-white rounded"
        >重置</button>
        <button
          onClick={() => setCount(count + 1)}
          className="px-3 py-1 bg-green-400 text-white rounded"
        >+</button>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        💡 原理：點按鈕 → setCount() → React 偵測到 count 變了 → 只更新數字部分
      </p>
    </div>
  )
}

// ============================================================
// 實驗 2：購物車（示範新增/刪除/數量調整）
// ============================================================
function CartDemo() {
  const [cart, setCart] = useState([])  // cart 是陣列，初始是空的

  // 加入購物車
  const addToCart = (food) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === food.id)
      if (existing) {
        // 已存在：數量 +1
        return prev.map(i =>
          i.id === food.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      // 不存在：新增一筆，預設數量 1
      return [...prev, { ...food, quantity: 1 }]
    })
  }

  // 刪除品項
  const removeFromCart = (id) => {
    setCart(prev => prev.filter(i => i.id !== id))
  }

  // 調整數量
  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = Math.max(0, i.quantity + delta)
        return newQty === 0 ? null : { ...i, quantity: newQty }
      }
      return i
    }).filter(Boolean))
  }

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <div className="bg-gray-100 p-4 rounded-lg mb-4">
      <h3 className="font-bold mb-2">實驗 2：購物車（陣列 state 操作）</h3>

      {/* 選單區 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {DEMO_FOODS.map(food => (
          <button
            key={food.id}
            onClick={() => addToCart(food)}
            className="px-2 py-1 bg-white border rounded text-sm hover:bg-yellow-50"
          >
            {food.emoji} {food.name} ${food.price}
          </button>
        ))}
      </div>

      {/* 購物車內容 */}
      {cart.length === 0 ? (
        <p className="text-gray-400 text-sm">尚未選擇餐點</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {cart.map(item => (
            <li key={item.id} className="flex items-center gap-2 bg-white p-2 rounded">
              <span>{item.emoji}</span>
              <span className="flex-1 text-sm">{item.name}</span>
              <span className="text-xs text-gray-500">${item.price}</span>
              <button
                onClick={() => updateQuantity(item.id, -1)}
                className="w-5 h-5 bg-gray-200 rounded text-xs"
              >−</button>
              <span className="font-mono text-sm w-4 text-center">{item.quantity}</span>
              <button
                onClick={() => updateQuantity(item.id, 1)}
                className="w-5 h-5 bg-yellow-400 rounded text-xs text-white"
              >+</button>
              <button
                onClick={() => removeFromCart(item.id)}
                className="text-red-400 text-xs ml-1"
              >✕</button>
            </li>
          ))}
        </ul>
      )}

      {cart.length > 0 && (
        <div className="border-t pt-2 flex justify-between font-bold">
          <span>共 {totalItems} 項</span>
          <span>NT$ {total}</span>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-2">
        💡 原理：cart 是 useState 的陣列 → setCart(新陣列) → React 重新渲染畫面
      </p>
    </div>
  )
}

// ============================================================
// 實驗 3：分類篩選（示範 derived state + 條件渲染）
// ============================================================
function FilterDemo() {
  const [activeTag, setActiveTag] = useState('全部')
  const [search, setSearch] = useState('')

  // 符合分類 AND 符合搜尋的品項
  const filtered = DEMO_FOODS.filter(food => {
    const matchTag = activeTag === '全部' || food.tag === activeTag
    const matchSearch = search === '' || food.name.includes(search)
    return matchTag && matchSearch
  })

  return (
    <div className="bg-gray-100 p-4 rounded-lg mb-4">
      <h3 className="font-bold mb-2">實驗 3：分類篩選 + 搜尋（衍生資料）</h3>

      {/* 搜尋框 */}
      <input
        type="text"
        placeholder="搜尋餐點..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-3 py-1 border rounded mb-3 text-sm"
      />

      {/* 標籤按鈕 */}
      <div className="flex flex-wrap gap-1 mb-3">
        {TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => setActiveTag(tag)}
            className={`px-3 py-1 rounded-full text-sm ${
              activeTag === tag
                ? 'bg-blue-500 text-white'
                : 'bg-white border text-gray-600'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* 結果 */}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map(food => (
          <div key={food.id} className="bg-white p-2 rounded text-sm">
            {food.emoji} {food.name} <span className="text-gray-400">${food.price}</span>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-4">沒有符合的餐點</p>
      )}

      <p className="text-xs text-gray-500 mt-2">
        💡 原理：filtered 是從 state 計算出來的「衍生資料」，不用 useState，直接用
      </p>
    </div>
  )
}

// ============================================================
// 實驗 4：燈箱 Modal（示範三元運算子 + 條件渲染）
// ============================================================
function ModalDemo() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="bg-gray-100 p-4 rounded-lg mb-4">
      <h3 className="font-bold mb-2">實驗 4：燈箱 Modal（條件渲染）</h3>

      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        點我看燈箱
      </button>

      {/* 👇 條件渲染：showModal 為 true 時才 render 燈箱 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center mt-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h2 className="font-bold text-lg mb-2">✅ 成功！</h2>
            <p className="text-gray-600 mb-4">這就是 React 的條件渲染語法：</p>
            <pre className="bg-gray-100 p-2 rounded text-xs mb-4">
{`{showModal && (
  <ModalComponent />
)}`}
            </pre>
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 bg-gray-500 text-white rounded"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-2">
        💡 原理：&#123;showModal && <Component />&#125; 等同「如果 true 就 render，否則不render」
      </p>
    </div>
  )
}

// ============================================================
// 主頁面：把四個實驗組裝起來
// ============================================================
export default function LearnReactPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">React 基礎教學</h1>
        <p className="text-gray-500 text-sm mb-6">使用你 jinhaoke 專案的餐點資料</p>

        <Counter />
        <CartDemo />
        <FilterDemo />
        <ModalDemo />

        <div className="mt-6 text-center text-gray-400 text-sm">
          <p>搞懂這四個實驗 → 就能看懂 `page.jsx` 80% 的程式碼</p>
        </div>
      </div>
    </div>
  )
}