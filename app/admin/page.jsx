'use client'
import { useState, useEffect, useCallback } from 'react'

const COLUMNS = [
  { key: 'pending',   label: '待付款',  color: 'bg-gold-100 border-gold-300',  badge: 'bg-gold-400 text-white' },
  { key: 'preparing', label: '製作中',  color: 'bg-blue-100 border-blue-300',  badge: 'bg-blue-500 text-white' },
  { key: 'done',      label: '已完成',  color: 'bg-green-100 border-green-300', badge: 'bg-success text-white' },
]

export default function AdminOrderPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [dragOverCol, setDragOverCol] = useState(null)

  // 初次載入從 API 撈訂單
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders')
      const data = await res.json()
      if (data.success) {
        setOrders(data.data)
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
    // 每 10 秒自動更新
    const interval = setInterval(fetchOrders, 10000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  const updateOrderStatus = useCallback(async (orderId, newStatus) => {
    // 先樂觀更新 UI
    setOrders(prev => prev.map(o =>
      o.order_id === orderId ? { ...o, status: newStatus } : o
    ))
    // 呼叫 API
    try {
      await fetch('/api/orders/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: newStatus }),
      })
    } catch (err) {
      console.error('Failed to update order status:', err)
      // 失敗時重新撈資料復原
      fetchOrders()
    }
  }, [fetchOrders])

  const handleDragStart = (e, orderId) => {
    e.dataTransfer.setData('text/plain', orderId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, colKey) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colKey)
  }

  const handleDragLeave = () => {
    setDragOverCol(null)
  }

  const handleDrop = (e, targetStatus) => {
    e.preventDefault()
    setDragOverCol(null)
    const orderId = e.dataTransfer.getData('text/plain')
    updateOrderStatus(orderId, targetStatus)
  }

  return (
    <div className="flex h-screen overflow-hidden">

      {/* Sidebar */}
      <aside className="w-[220px] bg-charcoal-900 flex flex-col shrink-0">
        <div className="px-6 py-6 border-b border-white/5">
          <h1 className="text-gold-400 font-display text-xl font-semibold tracking-wide">
            金濠客食堂
          </h1>
          <p className="text-charcoal-700 text-[11px] mt-1 tracking-wider uppercase font-body">
            Jinhaoke
          </p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {['點餐', '訂單', '庫存', '報表', '設定'].map(label => (
            <button
              key={label}
              className={`w-full text-left px-4 py-2.5 rounded-md text-sm transition-all duration-200 border-l-[3px] ${
                label === '訂單'
                  ? 'text-gold-400 border-l-gold-400 bg-gold-400/10'
                  : label === '點餐'
                  ? 'hidden'
                  : 'text-white/65 border-l-transparent hover:text-white/90 hover:bg-charcoal-800'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col bg-gold-50 overflow-hidden">

        {/* Top Bar */}
        <header className="h-16 bg-cream border-b border-gold-200 flex items-center justify-between px-8 shrink-0">
          <h2 className="text-charcoal-900 font-body font-semibold text-sm tracking-wide">
            訂單看板
          </h2>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[13px] text-charcoal-900/40">
              今日訂單 · {new Date().toLocaleDateString('zh-TW')}
            </span>
            <span className="text-[13px] text-charcoal-900/50">
              共 {orders.length} 筆
            </span>
          </div>
        </header>

        {/* Kanban Board */}
        <main className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full text-charcoal-900/30">
              <p className="text-sm">載入中…</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 h-full min-h-0">

              {COLUMNS.map(col => {
                const colOrders = orders.filter(o => o.status === col.key)
                return (
                  <div
                    key={col.key}
                    onDragOver={(e) => handleDragOver(e, col.key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, col.key)}
                    className={`flex flex-col rounded-lg border-2 transition-all duration-200 min-h-0 ${
                      col.color
                    } ${
                      dragOverCol === col.key
                        ? 'border-gold-400 shadow-elevated scale-[1.01]'
                        : 'border-transparent'
                    }`}
                  >
                    {/* Column Header */}
                    <div className="px-4 py-3 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-body font-semibold text-charcoal-900">
                          {col.label}
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${col.badge}`}>
                          {colOrders.length}
                        </span>
                      </div>
                    </div>

                    {/* Column Cards */}
                    <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-0">
                      {colOrders.map(order => (
                        <div
                          key={order.order_id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, order.order_id)}
                          className="card p-3 cursor-grab active:cursor-grabbing hover:shadow-elevated transition-all duration-200 active:opacity-80 active:scale-[0.97]"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-[10px] text-charcoal-900/40">
                              #{order.order_id}
                            </span>
                            <span className="text-[10px] text-charcoal-900/50 font-medium">
                              {order.customer_name}
                            </span>
                          </div>

                          <div className="mb-2 space-y-0.5">
                            {order.items?.map((item, i) => (
                              <p key={i} className="text-[12px] text-charcoal-900/70 leading-tight">
                                {item.name} x{item.quantity}
                              </p>
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-gold-100">
                            <span className="font-mono text-[13px] font-bold text-gold-500">
                              NT$ {order.total}
                            </span>
                            <div className="flex items-center gap-2">
                              {order.note && (
                                <span className="text-[10px] text-charcoal-900/30">📝 {order.note}</span>
                              )}
                              <span className="font-mono text-[10px] text-charcoal-900/25">
                                {order.created_at?.slice(11, 16)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {colOrders.length === 0 && (
                        <div className="text-center py-10 text-charcoal-900/15">
                          <p className="text-3xl mb-1">📭</p>
                          <p className="text-[11px]">尚無訂單</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

            </div>
          )}
        </main>
      </div>
    </div>
  )
}