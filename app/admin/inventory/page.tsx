'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'

// ============================================================
// 庫存管理頁面（含「供應商」子分頁）
// /admin/inventory          → 庫存清單
// /admin/inventory?tab=suppliers → 供應商
// ============================================================

interface InventoryItem {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
  order_unit: string
  qty_per_order_unit: number
  supplier_name: string | null
  order_block_threshold: number | null
}

interface Supplier {
  name: string
  phone: string | null
}

type TabKey = 'inventory' | 'suppliers'

const CATEGORIES = ['全部', '肉類', '海鮮', '乾貨', '調味料', '耗材']

function guessCategory(name: string): string {
  const n = name.toLowerCase()
  if (/魚|鱈|蝦|蟹|干貝|海/.test(n)) return '海鮮'
  if (/肉|排|腿|片|豬|雞|牛|五花|炸/.test(n)) return '肉類'
  if (/醬|油|鹽|糖|沙茶|紅麴|滷包/.test(n)) return '調味料'
  if (/米|蛋|蔬|菜脯|便當|筷|盒/.test(n)) return '乾貨'
  return '耗材'
}

function effectiveBlockThreshold(item: InventoryItem): number {
  if (item.order_block_threshold !== null && item.order_block_threshold !== undefined) {
    return item.order_block_threshold
  }
  return item.safety_stock * 0.2
}

// 數量顯示格式：整數時不顯示小數、小數時顯示 1 位
// （白米 stock_qty 會出現 83.5999999 這種浮點殘留值，需 toFixed(1)）
function formatQty(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(1)
}

export default function InventoryPage() {
  const searchParams = useSearchParams()
  const initialTab: TabKey = searchParams?.get('tab') === 'suppliers' ? 'suppliers' : 'inventory'
  const [tab, setTab] = useState<TabKey>(initialTab)

  return (
    <>
      <header className="h-16 bg-white border-b border-border flex items-center justify-between px-8 shrink-0">
        <h2 className="text-ink font-body font-semibold text-sm tracking-wide">
          {tab === 'inventory' ? '庫存管理' : '供應商管理'}
        </h2>
      </header>

      <main className="flex-1 overflow-auto p-6 bg-gray-50">
        {/* 子分頁 */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setTab('inventory')}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
              tab === 'inventory'
                ? 'bg-gray-500 text-white'
                : 'bg-white text-ink/60 border border-border hover:bg-gray-50'
            }`}
          >
            庫存清單
          </button>
          <button
            onClick={() => setTab('suppliers')}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
              tab === 'suppliers'
                ? 'bg-gray-500 text-white'
                : 'bg-white text-ink/60 border border-border hover:bg-gray-50'
            }`}
          >
            供應商
          </button>
        </div>

        {tab === 'inventory' ? <InventoryTab /> : <SuppliersTab />}
      </main>
    </>
  )
}

// ============================================================
// 庫存清單分頁
// ============================================================
function InventoryTab() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('全部')
  const [search, setSearch] = useState('')

  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null)
  const [autoGenLoading, setAutoGenLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory')
      const data = await res.json()
      if (data.success) setInventory(data.data)
      else setError(data.error || '讀取失敗')
    } catch {
      setError('網路錯誤')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers')
      const data = await res.json()
      if (data.success) setSuppliers(data.data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchInventory()
    fetchSuppliers()
  }, [fetchInventory, fetchSuppliers])

  const filtered = useMemo(() => inventory.filter(item => {
    const cat = guessCategory(item.name)
    const matchCategory = activeCategory === '全部' || cat === activeCategory
    const matchSearch = search === '' || item.name.includes(search)
    return matchCategory && matchSearch
  }), [inventory, activeCategory, search])

  const getStatus = (item: InventoryItem) => {
    const stock = item.stock_qty
    const safe = item.safety_stock
    const block = effectiveBlockThreshold(item)
    if (safe <= 0) return { label: '—', color: 'bg-gray-100 text-gray-500' }
    if (stock <= block) return { label: '售完', color: 'bg-gray-300 text-gray-700' }
    if (stock <= safe * 0.5) return { label: '不足', color: 'bg-red-100 text-red-700' }
    if (stock <= safe) return { label: '偏低', color: 'bg-yellow-100 text-yellow-700' }
    return { label: '充足', color: 'bg-green-100 text-green-700' }
  }

  const totalItems = inventory.length
  const lowStockCount = inventory.filter(i => i.safety_stock > 0 && i.stock_qty <= i.safety_stock).length
  const criticalCount = inventory.filter(i => i.safety_stock > 0 && i.stock_qty <= i.safety_stock * 0.5).length

  const handleAutoGenerate = async () => {
    if (!window.confirm('將為所有低於安全庫存的食材，按供應商建立採購單。確定繼續？')) return
    setAutoGenLoading(true)
    setToast(null)
    try {
      const res = await fetch('/api/purchase/auto-generate', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        const created = data.data?.created_count ?? 0
        const covered = data.data?.covered_ingredients ?? []
        if (created === 0) {
          setToast({ type: 'info', text: '目前沒有低於安全庫存的食材，無需建單' })
        } else {
          setToast({
            type: 'success',
            text: `已建立 ${created} 張採購單，覆蓋 ${covered.length} 項食材，前往 /admin/purchase 查看`,
          })
        }
        fetchInventory()
      } else {
        setToast({ type: 'error', text: data.error || '建單失敗' })
      }
    } catch {
      setToast({ type: 'error', text: '網路錯誤' })
    } finally {
      setAutoGenLoading(false)
      setTimeout(() => setToast(null), 6000)
    }
  }

  const handleSupplierChange = async (item: InventoryItem, supplier_name: string | null) => {
    try {
      const res = await fetch(`/api/inventory/${encodeURIComponent(item.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_name }),
      })
      const data = await res.json()
      if (data.success) fetchInventory()
      else window.alert(data.error || '更新失敗')
    } catch {
      window.alert('網路錯誤')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-ink/30">載入中…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <>
      {/* 摘要卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm px-5 py-4">
          <span className="text-xs text-ink/40 uppercase tracking-wide">總品項</span>
          <p className="text-2xl font-bold text-ink mt-1">{totalItems}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm px-5 py-4">
          <span className="text-xs text-yellow-600 uppercase tracking-wide">庫存偏低</span>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{lowStockCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm px-5 py-4">
          <span className="text-xs text-red-600 uppercase tracking-wide">庫存不足</span>
          <p className="text-2xl font-bold text-red-600 mt-1">{criticalCount}</p>
        </div>
      </div>

      {/* 搜尋 + 分類 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="搜尋品名…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm w-64 bg-white focus:outline-none focus:ring-2 focus:ring-clay"
        />
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                activeCategory === cat
                  ? 'bg-gray-500 text-white'
                  : 'bg-white text-ink/60 border border-border hover:bg-gray-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <button
          onClick={handleAutoGenerate}
          disabled={autoGenLoading}
          className="ml-auto px-3 py-1.5 bg-clay text-white text-xs rounded-lg hover:bg-clay-deep transition-colors font-medium disabled:opacity-50"
          title="按供應商建立採購單，補滿至 2 倍安全庫存"
        >
          {autoGenLoading ? '建單中…' : '自動補貨建議'}
        </button>
        <button
          onClick={fetchInventory}
          className="text-[12px] text-ink/40 hover:text-clay transition-colors font-mono"
        >
          重新整理
        </button>
      </div>

      {toast && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : toast.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{toast.text}</span>
            {toast.type === 'success' && (
              <a
                href="/admin/purchase"
                className="text-xs underline hover:no-underline shrink-0"
              >
                前往採購管理 →
              </a>
            )}
          </div>
        </div>
      )}

      {/* 庫存表格 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-ink/50 text-left text-xs uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">品名</th>
              <th className="px-4 py-3 font-medium text-right">目前庫存</th>
              <th className="px-4 py-3 font-medium text-right">安全存量</th>
              <th className="px-4 py-3 font-medium text-right">暫停接單點</th>
              <th className="px-4 py-3 font-medium text-center">狀態</th>
              <th className="px-4 py-3 font-medium">分類</th>
              <th className="px-4 py-3 font-medium">供應商</th>
              <th className="px-4 py-3 font-medium text-right">叫貨單位</th>
              <th className="px-4 py-3 font-medium text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => {
              const status = getStatus(item)
              const cat = guessCategory(item.name)
              const block = effectiveBlockThreshold(item)
              const isOverride = item.order_block_threshold !== null && item.order_block_threshold !== undefined
              return (
                <tr
                  key={item.name}
                  className={`border-t border-gray-200 hover:bg-gray-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'}`}
                >
                  <td className="px-4 py-3 font-medium text-ink">{item.name}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink">
                    {formatQty(item.stock_qty)} <span className="text-ink/40 text-xs">{item.stock_unit}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-ink/40 font-mono">
                    {formatQty(item.safety_stock)} <span className="text-ink/30 text-xs">{item.stock_unit}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={isOverride ? 'text-clay' : 'text-ink/40'}>
                      {formatQty(block)}
                    </span>
                    <span className="text-ink/30 text-xs"> {item.stock_unit}</span>
                    {isOverride && (
                      <span className="block text-[10px] text-clay/70">手動覆寫</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink/50 text-xs">{cat}</td>
                  <td className="px-4 py-3 text-xs">
                    <select
                      value={item.supplier_name ?? ''}
                      onChange={e => handleSupplierChange(item, e.target.value === '' ? null : e.target.value)}
                      className="px-2 py-1 border border-border rounded text-xs bg-white text-ink/70 focus:outline-none focus:ring-1 focus:ring-clay"
                    >
                      <option value="">— 無 —</option>
                      {suppliers.map(s => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right text-ink/40 text-xs">
                    {item.order_unit}（{item.qty_per_order_unit} {item.stock_unit}/{item.order_unit}）
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setEditTarget(item)}
                      title="編輯庫存設定"
                      className="text-ink/40 hover:text-clay transition-colors text-base"
                    >
                      ⚙
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-ink/30">
            {inventory.length === 0 ? '尚無庫存資料' : '沒有符合的品項'}
          </div>
        )}
      </div>

      {editTarget && (
        <InventoryEditModal
          item={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); fetchInventory() }}
        />
      )}
    </>
  )
}

// ============================================================
// 庫存編輯 Modal
// ============================================================
function InventoryEditModal({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: () => void
}) {
  const [stockQty, setStockQty] = useState(String(item.stock_qty))
  const [safetyStock, setSafetyStock] = useState(String(item.safety_stock))
  const [blockOverride, setBlockOverride] = useState(
    item.order_block_threshold !== null && item.order_block_threshold !== undefined
      ? String(item.order_block_threshold)
      : ''
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fallback = item.safety_stock * 0.2

  const handleSubmit = async () => {
    setError(null)

    const sq = Number(stockQty)
    const ss = Number(safetyStock)
    if (!Number.isFinite(sq) || sq < 0) {
      setError('目前庫存必須為 >= 0 的數字')
      return
    }
    if (!Number.isFinite(ss) || ss < 0) {
      setError('安全存量必須為 >= 0 的數字')
      return
    }

    let blockValue: number | null = null
    if (blockOverride.trim() !== '') {
      const b = Number(blockOverride)
      if (!Number.isFinite(b) || b < 0) {
        setError('暫停接單點必須為 >= 0 的數字或留空')
        return
      }
      blockValue = b
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/inventory/${encodeURIComponent(item.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock_qty: sq,
          safety_stock: ss,
          order_block_threshold: blockValue,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || '更新失敗')
        return
      }
      onSaved()
    } catch {
      setError('網路錯誤')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-ink text-base">編輯「{item.name}」</h3>
          <button onClick={onClose} className="text-ink/40 hover:text-ink text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-ink/50 mb-1 block">
              目前庫存（{item.stock_unit}）
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={stockQty}
              onChange={e => setStockQty(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
            />
          </div>
          <div>
            <label className="text-xs text-ink/50 mb-1 block">
              安全存量（{item.stock_unit}）
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={safetyStock}
              onChange={e => setSafetyStock(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
            />
            <p className="text-[11px] text-ink/30 mt-1">
              低於此值時提示補貨
            </p>
          </div>
          <div>
            <label className="text-xs text-ink/50 mb-1 block">
              暫停接單點（{item.stock_unit}，留空使用預設）
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={blockOverride}
              onChange={e => setBlockOverride(e.target.value)}
              placeholder={`預設：${formatQty(fallback)}（安全存量 × 0.2）`}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
            />
            <p className="text-[11px] text-ink/30 mt-1">
              低於此值時，使用此食材的餐點會自動標記「售完」
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-ink/50 hover:text-ink transition-colors">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-clay-deep transition-colors font-medium disabled:opacity-50"
          >
            {submitting ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 供應商分頁
// ============================================================
function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers')
      const data = await res.json()
      if (data.success) setSuppliers(data.data)
      else setError(data.error || '讀取失敗')
    } catch {
      setError('網路錯誤')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSuppliers() }, [fetchSuppliers])

  const filtered = suppliers.filter(s =>
    search === '' || s.name.includes(search) || (s.phone && s.phone.includes(search))
  )

  const openNew = () => {
    setEditTarget(null)
    setFormName('')
    setFormPhone('')
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (s: Supplier) => {
    setEditTarget(s)
    setFormName(s.name)
    setFormPhone(s.phone ?? '')
    setFormError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditTarget(null)
    setFormError(null)
  }

  const handleSubmit = async () => {
    if (!formName.trim()) {
      setFormError('供應商名稱為必填')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      if (editTarget) {
        const res = await fetch(`/api/suppliers/${encodeURIComponent(editTarget.name)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formPhone }),
        })
        const data = await res.json()
        if (!data.success) { setFormError(data.error || '更新失敗'); return }
      } else {
        const res = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), phone: formPhone.trim() || undefined }),
        })
        const data = await res.json()
        if (!data.success) { setFormError(data.error || '新增失敗'); return }
      }
      closeModal()
      fetchSuppliers()
    } catch {
      setFormError('網路錯誤')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (s: Supplier) => {
    if (!window.confirm(`確定要刪除「${s.name}」？\n該供應商的食材會變成無供應商。`)) return
    try {
      const res = await fetch(`/api/suppliers/${encodeURIComponent(s.name)}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) fetchSuppliers()
    } catch { /* silent */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-ink/30">載入中…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm px-5 py-4">
          <span className="text-xs text-ink/40 uppercase tracking-wide">供應商總數</span>
          <p className="text-2xl font-bold text-ink mt-1">{suppliers.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm px-5 py-4">
          <span className="text-xs text-ink/40 uppercase tracking-wide">篩選顯示</span>
          <p className="text-2xl font-bold text-ink mt-1">{filtered.length}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="搜尋名稱或電話…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm w-64 bg-white focus:outline-none focus:ring-2 focus:ring-clay"
        />
        <button
          onClick={openNew}
          className="ml-auto px-4 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-clay-deep transition-colors font-medium"
        >
          + 新增供應商
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-ink/50 text-left text-xs uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">名稱</th>
              <th className="px-4 py-3 font-medium">電話</th>
              <th className="px-4 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, idx) => (
              <tr
                key={s.name}
                className={`border-t border-gray-200 hover:bg-gray-50/50 transition-colors ${
                  idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                }`}
              >
                <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                <td className="px-4 py-3 text-ink/50 font-mono text-xs">{s.phone || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => openEdit(s)}
                      className="px-3 py-1 text-xs rounded-md border border-border text-clay hover:bg-gray-50 transition-colors"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="px-3 py-1 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      刪除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-ink/30">
            {suppliers.length === 0 ? '尚無供應商' : '沒有符合的結果'}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-ink text-base">
                {editTarget ? `編輯「${editTarget.name}」` : '新增供應商'}
              </h3>
              <button onClick={closeModal} className="text-ink/40 hover:text-ink text-2xl leading-none">
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-ink/50 mb-1 block">
                  名稱 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  disabled={!!editTarget}
                  placeholder="肉品大王"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay disabled:bg-gray-50 disabled:text-ink/40"
                />
                {editTarget && (
                  <p className="text-[11px] text-ink/30 mt-1">名稱為主鍵，無法修改</p>
                )}
              </div>
              <div>
                <label className="text-xs text-ink/50 mb-1 block">電話</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={e => setFormPhone(e.target.value)}
                  placeholder="05-2200001"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                />
              </div>
              {formError && (
                <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-ink/50 hover:text-ink transition-colors">
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-clay-deep transition-colors font-medium disabled:opacity-50"
              >
                {submitting ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
