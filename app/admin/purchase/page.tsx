'use client'
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

interface PurchaseOrder {
  採購單編號: number
  採購單日期: string
  供應商名稱: string
  進貨食材總成本: number
  採購單狀態: string
  items?: PurchaseItem[]
  returns?: ReturnRecord[]
}

interface PurchaseItem {
  食材名稱: string
  數量: number
  已退數量?: number
}

interface ReturnRecord {
  退貨單編號: number
  食材名稱: string
  退貨單日期: string
  退貨原因: string | null
  退貨數量: number
}

interface Supplier {
  供應商名稱: string
  供應商電話: string | null
}

interface Ingredient {
  食材名稱: string
  庫存單位: string
  供應商名稱: string | null
}

const STATUS_COLORS: Record<string, string> = {
  '未到貨': 'bg-blue-100 text-blue-700',
  '已到貨': 'bg-amber-100 text-amber-700',
  '已完成驗收': 'bg-green-100 text-green-700',
  '已退貨': 'bg-red-100 text-red-700',
}

function getReturnableInfo(po: PurchaseOrder) {
  const items = po.items ?? []
  let totalOrder = 0
  let totalReturned = 0
  for (const it of items) {
    totalOrder += it.數量
    totalReturned += it.已退數量 || 0
  }
  return {
    totalOrder,
    totalReturned,
    remaining: Math.max(0, totalOrder - totalReturned),
    fullyReturned: totalOrder > 0 && totalReturned >= totalOrder,
  }
}

function formatMoney(n: number): string {
  return Number(n || 0).toLocaleString('zh-TW')
}

function formatQty(n: number): string {
  if (!Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(1)
}

export default function PurchasePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-mute">載入中…</div>}>
      <PurchasePageInner />
    </Suspense>
  )
}

function PurchasePageInner() {
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPo, setExpandedPo] = useState<number | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [returnTarget, setReturnTarget] = useState<PurchaseOrder | null>(null)
  const [prefillIngredient, setPrefillIngredient] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/purchase')
      const data = await res.json()
      if (data.success) setOrders(data.data)
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
      if (data.success) {
        setSuppliers(data.data.map((s: { name: string; phone: string | null }) => ({
          供應商名稱: s.name,
          供應商電話: s.phone,
        })))
      }
    } catch { /* ignore */ }
  }, [])

  const fetchIngredients = useCallback(async () => {
    try {
      const res = await fetch('/api/ingredients')
      const data = await res.json()
      if (data.success) setIngredients(data.data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!searchParams) return
    const ing = searchParams.get('ingredient')
    const open = searchParams.get('open')
    if (ing) setPrefillIngredient(ing)
    if (open === '1') setModalOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchOrders()
    fetchSuppliers()
    fetchIngredients()
  }, [fetchOrders, fetchSuppliers, fetchIngredients])

  const handleMarkArrived = async (poId: number) => {
    if (!window.confirm(`確認採購單 #${poId} 已到貨？`)) return
    try {
      const res = await fetch(`/api/purchase/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '已到貨' }),
      })
      const data = await res.json()
      if (data.success) fetchOrders()
      else window.alert(data.error || '操作失敗')
    } catch { window.alert('網路錯誤') }
  }

  const handleReceive = async (poId: number) => {
    if (!window.confirm(`確認採購單 #${poId} 驗收入庫？將自動把訂購量（扣除已退）加進庫存。`)) return
    try {
      const res = await fetch(`/api/purchase/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '已完成驗收' }),
      })
      const data = await res.json()
      if (data.success) fetchOrders()
      else window.alert(data.error || '驗收失敗')
    } catch { window.alert('網路錯誤') }
  }

  const summary = useMemo(() => {
    const total = orders.length
    const pending = orders.filter(o => o.採購單狀態 === '未到貨').length
    const arrived = orders.filter(o => o.採購單狀態 === '已到貨').length
    const done = orders.filter(o => o.採購單狀態 === '已完成驗收').length
    return { total, pending, arrived, done }
  }, [orders])

  return (
    <>
      <header className="h-16 bg-white border-b border-border flex items-center justify-between px-8 shrink-0">
        <h2 className="text-ink font-body font-semibold text-sm tracking-wide">
          採購管理
        </h2>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-1.5 bg-gray-500 text-white text-sm rounded-lg hover:bg-clay-deep transition-colors font-medium"
        >
          + 新增採購單
        </button>
      </header>

      <main className="flex-1 overflow-auto p-6 bg-gray-50">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <span className="text-xs text-ink/40 uppercase tracking-wide">總數</span>
            <p className="text-2xl font-bold text-ink mt-1">{summary.total}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <span className="text-xs text-blue-600 uppercase tracking-wide">未到貨</span>
            <p className="text-2xl font-bold text-blue-600 mt-1">{summary.pending}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <span className="text-xs text-amber-600 uppercase tracking-wide">已到貨</span>
            <p className="text-2xl font-bold text-amber-600 mt-1">{summary.arrived}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <span className="text-xs text-green-600 uppercase tracking-wide">已驗收</span>
            <p className="text-2xl font-bold text-green-600 mt-1">{summary.done}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-ink/30">載入中…</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-red-500">{error}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm text-center py-16 text-ink/30">
            尚無採購單，點右上「+ 新增採購單」或至
            <a href="/admin/inventory" className="text-clay hover:underline ml-1">
              庫存管理
            </a>
            執行「低庫存補貨」
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(po => (
              <div key={po.採購單編號} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                  <div className="flex items-center gap-5">
                    <div>
                      <p className="text-[11px] text-ink/40 uppercase tracking-wide font-mono">
                        PO #{po.採購單編號}
                      </p>
                      <p className="text-sm font-semibold text-ink">{po.供應商名稱}</p>
                    </div>
                    <div className="text-xs text-ink/50 font-mono">{po.採購單日期?.slice(0, 10)}</div>
                    <div className="text-sm font-mono text-clay">
                      NT$ {formatMoney(po.進貨食材總成本)}
                    </div>
                    {(() => {
                      const info = getReturnableInfo(po)
                      const hasReturns = info.totalReturned > 0
                      return (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[po.採購單狀態] ?? 'bg-gray-100'
                          }`}
                          title={hasReturns ? `已退 ${formatQty(info.totalReturned)} / 訂購 ${formatQty(info.totalOrder)}` : undefined}
                        >
                          {po.採購單狀態}
                          {hasReturns && po.採購單狀態 === '已取消' && (
                            <span className="ml-1 font-mono">
                              ({formatQty(info.totalReturned)}/{formatQty(info.totalOrder)})
                            </span>
                          )}
                        </span>
                      )
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    {po.採購單狀態 === '未到貨' && (
                      <button
                        onClick={() => handleMarkArrived(po.採購單編號)}
                        className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs hover:bg-amber-600 transition-colors"
                      >
                        到貨
                      </button>
                    )}
                    {po.採購單狀態 === '已到貨' && (
                      <>
                        <button
                          onClick={() => handleReceive(po.採購單編號)}
                          className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition-colors"
                        >
                          驗收入庫
                        </button>
                        {!getReturnableInfo(po).fullyReturned && (
                          <button
                            onClick={() => setReturnTarget(po)}
                            className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 transition-colors"
                          >
                            退貨
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={() =>
                        setExpandedPo(expandedPo === po.採購單編號 ? null : po.採購單編號)
                      }
                      className="px-3 py-1.5 border border-border text-ink/60 rounded-lg text-xs hover:bg-gray-50 transition-colors"
                    >
                      {expandedPo === po.採購單編號 ? '收起' : '查看明細'}
                    </button>
                  </div>
                </div>

                {expandedPo === po.採購單編號 && (
                  <div className="px-5 py-3 bg-gray-50/50 space-y-4">
                    {po.items && po.items.length > 0 ? (
                      <div>
                        <p className="text-[11px] text-ink/40 uppercase tracking-wide mb-1">訂購明細</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-ink/40 text-left uppercase tracking-wide">
                              <th className="pb-1">食材</th>
                              <th className="pb-1 text-right">訂購量</th>
                              <th className="pb-1 text-right">已退</th>
                              <th className="pb-1 text-right">剩餘</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.items.map(item => {
                              const ret = item.已退數量 || 0
                              const remain = item.數量 - ret
                              return (
                                <tr key={item.食材名稱} className="border-t border-gray-200">
                                  <td className="py-1.5 text-ink">{item.食材名稱}</td>
                                  <td className="py-1.5 text-right font-mono">{formatQty(item.數量)}</td>
                                  <td className={`py-1.5 text-right font-mono ${ret > 0 ? 'text-orange-600' : 'text-ink/30'}`}>
                                    {ret > 0 ? formatQty(ret) : '—'}
                                  </td>
                                  <td className={`py-1.5 text-right font-mono ${remain <= 0 ? 'text-ink/30 line-through' : ''}`}>
                                    {formatQty(remain)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-ink/30">（此單無明細）</p>
                    )}

                    {po.returns && po.returns.length > 0 && (
                      <div>
                        <p className="text-[11px] text-orange-600 uppercase tracking-wide mb-1">退貨歷史</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-ink/40 text-left uppercase tracking-wide">
                              <th className="pb-1">日期</th>
                              <th className="pb-1">食材</th>
                              <th className="pb-1 text-right">退貨量</th>
                              <th className="pb-1">原因</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.returns.map(r => (
                              <tr key={r.退貨單編號} className="border-t border-gray-200">
                                <td className="py-1.5 font-mono text-ink/60">{r.退貨單日期?.slice(0, 10)}</td>
                                <td className="py-1.5 text-ink">{r.食材名稱}</td>
                                <td className="py-1.5 text-right font-mono text-orange-600">
                                  {formatQty(r.退貨數量)}
                                </td>
                                <td className="py-1.5 text-ink/60">{r.退貨原因 || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {modalOpen && (
        <CreatePOModal
          suppliers={suppliers}
          ingredients={ingredients}
          initialIngredient={prefillIngredient}
          onClose={() => {
            setModalOpen(false)
            setPrefillIngredient(null)
          }}
          onCreated={() => {
            setModalOpen(false)
            setPrefillIngredient(null)
            fetchOrders()
          }}
        />
      )}

      {returnTarget && (
        <ReturnModal
          po={returnTarget}
          onClose={() => setReturnTarget(null)}
          onDone={() => {
            setReturnTarget(null)
            fetchOrders()
          }}
        />
      )}
    </>
  )
}

interface DraftItem {
  ingredient_name: string
  order_qty: string
}

function CreatePOModal({
  suppliers,
  ingredients,
  initialIngredient,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[]
  ingredients: Ingredient[]
  initialIngredient?: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [poDate, setPoDate] = useState(today)
  const [supplierName, setSupplierName] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [items, setItems] = useState<DraftItem[]>([
    { ingredient_name: initialIngredient ?? '', order_qty: '' },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const ingredientOptions = useMemo(() => {
    if (supplierName) {
      return ingredients.filter(ing => ing.供應商名稱 === supplierName || !ing.供應商名稱)
    }
    return ingredients
  }, [ingredients, supplierName])

  const addRow = () => {
    setItems(prev => [...prev, { ingredient_name: '', order_qty: '' }])
  }

  const removeRow = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const updateRow = (idx: number, patch: Partial<DraftItem>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const handleSubmit = async () => {
    setErrMsg(null)

    if (!supplierName.trim()) {
      setErrMsg('請選擇供應商')
      return
    }
    const validItems = items
      .filter(i => i.ingredient_name.trim() && i.order_qty.trim())
      .map(i => ({
        ingredient_name: i.ingredient_name.trim(),
        order_qty: parseFloat(i.order_qty),
      }))

    if (validItems.length === 0) {
      setErrMsg('請至少新增一項明細')
      return
    }
    for (const it of validItems) {
      if (!Number.isFinite(it.order_qty) || it.order_qty <= 0) {
        setErrMsg(`${it.ingredient_name} 的訂購量需為正數`)
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          po_date: poDate,
          supplier_name: supplierName.trim(),
          status: '未到貨',
          total_cost: Number(totalCost) || 0,
          items: validItems,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onCreated()
      } else {
        setErrMsg(data.error || '建單失敗')
      }
    } catch {
      setErrMsg('網路錯誤')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-ink text-base">新增採購單</h3>
          <button onClick={onClose} className="text-ink/40 hover:text-ink text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-ink/50 mb-1 block">採購日期</label>
              <input
                type="date"
                value={poDate}
                onChange={e => setPoDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
              />
            </div>
            <div>
              <label className="text-xs text-ink/50 mb-1 block">
                供應商 <span className="text-red-400">*</span>
              </label>
              <select
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-clay"
              >
                <option value="">
                  {suppliers.length === 0 ? '尚無供應商' : '請選擇'}
                </option>
                {suppliers.map(s => (
                  <option key={s.供應商名稱} value={s.供應商名稱}>
                    {s.供應商名稱}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink/50 mb-1 block">總成本 (NT$)</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="選填"
                value={totalCost}
                onChange={e => setTotalCost(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-clay"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-ink/50 uppercase tracking-wide">明細</label>
              <button
                onClick={addRow}
                className="text-xs text-clay hover:underline"
              >
                + 新增明細
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => {
                const selected = ingredients.find(i => i.食材名稱 === item.ingredient_name)
                return (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={item.ingredient_name}
                      onChange={e => updateRow(idx, { ingredient_name: e.target.value })}
                      className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-clay"
                    >
                      <option value="">選擇食材</option>
                      {ingredientOptions.map(ing => (
                        <option key={ing.食材名稱} value={ing.食材名稱}>
                          {ing.食材名稱}
                          {ing.供應商名稱 ? ` (${ing.供應商名稱})` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="relative w-32">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="訂購量"
                        value={item.order_qty}
                        onChange={e => updateRow(idx, { order_qty: e.target.value })}
                        className="w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                      />
                      {selected && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-ink/30">
                          {selected.庫存單位}
                        </span>
                      )}
                    </div>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeRow(idx)}
                        className="text-ink/30 hover:text-red-500 transition-colors px-1"
                        title="移除這列"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-ink/30 mt-2">
              訂購量以食材的庫存單位（片 / 隻 / kg 等）計。
            </p>
          </div>

          {errMsg && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{errMsg}</p>
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
            {submitting ? '建立中…' : '建立採購單'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReturnModal({
  po,
  onClose,
  onDone,
}: {
  po: PurchaseOrder
  onClose: () => void
  onDone: () => void
}) {
  type Row = {
    ingredient_name: string
    order_qty: number
    returned_qty: number
    remaining: number
    checked: boolean
    return_qty: string
    reason: string
  }

  const [rows, setRows] = useState<Row[]>(() =>
    (po.items ?? []).map(it => {
      const ret = it.已退數量 || 0
      return {
        ingredient_name: it.食材名稱,
        order_qty: it.數量,
        returned_qty: ret,
        remaining: Math.max(0, it.數量 - ret),
        checked: false,
        return_qty: '',
        reason: '',
      }
    })
  )
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const update = (idx: number, patch: Partial<Row>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const handleReturnAll = () => {
    setRows(prev => prev.map(r => r.remaining > 0
      ? { ...r, checked: true, return_qty: String(r.remaining) }
      : r
    ))
  }

  const valid = rows
    .filter(r => r.checked && r.remaining > 0)
    .map(r => ({ ...r, num: Number(r.return_qty) }))

  const canSubmit =
    valid.length > 0 &&
    valid.every(r => Number.isFinite(r.num) && r.num > 0 && r.num <= r.remaining)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setErrors([])
    const errs: string[] = []
    for (const r of valid) {
      try {
        const res = await fetch(`/api/purchase-orders/${po.採購單編號}/return`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredient_name: r.ingredient_name,
            return_qty: r.num,
            return_reason: r.reason.trim() || undefined,
          }),
        })
        const data = await res.json()
        if (!data.success) errs.push(`${r.ingredient_name}：${data.error || '退貨失敗'}`)
      } catch {
        errs.push(`${r.ingredient_name}：網路錯誤`)
      }
    }
    setSubmitting(false)
    if (errs.length > 0) {
      setErrors(errs)
      return
    }
    onDone()
  }

  const anyRemaining = rows.some(r => r.remaining > 0)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-ink text-lg flex items-center gap-2">
              <span className="text-red-500">↩</span>
              退貨登錄 — PO #{po.採購單編號}
            </h3>
            <p className="text-xs text-ink/50 mt-1">
              廠商：<span className="font-semibold text-ink">{po.供應商名稱}</span>
              · 填入要退的數量
            </p>
          </div>
          <button onClick={onClose} className="text-ink/40 hover:text-ink text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {rows.length === 0 ? (
            <p className="text-center text-ink/30 py-10">此採購單沒有明細</p>
          ) : !anyRemaining ? (
            <p className="text-center text-ink/40 py-10">此採購單已全數退貨，無可退項目</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-ink/40">勾選要退的食材，或一鍵全退</p>
                <button
                  onClick={handleReturnAll}
                  className="px-3 py-1 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  全部退貨（剩餘量 {formatQty(rows.reduce((s, r) => s + r.remaining, 0))}）
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink/50 text-xs uppercase tracking-wide border-b border-gray-200">
                    <th className="w-8 pb-2"></th>
                    <th className="text-left pb-2">食材</th>
                    <th className="text-right pb-2">叫貨</th>
                    <th className="text-right pb-2">已退</th>
                    <th className="text-right pb-2">可退</th>
                    <th className="text-right pb-2 pl-2">退回量</th>
                    <th className="text-left pb-2 pl-3">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const fullyReturned = r.remaining <= 0
                    const num = Number(r.return_qty)
                    const overQty = r.checked && Number.isFinite(num) && num > r.remaining
                    return (
                      <tr
                        key={r.ingredient_name}
                        className={`border-b border-gray-100 ${fullyReturned ? 'opacity-40' : ''}`}
                      >
                        <td className="py-3">
                          <input
                            type="checkbox"
                            checked={r.checked}
                            disabled={fullyReturned}
                            onChange={e => update(idx, { checked: e.target.checked })}
                            className="w-4 h-4 accent-red-500 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="py-3 font-medium text-ink">{r.ingredient_name}</td>
                        <td className="py-3 text-right font-mono text-ink/60 text-xs">{formatQty(r.order_qty)}</td>
                        <td className={`py-3 text-right font-mono text-xs ${r.returned_qty > 0 ? 'text-orange-600' : 'text-ink/30'}`}>
                          {r.returned_qty > 0 ? formatQty(r.returned_qty) : '—'}
                        </td>
                        <td className={`py-3 text-right font-mono text-xs font-semibold ${fullyReturned ? 'text-ink/30' : 'text-emerald-600'}`}>
                          {formatQty(r.remaining)}
                        </td>
                        <td className="py-3 text-right pl-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max={r.remaining}
                            disabled={!r.checked || fullyReturned}
                            value={r.return_qty}
                            onChange={e => update(idx, { return_qty: e.target.value })}
                            placeholder="0"
                            className={`w-20 px-2 py-1 border rounded text-xs text-right font-mono focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-ink/30 ${
                              overQty ? 'border-red-400 focus:ring-red-400' : 'border-border focus:ring-clay'
                            }`}
                          />
                        </td>
                        <td className="py-3 pl-3">
                          <input
                            type="text"
                            disabled={!r.checked || fullyReturned}
                            value={r.reason}
                            onChange={e => update(idx, { reason: e.target.value })}
                            placeholder="例：發霉、規格不符"
                            className="w-full px-2 py-1 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-clay disabled:bg-gray-50 disabled:text-ink/30"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}

          {errors.length > 0 && (
            <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-1">
              {errors.map((e, i) => (
                <p key={i}>· {e}</p>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] text-ink/40">
            送出後庫存自動扣回對應數量；庫存不足或超量會被擋下。退貨後 PO 自動推進為「已取消」。
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-ink/50">
            將登錄 <span className="font-semibold text-red-600">{valid.length}</span> 筆退貨
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-ink/50 hover:text-ink transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="px-5 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
            >
              {submitting ? '送出中…' : '確認退貨'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
