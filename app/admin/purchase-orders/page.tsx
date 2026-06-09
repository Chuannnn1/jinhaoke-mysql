'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'

interface PurchaseOrder {
  po_id: number
  po_date: string
  supplier_name: string
  total_amount: number
  status: string
  items?: Array<{ ingredient_name: string; order_qty: number; total_cost: number }>
}

interface Supplier {
  name: string
}

interface Ingredient {
  name: string
  stock_unit: string
  supplier_name: string | null
}

const STATUS_COLORS: Record<string, string> = {
  '已訂購':  'bg-blue-100 text-blue-700',
  '已驗貨':  'bg-green-100 text-green-700',
  '部分退貨': 'bg-orange-100 text-orange-700',
}

function formatMoney(n: number) {
  return n.toLocaleString('zh-TW')
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'list' | 'create'>('list')
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null)

  // 新建進貨單表單
  const [newSupplier, setNewSupplier] = useState('')
  const [newItems, setNewItems] = useState<Array<{ ingredient_name: string; order_qty: string; total_cost: string }>>([
    { ingredient_name: '', order_qty: '', total_cost: '' }
  ])
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/purchase-orders')
      const data = await res.json()
      if (data.success) setOrders(data.data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
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
      const res = await fetch('/api/inventory')
      const data = await res.json()
      if (data.success) {
        setIngredients(
          (data.data as Ingredient[]).map(i => ({
            name: i.name,
            stock_unit: i.stock_unit,
            supplier_name: i.supplier_name,
          }))
        )
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchOrders()
    fetchSuppliers()
    fetchIngredients()
  }, [fetchOrders, fetchSuppliers, fetchIngredients])

  // 依供應商過濾食材；未選供應商則顯示全部
  const ingredientOptions = useMemo(() => {
    if (!newSupplier) return ingredients
    return ingredients.filter(
      ing => ing.supplier_name === newSupplier || !ing.supplier_name
    )
  }, [ingredients, newSupplier])

  const addItemRow = () => {
    setNewItems(prev => [...prev, { ingredient_name: '', order_qty: '', total_cost: '' }])
  }

  const updateItem = (idx: number, field: string, value: string) => {
    setNewItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const removeItem = (idx: number) => {
    setNewItems(prev => prev.filter((_, i) => i !== idx))
  }

  const handleCreate = async () => {
    if (!newSupplier.trim()) { setSubmitMsg({ type: 'error', text: '請選擇供應商' }); return }
    const validItems = newItems.filter(i => i.ingredient_name.trim() && i.order_qty)
    if (validItems.length === 0) { setSubmitMsg({ type: 'error', text: '請至少填寫一項食材' }); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: newSupplier.trim(),
          items: validItems.map(i => ({
            ingredient_name: i.ingredient_name.trim(),
            order_qty: parseFloat(i.order_qty),
            total_cost: parseFloat(i.total_cost) || 0,
          })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSubmitMsg({ type: 'success', text: `進貨單 #${data.data.po_id} 已建立` })
        setNewItems([{ ingredient_name: '', order_qty: '', total_cost: '' }])
        setNewSupplier('')
        fetchOrders()
        setTimeout(() => setTab('list'), 1200)
      } else {
        setSubmitMsg({ type: 'error', text: data.error })
      }
    } catch {
      setSubmitMsg({ type: 'error', text: '網路錯誤' })
    }
    finally { setSubmitting(false) }
  }

  const handleReceive = async (poId: number) => {
    const po = orders.find(o => o.po_id === poId)
    if (!po) return
    // 預設：全部按 order_qty 收貨
    const received_items = po.items!.map(i => ({
      ingredient_name: i.ingredient_name,
      received_qty: i.order_qty,
    }))
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received_items }),
      })
      const data = await res.json()
      if (data.success) {
        alert('驗貨完成，已入庫')
        fetchOrders()
      } else {
        alert(data.error || '驗貨失敗')
      }
    } catch {
      alert('網路錯誤')
    }
  }

  return (
    <>
      <header className="h-16 bg-white border-b border-border flex items-center justify-between px-8 shrink-0">
          <h2 className="text-ink font-body font-semibold text-sm tracking-wide">
            採購管理
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === 'list' ? 'bg-gray-500 text-white' : 'bg-white text-ink/50 border border-border'
              }`}
            >
              進貨單列表
            </button>
            <button
              onClick={() => setTab('create')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === 'create' ? 'bg-gray-500 text-white' : 'bg-white text-ink/50 border border-border'
              }`}
            >
              + 新建進貨單
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-gray-50">
          <div className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between">
            <span>此為舊版採購頁，已有新版採購管理（庫存連動 / 改進的下拉）。</span>
            <a href="/admin/purchase" className="font-semibold text-amber-900 hover:underline">前往新版 →</a>
          </div>
          {tab === 'list' ? (
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-ink/30">載入中…</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-16 text-ink/30">
                  尚無進貨單，<a href="/admin/dashboard" className="text-clay hover:underline">至儀表板查看庫存警示</a>
                </div>
              ) : (
                orders.map(po => (
                  <div key={po.po_id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-xs text-ink/40 uppercase tracking-wide">#{po.po_id}</p>
                          <p className="text-sm font-semibold text-ink">{po.supplier_name}</p>
                        </div>
                        <div className="text-xs text-ink/40">{po.po_date}</div>
                        <div className="text-sm font-mono text-clay">
                          NT$ {formatMoney(po.total_amount)}
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[po.status] ?? 'bg-gray-100'}`}>
                          {po.status}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {po.status === '已訂購' && (
                          <button
                            onClick={() => handleReceive(po.po_id)}
                            className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition-colors"
                          >
                            驗貨入庫
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedPo(selectedPo?.po_id === po.po_id ? null : po)}
                          className="px-3 py-1.5 border border-border text-ink/60 rounded-lg text-xs hover:bg-gray-50 transition-colors"
                        >
                          {selectedPo?.po_id === po.po_id ? '收起' : '查看明細'}
                        </button>
                      </div>
                    </div>

                    {selectedPo?.po_id === po.po_id && po.items && po.items.length > 0 && (
                      <div className="px-5 py-3 bg-gray-50/50">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-ink/40 text-left uppercase tracking-wide">
                              <th className="pb-1">食材</th>
                              <th className="pb-1 text-right">叫貨數量</th>
                              <th className="pb-1 text-right">成本</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.items.map(item => (
                              <tr key={item.ingredient_name} className="border-t border-gray-200">
                                <td className="py-1.5 text-ink">{item.ingredient_name}</td>
                                <td className="py-1.5 text-right font-mono">{item.order_qty}</td>
                                <td className="py-1.5 text-right font-mono text-clay">NT$ {formatMoney(item.total_cost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            /* ── 新建進貨單表單 ── */
            <div className="max-w-2xl">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-sm font-semibold text-ink mb-5">新建進貨單</h3>

                <div className="mb-5">
                  <label className="block text-xs text-ink/50 uppercase tracking-wide mb-1">供應商</label>
                  <select
                    value={newSupplier}
                    onChange={e => setNewSupplier(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay bg-white"
                  >
                    <option value="">請選擇供應商</option>
                    {suppliers.map(s => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs text-ink/50 uppercase tracking-wide">進貨品項</label>
                    <button
                      onClick={addItemRow}
                      className="text-xs text-clay hover:underline"
                    >
                      + 新增品項
                    </button>
                  </div>
                  <div className="space-y-2">
                    {newItems.map((item, idx) => {
                      const selected = ingredients.find(i => i.name === item.ingredient_name)
                      return (
                        <div key={idx} className="flex gap-2 items-center">
                          <select
                            value={item.ingredient_name}
                            onChange={e => updateItem(idx, 'ingredient_name', e.target.value)}
                            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay bg-white"
                          >
                            <option value="">請選擇食材</option>
                            {ingredientOptions.map(ing => (
                              <option key={ing.name} value={ing.name}>
                                {ing.name} ({ing.stock_unit})
                                {ing.supplier_name ? ` - ${ing.supplier_name}` : ''}
                              </option>
                            ))}
                          </select>
                          <div className="relative w-24">
                            <input
                              type="number"
                              placeholder="數量"
                              value={item.order_qty}
                              onChange={e => updateItem(idx, 'order_qty', e.target.value)}
                              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                            />
                            {selected && (
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink/40">
                                {selected.stock_unit}
                              </span>
                            )}
                          </div>
                          <input
                            type="number"
                            placeholder="成本"
                            value={item.total_cost}
                            onChange={e => updateItem(idx, 'total_cost', e.target.value)}
                            className="w-28 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                          />
                          {newItems.length > 1 && (
                            <button
                              onClick={() => removeItem(idx)}
                              className="text-ink/30 hover:text-red-500 transition-colors"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {submitMsg && (
                  <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${submitMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {submitMsg.text}
                  </div>
                )}

                <button
                  onClick={handleCreate}
                  disabled={submitting}
                  className="w-full py-2.5 bg-gray-500 text-white rounded-lg text-sm font-semibold hover:bg-clay-deep transition-colors disabled:opacity-50"
                >
                  {submitting ? '建立中…' : '建立進貨單'}
                </button>
              </div>
            </div>
          )}
      </main>
    </>
  )
}