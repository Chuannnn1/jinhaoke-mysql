'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'

// ============================================================
// 採購管理 /admin/purchase
//   - 列表所有 PO（po_id / po_date / supplier_name / status / total_amount）
//   - 點開看明細
//   - 「+ 新增採購單」 modal：供應商 + 多列明細（食材下拉）
//   - 既有 PO 可改狀態
// ============================================================

interface PurchaseOrder {
  po_id: number
  po_date: string
  supplier_name: string
  total_amount: number
  status: string
  items?: PurchaseItem[]
}

interface PurchaseItem {
  ingredient_name: string
  order_qty: number
  total_cost: number
}

interface Supplier {
  name: string
  phone?: string | null
}

interface Ingredient {
  name: string
  stock_unit: string
  order_unit: string
  qty_per_order_unit: number
  supplier_name: string | null
}

const STATUS_OPTIONS = ['已訂購', '已驗貨', '部分退貨'] as const
type StatusType = (typeof STATUS_OPTIONS)[number]

const STATUS_COLORS: Record<string, string> = {
  '已訂購':  'bg-blue-100 text-blue-700',
  '已驗貨':  'bg-green-100 text-green-700',
  '部分退貨': 'bg-orange-100 text-orange-700',
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
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPo, setExpandedPo] = useState<number | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [returnTarget, setReturnTarget] = useState<PurchaseOrder | null>(null)

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
      if (data.success) setSuppliers(data.data)
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
    fetchOrders()
    fetchSuppliers()
    fetchIngredients()
  }, [fetchOrders, fetchSuppliers, fetchIngredients])

  const handleReceive = async (poId: number) => {
    if (!window.confirm(`確認 PO #${poId} 已驗貨入庫？此動作將自動將訂購量加進庫存。`)) return
    try {
      const res = await fetch(`/api/purchase/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '已驗貨' }),
      })
      const data = await res.json()
      if (data.success) {
        fetchOrders()
      } else {
        window.alert(data.error || '驗貨失敗')
      }
    } catch {
      window.alert('網路錯誤')
    }
  }

  const summary = useMemo(() => {
    const total = orders.length
    const open = orders.filter(o => o.status === '已訂購').length
    const done = orders.filter(o => o.status === '已驗貨').length
    return { total, open, done }
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
        {/* 摘要卡片 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <span className="text-xs text-ink/40 uppercase tracking-wide">採購單總數</span>
            <p className="text-2xl font-bold text-ink mt-1">{summary.total}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <span className="text-xs text-blue-600 uppercase tracking-wide">待驗貨</span>
            <p className="text-2xl font-bold text-blue-600 mt-1">{summary.open}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <span className="text-xs text-green-600 uppercase tracking-wide">已驗貨</span>
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
            執行「自動補貨建議」
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(po => (
              <div key={po.po_id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                  <div className="flex items-center gap-5">
                    <div>
                      <p className="text-[11px] text-ink/40 uppercase tracking-wide font-mono">
                        PO #{po.po_id}
                      </p>
                      <p className="text-sm font-semibold text-ink">{po.supplier_name}</p>
                    </div>
                    <div className="text-xs text-ink/50 font-mono">{po.po_date}</div>
                    <div className="text-sm font-mono text-clay">
                      NT$ {formatMoney(po.total_amount)}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_COLORS[po.status] ?? 'bg-gray-100'
                      }`}
                    >
                      {po.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {po.status === '已訂購' && (
                      <button
                        onClick={() => handleReceive(po.po_id)}
                        className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition-colors"
                      >
                        驗貨入庫
                      </button>
                    )}
                    {(po.status === '已驗貨' || po.status === '部分退貨') && (
                      <button
                        onClick={() => setReturnTarget(po)}
                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 transition-colors"
                        title="登錄退貨（會從庫存扣回）"
                      >
                        退貨
                      </button>
                    )}
                    <a
                      href={`/admin/purchase/${po.po_id}/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 border border-clay/30 text-clay rounded-lg text-xs hover:bg-clay/5 transition-colors"
                      title="開啟列印版採購單"
                    >
                      🖨 列印
                    </a>
                    <button
                      onClick={() =>
                        setExpandedPo(expandedPo === po.po_id ? null : po.po_id)
                      }
                      className="px-3 py-1.5 border border-border text-ink/60 rounded-lg text-xs hover:bg-gray-50 transition-colors"
                    >
                      {expandedPo === po.po_id ? '收起' : '查看明細'}
                    </button>
                  </div>
                </div>

                {expandedPo === po.po_id && po.items && po.items.length > 0 && (
                  <div className="px-5 py-3 bg-gray-50/50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-ink/40 text-left uppercase tracking-wide">
                          <th className="pb-1">食材</th>
                          <th className="pb-1 text-right">訂購量</th>
                          <th className="pb-1 text-right">成本</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.items.map(item => (
                          <tr key={item.ingredient_name} className="border-t border-gray-200">
                            <td className="py-1.5 text-ink">{item.ingredient_name}</td>
                            <td className="py-1.5 text-right font-mono">
                              {formatQty(item.order_qty)}
                            </td>
                            <td className="py-1.5 text-right font-mono text-clay">
                              NT$ {formatMoney(item.total_cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {expandedPo === po.po_id && (!po.items || po.items.length === 0) && (
                  <div className="px-5 py-3 bg-gray-50/50 text-xs text-ink/30">
                    （此單無明細）
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
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false)
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

// ============================================================
// 新增採購單 Modal
// ============================================================
interface DraftItem {
  ingredient_name: string
  order_qty: string
  total_cost: string
}

function CreatePOModal({
  suppliers,
  ingredients,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[]
  ingredients: Ingredient[]
  onClose: () => void
  onCreated: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [poDate, setPoDate] = useState(today)
  const [supplierName, setSupplierName] = useState('')
  const [status, setStatus] = useState<StatusType>('已訂購')
  const [items, setItems] = useState<DraftItem[]>([
    { ingredient_name: '', order_qty: '', total_cost: '' },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // 按供應商篩選食材（空 = 全部）；無供應商欄位的也顯示
  const ingredientOptions = useMemo(() => {
    if (!supplierName) return ingredients
    return ingredients.filter(
      ing => ing.supplier_name === supplierName || !ing.supplier_name
    )
  }, [ingredients, supplierName])

  const addRow = () => {
    setItems(prev => [...prev, { ingredient_name: '', order_qty: '', total_cost: '' }])
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
        total_cost: i.total_cost.trim() === '' ? 0 : parseFloat(i.total_cost),
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
      if (!Number.isFinite(it.total_cost) || it.total_cost < 0) {
        setErrMsg(`${it.ingredient_name} 的預估成本需為 >= 0`)
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
          status,
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
                <option value="">請選擇</option>
                {suppliers.map(s => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink/50 mb-1 block">狀態</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as StatusType)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-clay"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
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
                const selected = ingredients.find(i => i.name === item.ingredient_name)
                return (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={item.ingredient_name}
                      onChange={e => updateRow(idx, { ingredient_name: e.target.value })}
                      className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-clay"
                    >
                      <option value="">選擇食材</option>
                      {ingredientOptions.map(ing => (
                        <option key={ing.name} value={ing.name}>
                          {ing.name}
                          {ing.supplier_name ? ` (${ing.supplier_name})` : ''}
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
                          {selected.stock_unit}
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="預估成本"
                      value={item.total_cost}
                      onChange={e => updateRow(idx, { total_cost: e.target.value })}
                      className="w-28 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                    />
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
              訂購量以食材的 stock_unit 計；預估成本可留空，驗貨後再補。
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

// ============================================================
// 退貨 Modal
//   - 列出 PO 內所有食材
//   - 老闆勾要退的、填數量與原因
//   - 逐筆 POST /api/purchase-orders/:id/return（既有 API 維持不動）
//   - 庫存會自動扣回，不足時 API 會擋
// ============================================================
function ReturnModal({
  po,
  onClose,
  onDone,
}: {
  po: PurchaseOrder
  onClose: () => void
  onDone: () => void
}) {
  type Row = { ingredient_name: string; order_qty: number; checked: boolean; return_qty: string; reason: string }

  const [rows, setRows] = useState<Row[]>(() =>
    (po.items ?? []).map(it => ({
      ingredient_name: it.ingredient_name,
      order_qty: it.order_qty,
      checked: false,
      return_qty: '',
      reason: '',
    }))
  )
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const update = (idx: number, patch: Partial<Row>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const valid = rows
    .filter(r => r.checked)
    .map(r => ({ ...r, num: Number(r.return_qty) }))

  const canSubmit = valid.length > 0 && valid.every(r => Number.isFinite(r.num) && r.num > 0 && r.num <= r.order_qty)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setErrors([])
    const errs: string[] = []
    for (const r of valid) {
      try {
        const res = await fetch(`/api/purchase-orders/${po.po_id}/return`, {
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-ink text-lg flex items-center gap-2">
              <span className="text-red-500">↩</span>
              退貨登錄 — PO #{po.po_id}
            </h3>
            <p className="text-xs text-ink/50 mt-1">
              廠商：<span className="font-semibold text-ink">{po.supplier_name}</span> · 勾選要退的食材並填寫退回數量
            </p>
          </div>
          <button onClick={onClose} className="text-ink/40 hover:text-ink text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {rows.length === 0 ? (
            <p className="text-center text-ink/30 py-10">此採購單沒有明細</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink/50 text-xs uppercase tracking-wide border-b border-gray-200">
                  <th className="w-8 pb-2"></th>
                  <th className="text-left pb-2">食材</th>
                  <th className="text-right pb-2">叫貨量</th>
                  <th className="text-right pb-2 pl-2">退回量</th>
                  <th className="text-left pb-2 pl-3">原因</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const num = Number(r.return_qty)
                  const overQty = r.checked && Number.isFinite(num) && num > r.order_qty
                  return (
                    <tr key={r.ingredient_name} className="border-b border-gray-100">
                      <td className="py-3">
                        <input
                          type="checkbox"
                          checked={r.checked}
                          onChange={e => update(idx, { checked: e.target.checked })}
                          className="w-4 h-4 accent-red-500"
                        />
                      </td>
                      <td className="py-3 font-medium text-ink">{r.ingredient_name}</td>
                      <td className="py-3 text-right font-mono text-ink/60 text-xs">{r.order_qty}</td>
                      <td className="py-3 text-right pl-2">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max={r.order_qty}
                          disabled={!r.checked}
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
                          disabled={!r.checked}
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
          )}

          {errors.length > 0 && (
            <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-1">
              {errors.map((e, i) => (
                <p key={i}>· {e}</p>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] text-ink/40">
            送出後庫存會自動扣回對應數量；若庫存不足以退貨，API 會擋下並提示。
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
