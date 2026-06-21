'use client'
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

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
  category: string
}

interface Supplier {
  name: string
  phone: string | null
}

interface LowStockSupplierOption {
  supplier_name: string
  is_primary: number
  price_per_order_unit: number | null
}

interface LowStockItem {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
  order_unit: string
  qty_per_order_unit: number
  suggested_qty: number
  default_supplier: string | null
  suppliers: LowStockSupplierOption[]
}

type TabKey = 'inventory' | 'suppliers'


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
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-mute">載入中…</div>}>
      <InventoryPageInner />
    </Suspense>
  )
}

function InventoryPageInner() {
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
        <div className="flex gap-2 mb-5 cursor-default">
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
  const [search, setSearch] = useState('')

  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [autoGenLoading, setAutoGenLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // 低庫存警示彈窗：第一次進入頁面、且偵測到有低庫存品項時自動顯示
  const [lowAlertOpen, setLowAlertOpen] = useState(false)
  const [lowItems, setLowItems] = useState<LowStockItem[]>([])
  const [lowLoading, setLowLoading] = useState(false)

  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory', { cache: 'no-store' })
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

  // 第一次進來自動掃低庫存（每個 session 只跳一次）
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.sessionStorage.getItem('lowStockAlertShown') === '1') return
    let cancelled = false
    setLowLoading(true)
    fetch('/api/inventory/low-stock')
      .then(r => r.json())
      .then((data: { success: boolean; data?: LowStockItem[] }) => {
        if (cancelled) return
        if (data.success && data.data && data.data.length > 0) {
          setLowItems(data.data)
          setLowAlertOpen(true)
        }
        window.sessionStorage.setItem('lowStockAlertShown', '1')
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLowLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => inventory.filter(item => {
    return search === '' || item.name.includes(search)
  }), [inventory, search])

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

  // 手動開啟低庫存彈窗（按鈕觸發，繞過 sessionStorage 限制）
  const openLowStockModal = async () => {
    setAutoGenLoading(true)
    setToast(null)
    try {
      const res = await fetch('/api/inventory/low-stock')
      const data = await res.json()
      if (data.success) {
        if ((data.data ?? []).length === 0) {
          setToast({ type: 'info', text: '目前沒有低於安全庫存的食材' })
        } else {
          setLowItems(data.data)
          setLowAlertOpen(true)
        }
      } else {
        setToast({ type: 'error', text: data.error || '讀取失敗' })
      }
    } catch {
      setToast({ type: 'error', text: '網路錯誤' })
    } finally {
      setAutoGenLoading(false)
      setTimeout(() => setToast(null), 6000)
    }
  }

  // 彈窗按「建立採購單」後：把使用者調整過的 items 送給 auto-generate
  const handleConfirmLowStock = async (
    items: Array<{ ingredient_name: string; supplier_name: string; order_qty: number; total_cost: number }>
  ) => {
    setAutoGenLoading(true)
    setToast(null)
    try {
      const res = await fetch('/api/purchase/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (data.success) {
        const created = data.data?.created_count ?? 0
        if (created === 0) {
          setToast({ type: 'info', text: '沒有需要建單的品項' })
        } else {
          setToast({
            type: 'success',
            text: `已建立 ${created} 張採購單，覆蓋 ${data.data?.covered_ingredients?.length ?? 0} 項食材`,
          })
        }
        setLowAlertOpen(false)
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
    // optimistic update
    setInventory(prev => prev.map(i => i.name === item.name ? { ...i, supplier_name } : i))
    try {
      const res = await fetch(`/api/inventory/${encodeURIComponent(item.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_name }),
      })
      const data = await res.json()
      if (!data.success) {
        setInventory(prev => prev.map(i => i.name === item.name ? { ...i, supplier_name: item.supplier_name } : i))
        window.alert(data.error || '更新失敗')
      }
    } catch {
      setInventory(prev => prev.map(i => i.name === item.name ? { ...i, supplier_name: item.supplier_name } : i))
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

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="搜尋品名…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm w-64 bg-white focus:outline-none focus:ring-2 focus:ring-clay"
        />
        <div className="flex-1" />
        <button
          onClick={openLowStockModal}
          disabled={autoGenLoading || lowLoading}
          className="px-3 py-1.5 bg-clay text-white text-xs rounded-lg hover:bg-clay-deep transition-colors font-medium disabled:opacity-50"
          title="查看低於安全庫存的食材，選擇廠商後一鍵建單"
        >
          {autoGenLoading ? '處理中…' : '低庫存補貨'}
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-1.5 bg-gray-500 text-white text-xs rounded-lg hover:bg-clay-deep transition-colors font-medium"
        >
          + 新增食材
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
              <th className="px-4 py-3 font-medium text-center">狀態</th>
              <th className="px-4 py-3 font-medium">供應商</th>
              <th className="px-4 py-3 font-medium text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => {
              const status = getStatus(item)
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
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
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
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Link
                        href={`/admin/purchase?open=1&ingredient=${encodeURIComponent(item.name)}`}
                        title={`為「${item.name}」建採購單`}
                        className="text-[11px] px-2 py-0.5 rounded-md border border-clay/40 text-clay hover:bg-clay hover:text-white transition-colors"
                      >
                        + 採購單
                      </Link>
                      <button
                        onClick={() => setEditTarget(item)}
                        title="編輯庫存設定"
                        className="text-ink/40 hover:text-clay transition-colors text-base"
                      >
                        ⚙
                      </button>
                    </div>
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

      {createOpen && (
        <CreateIngredientModal
          suppliers={suppliers}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); fetchInventory() }}
        />
      )}

      {lowAlertOpen && (
        <LowStockAlertModal
          items={lowItems}
          submitting={autoGenLoading}
          onClose={() => setLowAlertOpen(false)}
          onConfirm={handleConfirmLowStock}
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

  const filtered = suppliers.filter(s => {
    return search === '' || s.name.includes(search) || (s.phone && s.phone.includes(search))
  })

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
          body: JSON.stringify({
            name: formName.trim(),
            phone: formPhone.trim() || null,
          }),
        })
        const data = await res.json()
        if (!data.success) { setFormError(data.error || '更新失敗'); return }
      } else {
        const res = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            phone: formPhone.trim() || undefined,
          }),
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
          placeholder="搜尋名稱 / 電話…"
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
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[45%]" />
            <col className="w-[30%]" />
            <col className="w-[25%]" />
          </colgroup>
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
                <td className="px-4 py-3 font-medium text-ink truncate">{s.name}</td>
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
                  placeholder="肉品大王"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                />
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

// ============================================================
// 低庫存警示彈窗
//   - 列出所有低於安全庫存的食材
//   - 每筆可選廠商（多家者可下拉）、可改建議數量（單位 = stock_unit）
//   - 按「建立採購單」會按 supplier 分組建單
// ============================================================
interface LowDraftRow {
  ingredient_name: string
  supplier_name: string
  order_qty: string
  estimated_cost: string
  stock_unit: string
}

function LowStockAlertModal({
  items,
  submitting,
  onClose,
  onConfirm,
}: {
  items: LowStockItem[]
  submitting: boolean
  onClose: () => void
  onConfirm: (rows: Array<{ ingredient_name: string; supplier_name: string; order_qty: number; total_cost: number }>) => void
}) {
  // 計算預估成本：price_per_order_unit * order_qty（order_qty 已經是叫貨單位數量）
  // 如果 order_qty 是 stock_unit 計量，需要 / qty_per_order_unit 換算
  const calcCost = (item: LowStockItem, supplierName: string, orderQty: number): number => {
    const sup = item.suppliers.find(s => s.supplier_name === supplierName)
    if (!sup?.price_per_order_unit || !item.qty_per_order_unit || item.qty_per_order_unit <= 0) return 0
    // order_qty 是以 stock_unit 為單位，換算成叫貨單位再乘單價
    return Math.round(sup.price_per_order_unit * orderQty / item.qty_per_order_unit)
  }

  const [draft, setDraft] = useState<LowDraftRow[]>(() =>
    items.map(it => {
      const supplierName =
        it.suppliers.find(s => s.is_primary === 1)?.supplier_name ??
        it.suppliers[0]?.supplier_name ??
        it.default_supplier ??
        ''
      const qty = it.suggested_qty || 0
      const cost = calcCost(it, supplierName, qty)
      return {
        ingredient_name: it.name,
        supplier_name: supplierName,
        order_qty: String(it.suggested_qty || ''),
        estimated_cost: cost > 0 ? String(cost) : '',
        stock_unit: it.stock_unit,
      }
    })
  )

  const update = (idx: number, patch: Partial<LowDraftRow>) => {
    setDraft(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, ...patch }
      // 如果是更改廠商或數量（非直接改成本），則自動重算成本
      if ('supplier_name' in patch || 'order_qty' in patch) {
        const item = items[idx]
        const qty = Number(updated.order_qty)
        if (item && Number.isFinite(qty) && qty > 0) {
          const cost = calcCost(item, updated.supplier_name, qty)
          updated.estimated_cost = cost > 0 ? String(cost) : updated.estimated_cost
        }
      }
      return updated
    }))
  }

  const updateCost = (idx: number, costStr: string) => {
    setDraft(prev => prev.map((r, i) => (i === idx ? { ...r, estimated_cost: costStr } : r)))
  }

  const validRows = useMemo(
    () =>
      draft
        .map(r => ({
          ingredient_name: r.ingredient_name,
          supplier_name: r.supplier_name,
          order_qty: Number(r.order_qty),
          total_cost: Number(r.estimated_cost) || 0,
        }))
        .filter(r => r.supplier_name && Number.isFinite(r.order_qty) && r.order_qty > 0),
    [draft]
  )

  // 預覽：按 supplier 分組會開幾張單
  const groupedCount = useMemo(() => {
    const set = new Set<string>()
    for (const r of validRows) set.add(r.supplier_name)
    return set.size
  }, [validRows])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-ink text-lg flex items-center gap-2">
              <span className="text-amber-500">⚠</span>
              低庫存提醒
            </h3>
            <p className="text-xs text-ink/50 mt-1">
              以下 <span className="font-semibold text-red-600">{items.length}</span> 項食材已低於安全庫存。
              確認廠商與數量後，可一鍵生成採購單（依廠商分組）。
            </p>
          </div>
          <button onClick={onClose} className="text-ink/40 hover:text-ink text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink/50 text-xs uppercase tracking-wide border-b border-gray-200">
                <th className="text-left pb-2">品名</th>
                <th className="text-right pb-2">庫存 / 安全</th>
                <th className="text-left pb-2 pl-3">廠商</th>
                <th className="text-right pb-2">叫貨數量</th>
                <th className="text-right pb-2">預估成本</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const row = draft[idx]
                const supList = it.suppliers
                const selected = supList.find(s => s.supplier_name === row.supplier_name)
                return (
                  <tr key={it.name} className="border-b border-gray-100">
                    <td className="py-3 font-medium text-ink">{it.name}</td>
                    <td className="py-3 text-right font-mono text-xs">
                      <span className="text-red-600 font-semibold">{formatQty(it.stock_qty)}</span>
                      <span className="text-ink/30"> / {formatQty(it.safety_stock)}</span>
                      <span className="text-ink/30 ml-1">{it.stock_unit}</span>
                    </td>
                    <td className="py-3 pl-3">
                      {supList.length === 0 ? (
                        <span className="text-xs text-red-500">無廠商</span>
                      ) : supList.length === 1 ? (
                        <span className="text-xs text-ink/70">
                          {supList[0].supplier_name}
                          <span className="text-amber-600 ml-1">★</span>
                        </span>
                      ) : (
                        <select
                          value={row.supplier_name}
                          onChange={e => update(idx, { supplier_name: e.target.value })}
                          className="px-2 py-1 border border-border rounded text-xs bg-white text-ink/80 focus:outline-none focus:ring-1 focus:ring-clay"
                        >
                          {supList.map(s => (
                            <option key={s.supplier_name} value={s.supplier_name}>
                              {s.supplier_name}
                              {s.is_primary === 1 ? ' ★' : ''}
                              {s.price_per_order_unit !== null
                                ? ` (NT$${s.price_per_order_unit}/${it.order_unit})`
                                : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      {selected?.price_per_order_unit !== null && selected?.price_per_order_unit !== undefined && (
                        <p className="text-[10px] text-ink/40 mt-0.5">
                          參考價 NT${selected.price_per_order_unit} / {it.order_unit}
                        </p>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.order_qty}
                          onChange={e => update(idx, { order_qty: e.target.value })}
                          className="w-20 px-2 py-1 border border-border rounded text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-clay"
                        />
                        <span className="text-xs text-ink/40">{it.stock_unit}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-xs text-ink/40">NT$</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.estimated_cost}
                          onChange={e => updateCost(idx, e.target.value)}
                          placeholder="0"
                          className="w-20 px-2 py-1 border border-border rounded text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-clay"
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
            數量留空或填 0 的項目會被略過。同廠商的多項食材會合併在同一張採購單。
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-ink/50">
            將建立 <span className="font-semibold text-ink">{groupedCount}</span> 張採購單，共
            <span className="font-semibold text-ink"> {validRows.length}</span> 項食材
            {validRows.some(r => r.total_cost > 0) && (
              <>，預估總成本 <span className="font-semibold text-ink">NT${validRows.reduce((sum, r) => sum + r.total_cost, 0).toLocaleString()}</span></>
            )}
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-ink/50 hover:text-ink transition-colors disabled:opacity-50"
            >
              暫時略過
            </button>
            <button
              onClick={() => onConfirm(validRows)}
              disabled={submitting || validRows.length === 0}
              className="px-5 py-2 bg-clay text-white text-sm rounded-lg hover:bg-clay-deep transition-colors font-medium disabled:opacity-50"
            >
              {submitting ? '建立中…' : '生成採購單'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 新增食材 Modal
// ============================================================
const STOCK_UNIT_PRESETS = ['片', '隻', 'kg', '包', '顆', '條', '瓶', '罐', '把', '盒', '份', '個']
const ORDER_UNIT_PRESETS = ['箱', '包', '盒', '袋', '瓶', '罐', '桶', '組', '份', '個']
const INGREDIENT_CATEGORIES = ['豬', '雞', '牛', '魚', '其他'] as const

interface CreateIngredientForm {
  name: string
  category: string
  stock_unit: string
  order_unit: string
  qty_per_order_unit: string
  stock_qty: string
  safety_stock: string
  order_block_threshold: string
  supplier_name: string
}

const EMPTY_CREATE_FORM: CreateIngredientForm = {
  name: '',
  category: '其他',
  stock_unit: '',
  order_unit: '',
  qty_per_order_unit: '',
  stock_qty: '0',
  safety_stock: '0',
  order_block_threshold: '',
  supplier_name: '',
}

function CreateIngredientModal({
  suppliers,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[]
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<CreateIngredientForm>(EMPTY_CREATE_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upd = (key: keyof CreateIngredientForm, val: string) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('請輸入食材名稱'); return }
    if (!form.stock_unit.trim()) { setError('請輸入庫存單位'); return }
    if (!form.order_unit.trim()) { setError('請輸入叫貨單位'); return }
    const qtyPerOrder = Number(form.qty_per_order_unit)
    if (!qtyPerOrder || qtyPerOrder <= 0) { setError('每叫貨單位數量需大於 0'); return }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category,
          stock_unit: form.stock_unit.trim(),
          order_unit: form.order_unit.trim(),
          qty_per_order_unit: qtyPerOrder,
          stock_qty: Number(form.stock_qty) || 0,
          safety_stock: Number(form.safety_stock) || 0,
          order_block_threshold: form.order_block_threshold ? Number(form.order_block_threshold) : null,
          supplier_name: form.supplier_name || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onCreated()
      } else {
        setError(data.error || '新增失敗')
      }
    } catch {
      setError('網路錯誤')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-ink text-base">新增食材</h3>
          <button onClick={onClose} className="text-ink/40 hover:text-ink text-2xl leading-none">×</button>
        </div>

        <form onSubmit={e => { e.preventDefault(); if (!submitting) handleSubmit() }}>
          <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* 品名 */}
            <div>
              <label className="text-xs text-ink/50 mb-1 block">品名 <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={e => upd('name', e.target.value)}
                placeholder="例：酥炸排骨"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
              />
            </div>

            {/* 分類 + 供應商 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-ink/50 mb-1 block">分類</label>
                <select
                  value={form.category}
                  onChange={e => upd('category', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-clay"
                >
                  {INGREDIENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-ink/50 mb-1 block">供應商</label>
                <select
                  value={form.supplier_name}
                  onChange={e => upd('supplier_name', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-clay"
                >
                  <option value="">— 無 —</option>
                  {suppliers.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* 庫存單位 + 叫貨單位（datalist） */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-ink/50 mb-1 block">庫存單位 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  list="stock-unit-list"
                  value={form.stock_unit}
                  onChange={e => upd('stock_unit', e.target.value)}
                  placeholder="片、kg、隻…"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                />
                <datalist id="stock-unit-list">
                  {STOCK_UNIT_PRESETS.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
              <div className="flex-1">
                <label className="text-xs text-ink/50 mb-1 block">叫貨單位 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  list="order-unit-list"
                  value={form.order_unit}
                  onChange={e => upd('order_unit', e.target.value)}
                  placeholder="箱、包、盒…"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                />
                <datalist id="order-unit-list">
                  {ORDER_UNIT_PRESETS.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
            </div>

            {/* 每叫貨單位數量 */}
            <div>
              <label className="text-xs text-ink/50 mb-1 block">
                每叫貨單位數量 <span className="text-red-400">*</span>
                <span className="text-ink/30 ml-1">（1 {form.order_unit || '叫貨單位'} = 幾 {form.stock_unit || '庫存單位'}）</span>
              </label>
              <input
                type="number"
                value={form.qty_per_order_unit}
                onChange={e => upd('qty_per_order_unit', e.target.value)}
                min={0.1}
                step="any"
                placeholder="例：10"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-clay"
              />
            </div>

            {/* 初始庫存 + 安全存量 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-ink/50 mb-1 block">初始庫存</label>
                <input
                  type="number"
                  value={form.stock_qty}
                  onChange={e => upd('stock_qty', e.target.value)}
                  min={0}
                  step="any"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-clay"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-ink/50 mb-1 block">安全存量</label>
                <input
                  type="number"
                  value={form.safety_stock}
                  onChange={e => upd('safety_stock', e.target.value)}
                  min={0}
                  step="any"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-clay"
                />
              </div>
            </div>

            {/* 暫停接單點（選填） */}
            <div>
              <label className="text-xs text-ink/50 mb-1 block">
                暫停接單點
                <span className="text-ink/30 ml-1">（選填，低於此值時前台停售）</span>
              </label>
              <input
                type="number"
                value={form.order_block_threshold}
                onChange={e => upd('order_block_threshold', e.target.value)}
                min={0}
                step="any"
                placeholder="留空使用預設值（安全存量 × 20%）"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-clay"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-ink/50 hover:text-ink transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-clay-deep transition-colors font-medium disabled:opacity-50"
            >
              {submitting ? '新增中…' : '新增食材'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
