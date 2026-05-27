'use client'
import { useState } from 'react'

// ============================================================
// 金濠客食堂 真實菜單
// ============================================================
const MOCK_MENU = [
  // --- 手作便當（含三樣配菜）---
  { item_id: 101, name: '大比目魚排便當', sub: '扁鱈', category: '手作便當', tag: '魚', price: 130, emoji: '🐟' },
  { item_id: 102, name: '酥炸豬排便當', category: '手作便當', tag: '豬', price: 130, emoji: '🐷' },
  { item_id: 103, name: '酥嫩雞腿便當', category: '手作便當', tag: '雞', price: 130, emoji: '🍗' },
  { item_id: 104, name: '紅麴豬五花便當', category: '手作便當', tag: '豬', price: 120, emoji: '🐷' },
  { item_id: 105, name: '酥炸排骨便當', sub: '無骨', category: '手作便當', tag: '豬', price: 100, emoji: '🐷' },
  { item_id: 106, name: '滷豬腳便當', category: '手作便當', tag: '豬', price: 100, emoji: '🐷' },
  { item_id: 107, name: '滷雞腿便當', category: '手作便當', tag: '雞', price: 100, emoji: '🍗' },
  { item_id: 108, name: '滷排骨便當', sub: '帶骨·附滷蛋', category: '手作便當', tag: '豬', price: 100, emoji: '🥚' },

  // --- 燴飯 ---
  { item_id: 201, name: '沙茶牛肉燴飯', category: '燴飯', tag: '牛', price: 110, emoji: '🥩', option: '加肉60 / 加菜10' },
  { item_id: 202, name: '沙茶雞柳燴飯', category: '燴飯', tag: '雞', price: 110, emoji: '🍗', option: '加肉60 / 加菜10' },
  { item_id: 203, name: '沙茶豬肉燴飯', category: '燴飯', tag: '豬', price: 100, emoji: '🐷', option: '加肉50 / 加菜10' },

  // --- 單點 ---
  { item_id: 301, name: '大比目魚排', sub: '扁鱈', category: '單點', tag: '魚', price: 100, emoji: '🐟' },
  { item_id: 302, name: '酥炸豬排', category: '單點', tag: '豬', price: 100, emoji: '🐷' },
  { item_id: 303, name: '酥嫩雞腿', category: '單點', tag: '雞', price: 100, emoji: '🍗' },
  { item_id: 304, name: '紅麴豬五花', category: '單點', tag: '豬', price: 90, emoji: '🐷' },
  { item_id: 305, name: '沙茶燴牛肉', category: '單點', tag: '牛', price: 90, emoji: '🥩', option: '加肉60 / 加菜10' },
  { item_id: 306, name: '滷排骨', sub: '二片', category: '單點', tag: '豬', price: 80, emoji: '🐷' },
  { item_id: 307, name: '沙茶燴豬肉', category: '單點', tag: '豬', price: 80, emoji: '🐷', option: '加肉50 / 加菜10' },
  { item_id: 308, name: '酥炸排骨', sub: '無骨', category: '單點', tag: '豬', price: 70, emoji: '🐷' },
  { item_id: 309, name: '滷雞腿', category: '單點', tag: '雞', price: 70, emoji: '🍗' },
  { item_id: 310, name: '季節炒時蔬', category: '單點', tag: '其他', price: 60, emoji: '🥬' },
  { item_id: 311, name: '白飯', category: '單點', tag: '其他', price: 20, emoji: '🍚' },
  { item_id: 312, name: '滷蛋', category: '單點', tag: '其他', price: 15, emoji: '🥚' },
  { item_id: 313, name: '加購湯品', category: '單點', tag: '其他', price: 10, emoji: '🍜' },
  { item_id: 314, name: '加購菜脯', sub: '原味/辣味', category: '單點', tag: '其他', price: 5, emoji: '🥢' },
]

// 食材分類標籤
const PROTEIN_TAGS = ['全部', '豬', '雞', '牛', '魚', '其他']

// ============================================================
// 主元件
// ============================================================
export default function CustomerOrderPage() {

  // ---- State ----
  const [activeTag, setActiveTag] = useState('全部')
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [customerNote, setCustomerNote] = useState('')
  const [orderDone, setOrderDone] = useState(false)
  const [justOrdered, setJustOrdered] = useState(null)

  // ---- 衍生資料 ----
  const filteredMenu = activeTag === '全部'
    ? MOCK_MENU
    : MOCK_MENU.filter(item => item.tag === activeTag)

  // ---- 函式 ----
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
    setCartOpen(true)  // 加東西時自動開 cart
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

  // ============================================================
  // JSX
  // ============================================================
  return (
    <div className="flex h-screen overflow-hidden">

      {/* ======== Sidebar ======== */}
      <aside className="w-[220px] bg-charcoal-900 flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-white/5">
          <h1 className="text-gold-400 font-display text-xl font-semibold tracking-wide">
            金濠客食堂
          </h1>
          <p className="text-charcoal-700 text-[11px] mt-1 tracking-wider uppercase font-body">
            Jinhaoke
          </p>
        </div>

        {/* Nav — 前台只有點餐 */}
        <nav className="flex-1 px-3 py-4">
          <div
            className="w-full text-left px-4 py-2.5 rounded-md text-sm text-gold-400 border-l-[3px] border-l-gold-400 bg-gold-400/10"
          >
            點餐
          </div>
        </nav>
      </aside>

      {/* ======== Main Wrapper ======== */}
      <div
        className="flex-1 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ marginRight: cartOpen ? '380px' : '0px' }}
      >

        {/* ---- Top Bar ---- */}
        <header className="h-16 bg-cream border-b border-gold-200 flex items-center justify-between px-8 shrink-0">
          <h2 className="text-charcoal-900 font-body font-semibold text-sm tracking-wide">
            點餐
          </h2>

          {/* 食材標籤 */}
          <div className="flex items-center gap-2">
            {PROTEIN_TAGS.map(p => (
              <button
                key={p}
                onClick={() => setActiveTag(p)}
                className={`px-4 py-1.5 rounded-full text-[13px] font-body font-medium transition-all duration-200 ${
                  activeTag === p
                    ? 'bg-gold-400 text-white'
                    : 'bg-transparent text-charcoal-900/60 border border-gold-200 hover:border-gold-400'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <span className="text-sm text-charcoal-900/50 font-mono">桌號 · A3</span>
        </header>

        {/* ---- Content ---- */}
        <main className="flex-1 overflow-auto p-8 bg-gold-50">

          {/* 類別區塊 */}
          {['手作便當', '燴飯', '單點'].map(cat => {
            const catItems = filteredMenu.filter(i => i.category === cat)
            if (catItems.length === 0) return null

            return (
              <section key={cat} className="mb-10">
                <h3 className="text-[13px] font-body font-semibold text-gold-500 uppercase tracking-widest mb-4">
                  {cat}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
                  {catItems.map(item => (
                    <button
                      key={item.item_id}
                      onClick={() => addToCart(item)}
                      className="card card-hover text-left flex flex-col h-full overflow-hidden"
                    >
                      {/* 圖片區 */}
                      <div className="h-28 bg-gold-100 flex items-center justify-center text-4xl select-none">
                        {item.emoji}
                      </div>

                      {/* 資訊區 */}
                        <div className="p-3 flex flex-col flex-1">
                          <p className="text-sm font-body font-semibold text-charcoal-900 leading-tight">
                            {item.name}
                          </p>
                          {item.sub && (
                            <p className="text-[11px] text-charcoal-900/40 mt-0.5">{item.sub}</p>
                          )}
                          {item.option && (
                            <p className="text-[10px] text-charcoal-900/30 mt-0.5">{item.option}</p>
                          )}
                          <p className="font-mono text-[15px] font-bold text-gold-500 mt-auto">
                            NT${item.price}
                          </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}

          {/* 如果過濾後無結果 */}
          {filteredMenu.length === 0 && (
            <div className="text-center py-20 text-charcoal-900/30">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="text-sm">此分類尚無餐點</p>
            </div>
          )}
        </main>
      </div>

      {/* ======== Cart FAB（右下浮動按鈕） ======== */}
      {!cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed right-6 bottom-6 w-14 h-14 bg-gold-400 hover:bg-gold-600 text-white rounded-full flex items-center justify-center text-2xl shadow-elevated transition-all duration-200 z-50"
        >
          🛒
          {cart.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger text-white text-[11px] font-bold rounded-full flex items-center justify-center">
              {cart.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </button>
      )}

      {/* ======== Cart Panel（永遠在 DOM，用 translateX 控制進出） ======== */}
      <div
        className="fixed top-0 right-0 h-screen w-[380px] bg-cream shadow-elevated z-40 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ transform: cartOpen ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Cart Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gold-200 shrink-0">
          <h3 className="font-body font-semibold text-charcoal-900 text-sm">目前點餐</h3>
          <button
            onClick={() => setCartOpen(false)}
            className="w-8 h-8 rounded-full bg-gold-100 hover:bg-gold-200 text-charcoal-900 flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-16 text-charcoal-900/25">
              <p className="text-4xl mb-2">🍱</p>
              <p className="text-sm">尚未選取餐點</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.item_id} className="flex items-center gap-3 bg-gold-50 rounded-lg p-3">
                <span className="text-2xl shrink-0">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-body font-medium text-charcoal-900 truncate">
                    {item.name}
                  </p>
                  <p className="font-mono text-[13px] text-gold-500 font-bold">
                    NT${item.price}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => updateQuantity(item.item_id, -1)}
                    className="w-6 h-6 rounded-full bg-white border border-gold-200 text-charcoal-900/50 hover:text-charcoal-900 flex items-center justify-center text-xs"
                  >−</button>
                  <span className="w-5 text-center font-mono text-sm font-medium text-charcoal-900">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.item_id, 1)}
                    className="w-6 h-6 rounded-full bg-gold-400 text-white hover:bg-gold-600 flex items-center justify-center text-xs transition-colors"
                  >+</button>
                </div>
                <button
                  onClick={() => removeFromCart(item.item_id)}
                  className="text-charcoal-900/25 hover:text-danger text-sm ml-1 transition-colors"
                >✕</button>
              </div>
            ))
          )}
        </div>

        {/* Cart Footer */}
        <div className="border-t border-gold-200 bg-gold-50 px-6 py-4 shrink-0">
          {/* 備註 */}
          <textarea
            placeholder="備註：外帶、不要辣…"
            value={customerNote}
            onChange={e => setCustomerNote(e.target.value)}
            rows={2}
            className="w-full bg-white border border-gold-200 rounded-md px-3 py-2 text-[13px] font-body text-charcoal-900 placeholder-charcoal-900/25 resize-none focus:outline-none focus:border-gold-400 mb-4"
          />

          {/* 總計 */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[13px] text-charcoal-900/60 font-body">
              共 {cart.reduce((s, i) => s + i.quantity, 0)} 項
            </span>
            <p className="font-mono text-lg font-bold text-gold-500">
              NT$ {total}
            </p>
          </div>

          {/* 送出 */}
          <button
            onClick={handleSubmit}
            disabled={cart.length === 0}
            className="w-full bg-gold-400 hover:bg-gold-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-body font-semibold text-sm py-3 rounded-md transition-colors duration-200"
          >
            送出訂單
          </button>
        </div>
      </div>

      {/* ======== 成功彈窗 ======== */}
      {orderDone && justOrdered && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-cream rounded-lg p-8 text-center max-w-sm mx-4 shadow-elevated">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl text-success">✓</span>
            </div>
            <h2 className="font-display text-xl text-charcoal-900 mb-2">訂單成立</h2>
            <p className="font-mono text-[11px] text-charcoal-900/40 mb-4">
              #{justOrdered.orderId}
            </p>
            <div className="bg-gold-50 rounded-md p-4 mb-4">
              <p className="text-[13px] text-charcoal-900/60">{justOrdered.items} 項商品</p>
              <p className="font-mono text-xl font-bold text-gold-500 mt-1">
                NT$ {justOrdered.total}
              </p>
            </div>
            <p className="text-[12px] text-charcoal-900/30">請稍候，正在準備餐點</p>
          </div>
        </div>
      )}
    </div>
  )
}