'use client'
import { useState, useEffect, useCallback } from 'react'

// ============================================================
// 金濠客食堂 前台點餐頁
// ============================================================
// 食材分類標籤
const PROTEIN_TAGS = ['全部', '豬', '雞', '牛', '魚', '其他']

// 餐點分類 section 顯示順序（DB migrate 後一律是「手作便當」）
const CATEGORY_SECTIONS = ['手作便當', '燴飯', '單點', '飲料']
// 舊資料 backward compat：「便當」歸到「手作便當」section
const LEGACY_CATEGORY_MAP = {
  '便當': '手作便當',
}
const normalizeCategory = (c) => LEGACY_CATEGORY_MAP[c] ?? c

// 前台不顯示：純 addon 用途，只在便當 / 燴飯客製化 modal 出現
//   27 加菜 / 28 加牛 / 29 加豬 / 30 加雞 / 31 加飯
const FRONT_HIDDEN_ITEM_IDS = new Set([27, 28, 29, 30, 31])

// 單點分類自訂排序：26 沙茶燴雞肉視為 18.5，插在 18 沙茶燴豬肉後面，
// 讓沙茶牛 / 豬 / 雞排在一起。其它品項仍維持 item_id 順序。
const singleItemRank = (id) => (id === 26 ? 18.5 : id)

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
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  // 客製化 modal：null = 沒開；否則是該品項的 item_id
  const [customizingItemId, setCustomizingItemId] = useState(null)
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
  const visibleMenu = menu.filter(item => !FRONT_HIDDEN_ITEM_IDS.has(item.item_id))
  const filteredMenu = activeTag === '全部'
    ? visibleMenu
    : visibleMenu.filter(item => item.tag === activeTag)

  // ---- 函式 ----
  const addToCart = (item) => {
    if (isBlocked(item.item_id)) return
    setCart(prev => {
      const existing = prev.find(i => i.item_id === item.item_id)
      if (existing) {
        // qty +1 → customizations 補一個空 unit
        return prev.map(i =>
          i.item_id === item.item_id
            ? { ...i, quantity: i.quantity + 1, customizations: [...(i.customizations ?? []), []] }
            : i
        )
      }
      // 存完整品項（item_id 是 DB 真實的，不是 MOCK 的）
      return [...prev, {
        item_id: item.item_id,
        name: item.name,
        price: item.price,
        emoji: item.emoji,
        image_url: item.image_url || '',                        // 帶下來給 cart row 縮圖用
        sub: item.sub || '',
        option: item.option || '',
        category: item.category,
        tag: item.tag,
        quantity: 1,
        addons: Array.isArray(item.addons) ? item.addons : [],  // menu 帶下來的可選 addon
        customizations: [[]],                                   // 長度 = quantity；每份預設無 addon
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
        if (newQty === 0) return null
        const cur = i.customizations ?? []
        // qty 變動同步 customizations 長度：增加補空、減少切尾
        let next
        if (newQty > cur.length) {
          next = [...cur, ...Array.from({ length: newQty - cur.length }, () => [])]
        } else {
          next = cur.slice(0, newQty)
        }
        return { ...i, quantity: newQty, customizations: next }
      }
      return i
    }).filter(Boolean))
  }

  // 算每個 cart row 的客製化加總（依 menu_item.addons 對應 price）
  const cartLineAddonAmount = (item) => {
    const addonPriceMap = new Map((item.addons ?? []).map(a => [a.id, a.price]))
    return (item.customizations ?? []).reduce((s, unit) =>
      s + (Array.isArray(unit) ? unit.reduce((u, id) => u + (addonPriceMap.get(id) ?? 0), 0) : 0)
    , 0)
  }

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity + cartLineAddonAmount(i), 0)

  const handleSubmit = async () => {
    if (cart.length === 0) return alert('購物車是空的')

    const payload = {
      customer_phone: customerPhone,
      note: customerNote,
      // POST 使用真實的 DB item_id；客製化以陣列形式帶上去（長度 = quantity）
      items: cart.map(i => ({
        item_id: i.item_id,
        quantity: i.quantity,
        customizations: i.customizations ?? [],
      })),
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
        setCustomerPhone('')
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
        <a href="/" className="px-5 py-5 border-b border-border flex items-center gap-3 hover:bg-gray-50 transition-colors">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/jinhaoke-logo.webp"
            alt="金濠客食堂"
            className="w-12 h-12 rounded-full shrink-0 object-cover"
          />
          <div className="min-w-0">
            <h1 className="text-ink font-body text-sm font-bold leading-tight truncate">
              金濠客食堂
            </h1>
            <p className="text-ink-mute text-[11px] mt-0.5 font-body">
              Jinhaoke
            </p>
          </div>
        </a>
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
          className="flex-1 overflow-auto p-6 bg-gray-50 transition-[margin] duration-300 ease-out"
          style={{ marginRight: cartOpen ? '380px' : 0 }}
          onClick={() => { if (cartOpen) setCartOpen(false) }}
        >

          {/* 載入中 */}
          {menuLoading && (
            <div className="flex items-center justify-center h-64">
              <p className="text-ink/30">載入菜單中…</p>
            </div>
          )}

          {/* 類別區塊 */}
          {!menuLoading && CATEGORY_SECTIONS.map(cat => {
            // 「便當」section 同時收 DB 還沒 migrate 的「手作便當」
            const catItems = filteredMenu.filter(
              i => i.category === cat || normalizeCategory(i.category) === cat
            )
            if (catItems.length === 0) return null
            // 單點分類套用沙茶系列特別排序（26 沙茶燴雞肉移到 18 旁邊）
            const sortedCatItems = cat === '單點'
              ? [...catItems].sort((a, b) => singleItemRank(a.item_id) - singleItemRank(b.item_id))
              : catItems

            return (
              <section key={cat} className="mb-8">
                <h3 className="text-sm font-semibold text-ink mb-3">
                  {cat}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                  {sortedCatItems.map(item => {
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
            cart.map(item => {
              const hasAddons = (item.addons ?? []).length > 0
              const customizedCount = (item.customizations ?? []).filter(u => Array.isArray(u) && u.length > 0).length
              const lineAddon = cartLineAddonAmount(item)
              const lineSubtotal = item.price * item.quantity + lineAddon
              return (
                <div key={item.item_id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-10 h-10 rounded-md object-cover shrink-0 border border-border"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-white border border-border flex items-center justify-center text-base shrink-0">
                        {item.emoji || '🍱'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {item.name}
                      </p>
                      <p className="font-mono text-[13px] text-clay font-semibold">
                        ${lineSubtotal}
                        {lineAddon > 0 && (
                          <span className="text-[11px] text-ink-mute font-normal ml-1">
                            ({item.price}×{item.quantity} + 客製 {lineAddon})
                          </span>
                        )}
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
                  {hasAddons && (
                    <button
                      type="button"
                      onClick={() => setCustomizingItemId(item.item_id)}
                      className="mt-2 w-full text-[12px] text-clay hover:text-clay-deep bg-white border border-clay/20 hover:border-clay/50 rounded-md py-1.5 transition-colors flex items-center justify-center gap-2"
                    >
                      <span>客製化</span>
                      {customizedCount > 0 ? (
                        <span className="text-[11px] text-ink-mute">
                          已客製 {customizedCount}/{item.quantity} 份
                        </span>
                      ) : (
                        <span className="text-[11px] text-ink-faint">（可加肉 / 加菜 / 加飯）</span>
                      )}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Cart Footer */}
        <div className="border-t border-border bg-gray-50 px-6 py-4 shrink-0">
          <div className="flex gap-2 mb-2">
            <input
              type="tel"
              inputMode="tel"
              placeholder="電話末三碼（選填）"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              className="flex-1 bg-white border border-border rounded-md px-3 py-2 text-[13px] text-ink placeholder-ink-faint focus:outline-none focus:ring-1 focus:ring-clay font-mono"
            />
          </div>
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

      {/* ======== 客製化 modal ======== */}
      {customizingItemId !== null && (() => {
        const target = cart.find(i => i.item_id === customizingItemId)
        if (!target) return null
        return (
          <CustomizationModal
            item={target}
            onClose={() => setCustomizingItemId(null)}
            onSave={(newCustomizations) => {
              setCart(prev => prev.map(i =>
                i.item_id === customizingItemId
                  ? { ...i, customizations: newCustomizations }
                  : i
              ))
              setCustomizingItemId(null)
            }}
          />
        )
      })()}
    </div>
  )
}

// ============================================================
// 客製化 modal — qty 份子項 + 套用到全部 + 即時總額預覽
// ============================================================
function CustomizationModal({ item, onClose, onSave }) {
  const [units, setUnits] = useState(() => {
    const existing = item.customizations ?? []
    return Array.from({ length: item.quantity }, (_, i) =>
      Array.isArray(existing[i]) ? [...existing[i]] : []
    )
  })

  const addonMap = new Map((item.addons ?? []).map(a => [a.id, a]))

  const toggleAddon = (unitIdx, addonId) => {
    setUnits(prev => prev.map((u, i) => {
      if (i !== unitIdx) return u
      return u.includes(addonId) ? u.filter(a => a !== addonId) : [...u, addonId]
    }))
  }

  const applyFirstToAll = () => {
    const template = units[0] ?? []
    setUnits(units.map(() => [...template]))
  }

  const clearAll = () => setUnits(units.map(() => []))

  const totalAddon = units.reduce((sum, u) =>
    sum + u.reduce((s, id) => s + (addonMap.get(id)?.price ?? 0), 0)
  , 0)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="px-5 py-4 bg-clay-soft border-b border-clay/20 shrink-0">
          <div className="flex items-center gap-3">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                className="w-10 h-10 rounded-lg object-cover shrink-0 border border-clay/20"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-white border border-clay/20 flex items-center justify-center text-lg shrink-0">
                🍱
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">{item.name}</p>
              <p className="text-[11px] text-ink-mute">
                共 {item.quantity} 份 · 基本 ${item.price * item.quantity}
                {totalAddon > 0 && <span className="text-clay-deep font-medium ml-1">+ 客製 ${totalAddon}</span>}
              </p>
            </div>
          </div>
        </div>

        {/* 套用 / 清空 */}
        {item.quantity > 1 && (
          <div className="px-5 py-2 bg-cream border-b border-border-soft flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={applyFirstToAll}
              className="text-[11px] px-2.5 py-1 rounded-md bg-white border border-border text-ink-mute hover:text-clay hover:border-clay/50"
            >
              套用第 1 份到全部
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] px-2.5 py-1 rounded-md bg-white border border-border text-ink-mute hover:text-red-500 hover:border-red-300"
            >
              全部清空
            </button>
          </div>
        )}

        {/* units */}
        <div className="flex-1 overflow-y-auto">
          {units.map((unit, idx) => (
            <div
              key={idx}
              className={`px-5 py-3 ${idx > 0 ? 'border-t border-gray-200' : ''}`}
            >
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-[11px] text-ink-mute uppercase tracking-wider">份 {idx + 1}</span>
                {unit.length > 0 && (
                  <span className="text-[11px] text-clay font-mono">
                    +${unit.reduce((s, id) => s + (addonMap.get(id)?.price ?? 0), 0)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(item.addons ?? []).map(addon => {
                  const on = unit.includes(addon.id)
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => toggleAddon(idx, addon.id)}
                      className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors ${
                        on
                          ? 'bg-clay text-white border-clay'
                          : 'bg-white text-ink-mute border-border hover:border-clay/50 hover:text-clay'
                      }`}
                    >
                      {addon.label} <span className="font-mono">+${addon.price}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-border flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] px-3 py-2 rounded-md border border-border text-ink-mute hover:text-ink hover:bg-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave(units)}
            className="flex-1 ml-2 text-sm font-semibold px-4 py-2 rounded-md bg-clay text-white hover:bg-clay-deep transition-colors"
          >
            完成（總計 ${item.price * item.quantity + totalAddon}）
          </button>
        </div>
      </div>
    </div>
  )
}