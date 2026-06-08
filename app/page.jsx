'use client'
import { useState, useEffect, useCallback } from 'react'

// ============================================================
// 金濠客食堂 前台點餐頁
// ============================================================
// 食材分類標籤
const PROTEIN_TAGS = ['全部', '豬', '雞', '牛', '魚', '其他']

// 當 API 無法取得時的 fallback（MOCK_MENU item_id 與 DB 不符，訂單會壞
// 這只是避免 UI 完全炸掉，應該確保 API 正常）
const FALLBACK_MENU = [
  { item_id: 1,  name: '大比目魚排便當', sub: '扁鱈', category: '手作便當', tag: '魚',   price: 130, emoji: '🐟' },
  { item_id: 2,  name: '酥炸豬排便當',   category: '手作便當', tag: '豬',   price: 130, emoji: '🐷' },
  { item_id: 3,  name: '酥嫩雞腿便當',   category: '手作便當', tag: '雞',   price: 130, emoji: '🍗' },
  { item_id: 4,  name: '紅麴豬五花便當', category: '手作便當', tag: '豬',   price: 120, emoji: '🐷' },
  { item_id: 5,  name: '酥炸排骨便當',   sub: '無骨',  category: '手作便當', tag: '豬',   price: 100, emoji: '🐷' },
  { item_id: 6,  name: '滷豬腳便當',     category: '手作便當', tag: '豬',   price: 100, emoji: '🐷' },
  { item_id: 7,  name: '滷雞腿便當',     category: '手作便當', tag: '雞',   price: 100, emoji: '🍗' },
  { item_id: 8,  name: '滷排骨便當',     sub: '帶骨·附滷蛋', category: '手作便當', tag: '豬', price: 100, emoji: '🥚' },
  { item_id: 9,  name: '沙茶牛肉燴飯',   category: '燴飯',     tag: '牛',   price: 110, emoji: '🥩', option: '加肉60 / 加菜10' },
  { item_id: 10, name: '沙茶雞柳燴飯',   category: '燴飯',     tag: '雞',   price: 110, emoji: '🍗', option: '加肉60 / 加菜10' },
  { item_id: 11, name: '沙茶豬肉燴飯',   category: '燴飯',     tag: '豬',   price: 100, emoji: '🐷', option: '加肉50 / 加菜10' },
  { item_id: 14, name: '大比目魚排',     sub: '扁鱈',  category: '單點',    tag: '魚',   price: 100, emoji: '🐟' },
  { item_id: 15, name: '酥炸豬排',       category: '單點',    tag: '豬',   price: 100, emoji: '🐷' },
  { item_id: 16, name: '酥嫩雞腿',       category: '單點',    tag: '雞',   price: 100, emoji: '🍗' },
  { item_id: 17, name: '紅麴豬五花',     category: '單點',    tag: '豬',   price: 90,  emoji: '🐷' },
  { item_id: 18, name: '沙茶燴牛肉',     category: '單點',    tag: '牛',   price: 90,  emoji: '🥩', option: '加肉60 / 加菜10' },
  { item_id: 19, name: '滷排骨',         sub: '二片',  category: '單點',    tag: '豬',   price: 80,  emoji: '🐷' },
  { item_id: 20, name: '沙茶燴豬肉',     category: '單點',    tag: '豬',   price: 80,  emoji: '🐷', option: '加肉50 / 加菜10' },
  { item_id: 21, name: '酥炸排骨',         sub: '無骨',  category: '單點',    tag: '豬',   price: 70,  emoji: '🐷' },
  { item_id: 22, name: '滷雞腿',         category: '單點',    tag: '雞',   price: 70,  emoji: '🍗' },
  { item_id: 23, name: '季節炒時蔬',     category: '單點',    tag: '其他', price: 60,  emoji: '🥬' },
  { item_id: 24, name: '白飯',           category: '單點',    tag: '其他', price: 20,  emoji: '🍚' },
  { item_id: 25, name: '滷蛋',           category: '單點',    tag: '其他', price: 15,  emoji: '🥚' },
  { item_id: 26, name: '加購湯品',       category: '單點',    tag: '其他', price: 10,  emoji: '🍜' },
  { item_id: 27, name: '加購菜脯',         sub: '原味/辣味', category: '單點', tag: '其他', price: 5,  emoji: '🥢' },
]

// ============================================================
// 主元件
// ============================================================
export default function CustomerOrderPage() {

  // ---- State ----
  const [menu, setMenu] = useState([])
  const [menuLoading, setMenuLoading] = useState(true)
  const [menuError, setMenuError] = useState(null)
  const [activeTag, setActiveTag] = useState('全部')
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [customerNote, setCustomerNote] = useState('')
  const [orderDone, setOrderDone] = useState(false)
  const [justOrdered, setJustOrdered] = useState(null)
  // item_id → { blocked, max_servings }
  const [availability, setAvailability] = useState({})

  // ---- 抓 API 取得真實 item_id ----
  useEffect(() => {
    Promise.all([
      fetch('/api/menu').then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/menu/availability').then(r => r.json()).catch(() => ({ success: false })),
    ]).then(([menuData, availData]) => {
      if (menuData.success && menuData.data.length > 0) {
        setMenu(menuData.data)
      } else {
        setMenu(FALLBACK_MENU)
      }
      if (availData.success && Array.isArray(availData.data)) {
        const map = {}
        for (const a of availData.data) {
          map[a.item_id] = { blocked: !!a.blocked, max_servings: a.max_servings }
        }
        setAvailability(map)
      }
      setMenuLoading(false)
    })
  }, [])

  const isBlocked = (itemId) => availability[itemId]?.blocked === true

  // ---- 衍生資料 ----
  const filteredMenu = activeTag === '全部'
    ? menu
    : menu.filter(item => item.tag === activeTag)

  // ---- 函式 ----
  const addToCart = (item) => {
    if (isBlocked(item.item_id)) return
    setCart(prev => {
      const existing = prev.find(i => i.item_id === item.item_id)
      if (existing) {
        return prev.map(i =>
          i.item_id === item.item_id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }
      // 存完整品項（item_id 是 DB 真實的，不是 MOCK 的）
      return [...prev, {
        item_id: item.item_id,
        name: item.name,
        price: item.price,
        emoji: item.emoji,
        sub: item.sub || '',
        option: item.option || '',
        category: item.category,
        tag: item.tag,
        quantity: 1,
      }]
    })
    setCartOpen(true)
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
      // POST 使用真實的 DB item_id
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
      <aside className="w-[200px] bg-white border-r border-border flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-border">
          <h1 className="text-ink font-body text-lg font-bold">
            金濠客食堂
          </h1>
          <p className="text-ink-mute text-[11px] mt-0.5 font-body">
            Jinhaoke
          </p>
        </div>
        <nav className="flex-1 px-3 py-3">
          <div className="px-3 py-2 rounded-md text-sm font-medium text-clay bg-clay-soft">
            點餐
          </div>
        </nav>
      </aside>

      {/* ======== Main Wrapper ======== */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ---- Top Bar ---- */}
        <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            {PROTEIN_TAGS.map(p => (
              <button
                key={p}
                onClick={() => setActiveTag(p)}
                className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                  activeTag === p
                    ? 'bg-ink text-white'
                    : 'text-ink-mute hover:text-ink hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </header>

        {/* ---- Content ---- */}
        <main
          className="flex-1 overflow-auto p-6 bg-gray-50 transition-[padding] duration-300 ease-out"
          style={{ paddingRight: cartOpen ? '404px' : undefined }}
        >

          {/* 載入中 */}
          {menuLoading && (
            <div className="flex items-center justify-center h-64">
              <p className="text-ink/30">載入菜單中…</p>
            </div>
          )}

          {/* 類別區塊 */}
          {!menuLoading && ['手作便當', '燴飯', '單點'].map(cat => {
            const catItems = filteredMenu.filter(i => i.category === cat)
            if (catItems.length === 0) return null

            return (
              <section key={cat} className="mb-8">
                <h3 className="text-sm font-semibold text-ink mb-3">
                  {cat}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                  {catItems.map(item => {
                    const blocked = isBlocked(item.item_id)
                    return (
                      <button
                        key={item.item_id}
                        onClick={() => addToCart(item)}
                        disabled={blocked}
                        className={`bg-white border border-border rounded-lg text-left flex flex-col h-full overflow-hidden transition-[box-shadow,transform] duration-150 ${
                          blocked
                            ? 'opacity-50 grayscale cursor-not-allowed'
                            : 'hover:shadow-md hover:-translate-y-0.5'
                        }`}
                      >
                        <div className="relative">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="h-24 w-full object-cover"
                            />
                          ) : (
                            <div className="h-24 bg-gray-50 flex items-center justify-center text-xs text-gray-400 px-2 text-center">
                              老闆還未上傳圖片~
                            </div>
                          )}
                          {blocked && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm font-semibold tracking-wide">
                              售完
                            </span>
                          )}
                        </div>
                        <div className="p-3 flex flex-col flex-1">
                          <p className="text-[13px] font-semibold text-ink leading-tight">
                            {item.name}
                          </p>
                          {item.sub && (
                            <p className="text-[11px] text-ink-mute mt-0.5">{item.sub}</p>
                          )}
                          {item.option && (
                            <p className="text-[10px] text-ink-faint mt-0.5">{item.option}</p>
                          )}
                          <p className="font-mono text-[14px] font-bold text-clay mt-auto pt-1">
                            ${item.price}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {/* 載入失敗但有 fallback 資料 */}
          {!menuLoading && menuError && menu.length > 0 && (
            <p className="text-center text-[12px] text-ink/25 mb-4">
              部分資料來自本地快取，即時更新請稍後重整
            </p>
          )}

          {/* 如果過濾後無結果 */}
          {!menuLoading && filteredMenu.length === 0 && (
            <div className="text-center py-20 text-ink/30">
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
          className="fixed right-6 bottom-6 w-14 h-14 bg-clay hover:bg-clay-deep text-white rounded-full flex items-center justify-center text-2xl shadow-lg transition-all duration-200 z-50"
        >
          🛒
          {cart.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center">
              {cart.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </button>
      )}

      {/* ======== Cart Panel ======== */}
      <div
        className={`fixed top-0 right-0 h-screen w-[380px] bg-white border-l border-border flex flex-col z-40 transition-transform duration-300 ease-out ${
          cartOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Cart Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="font-semibold text-ink text-sm">目前點餐</h3>
          <button
            onClick={() => setCartOpen(false)}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-ink-mute flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-16 text-ink/25">
              <p className="text-4xl mb-2">🍱</p>
              <p className="text-sm">尚未選取餐點</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.item_id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                <span className="text-xl shrink-0">{item.emoji || '🍱'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {item.name}
                  </p>
                  <p className="font-mono text-[13px] text-clay font-semibold">
                    ${item.price}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => updateQuantity(item.item_id, -1)}
                    className="w-6 h-6 rounded-full bg-white border border-border text-ink-mute hover:text-ink flex items-center justify-center text-xs">−</button>
                  <span className="w-5 text-center font-mono text-sm font-medium text-ink">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.item_id, 1)}
                    className="w-6 h-6 rounded-full bg-ink text-white hover:bg-ink-soft flex items-center justify-center text-xs transition-colors">+</button>
                </div>
                <button
                  onClick={() => removeFromCart(item.item_id)}
                  className="text-ink-faint hover:text-red-500 text-sm ml-1 transition-colors">✕</button>
              </div>
            ))
          )}
        </div>

        {/* Cart Footer */}
        <div className="border-t border-border bg-gray-50 px-6 py-4 shrink-0">
          <textarea
            placeholder="備註：外帶、不要辣…"
            value={customerNote}
            onChange={e => setCustomerNote(e.target.value)}
            rows={2}
            className="w-full bg-white border border-border rounded-md px-3 py-2 text-[13px] text-ink placeholder-ink-faint resize-none focus:outline-none focus:ring-1 focus:ring-clay mb-4"
          />
          <div className="flex items-center justify-between mb-4">
            <span className="text-[13px] text-ink-mute">
              共 {cart.reduce((s, i) => s + i.quantity, 0)} 項
            </span>
            <p className="font-mono text-lg font-bold text-ink">
              ${total}
            </p>
          </div>
          <button
            onClick={handleSubmit}
            disabled={cart.length === 0}
            className="w-full bg-clay hover:bg-clay-deep disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 rounded-lg transition-colors duration-150"
          >
            送出訂單
          </button>
        </div>
      </div>

      {/* ======== 成功彈窗 ======== */}
      {orderDone && justOrdered && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 text-center max-w-sm mx-4 shadow-2xl">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-green-600">✓</span>
            </div>
            <h2 className="text-xl font-bold text-ink mb-1">訂單成立</h2>
            <p className="font-mono text-[11px] text-ink-faint mb-4">
              #{justOrdered.orderId}
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-[13px] text-ink-mute">{justOrdered.items} 項商品</p>
              <p className="font-mono text-xl font-bold text-ink mt-1">
                ${justOrdered.total}
              </p>
            </div>
            <p className="text-[12px] text-ink-faint">請稍候，正在準備餐點</p>
          </div>
        </div>
      )}
    </div>
  )
}