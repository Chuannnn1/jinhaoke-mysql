'use client'
import { useState, useEffect } from 'react'

interface DailyReport {
  date: string
  orders_count: number
  total_revenue: number
  top_items: Array<{ name: string; qty: number; revenue: number }>
}

interface MonthlyReport {
  year: number
  month: number
  orders_count: number
  total_revenue: number
  avg_per_order: number
}

interface InventoryItem {
  name: string
  stock_qty: number
  safety_stock: number
  stock_unit: string
}

interface RecentOrder {
  order_id: string
  customer_name: string
  status: string
  created_at: string
  total: number
}

const statusColors: Record<string, string> = {
  '待製作':    'bg-amber-100 text-amber-700',
  '製作中':    'bg-blue-100 text-blue-700',
  '待付款':    'bg-orange-100 text-orange-700',
  '已完成':    'bg-green-100 text-green-700',
  '已取消':   'bg-red-100 text-red-700',
}

function formatDate(iso: string) {
  return iso ? iso.slice(0, 10) : '—'
}

function formatMoney(n: number) {
  return n.toLocaleString('zh-TW')
}

export default function DashboardPage() {
  const [daily, setDaily] = useState<DailyReport | null>(null)
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const year = new Date().getFullYear()
    const month = new Date().getMonth() + 1

    Promise.all([
      fetch(`/api/reports/daily?date=${today}`).then(r => r.json()),
      fetch(`/api/reports/monthly?year=${year}&month=${month}`).then(r => r.json()),
      fetch('/api/inventory').then(r => r.json()),
      fetch('/api/orders').then(r => r.json()),
    ]).then(([dailyData, monthlyData, invData, ordersData]) => {
      if (dailyData.success) setDaily(dailyData.data)
      if (monthlyData.success) setMonthly(monthlyData.data)
      if (invData.success) setInventory(invData.data)
      if (ordersData.success) setRecentOrders(ordersData.data.slice(0, 8))
      if (!dailyData.success && !monthlyData.success) setError('讀取失敗')
    }).catch(() => setError('網路錯誤'))
    .finally(() => setLoading(false))
  }, [])

  const lowStockItems = inventory.filter(i =>
    i.safety_stock > 0 && i.stock_qty <= i.safety_stock
  ).slice(0, 6)

  return (
    <>
      <header className="h-16 bg-white border-b border-border flex items-center px-8 shrink-0">
        <h2 className="text-ink font-body font-semibold text-sm tracking-wide">
          概覽
        </h2>
      </header>

      <main className="flex-1 overflow-auto p-6 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-ink/30">載入中…</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-red-500">{error}</p>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-6">

              {/* ── 今日營收 ── */}
              <div className="col-span-3">
                <div className="bg-white rounded-xl shadow-sm p-5 h-full">
                  <p className="text-xs text-ink/40 uppercase tracking-wide mb-3">今日營收</p>
                  <p className="text-3xl font-bold text-ink font-mono">
                    NT$ {formatMoney(daily?.total_revenue ?? 0)}
                  </p>
                  <p className="text-sm text-ink/40 mt-1">
                    {daily?.orders_count ?? 0} 筆訂單
                  </p>
                </div>
              </div>

              {/* ── 當月營收 ── */}
              <div className="col-span-3">
                <div className="bg-white rounded-xl shadow-sm p-5 h-full">
                  <p className="text-xs text-ink/40 uppercase tracking-wide mb-3">當月營收</p>
                  <p className="text-3xl font-bold text-ink font-mono">
                    NT$ {formatMoney(monthly?.total_revenue ?? 0)}
                  </p>
                  <p className="text-sm text-ink/40 mt-1">
                    均單 NT$ {formatMoney(monthly?.avg_per_order ?? 0)}
                  </p>
                </div>
              </div>

              {/* ── 庫存警示 ── */}
              <div className="col-span-3">
                <div className="bg-white rounded-xl shadow-sm p-5 h-full">
                  <p className="text-xs text-red-600 uppercase tracking-wide mb-3">庫存警示</p>
                  <p className="text-3xl font-bold text-red-600">{lowStockItems.length}</p>
                  <p className="text-sm text-ink/40 mt-1">項食材低於安全存量</p>
                </div>
              </div>

              {/* ── 待處理訂單 ── */}
              <div className="col-span-3">
                <div className="bg-white rounded-xl shadow-sm p-5 h-full">
                  <p className="text-xs text-amber-600 uppercase tracking-wide mb-3">待製作</p>
                  <p className="text-3xl font-bold text-ink">
                    {recentOrders.filter(o => ['待製作','製作中'].includes(o.status)).length}
                  </p>
                  <p className="text-sm text-ink/40 mt-1">筆訂單待處理</p>
                </div>
              </div>

              {/* ── 今日暢銷品項 ── */}
              <div className="col-span-6">
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <p className="text-xs text-ink/40 uppercase tracking-wide mb-4">今日暢銷</p>
                  {daily?.top_items && daily.top_items.length > 0 ? (
                    <div className="space-y-2">
                      {daily.top_items.map((item, i) => (
                        <div key={item.name} className="flex items-center gap-3">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            i === 0 ? 'bg-clay text-white' :
                            i === 1 ? 'bg-gray-400 text-white' :
                            i === 2 ? 'bg-amber-300 text-white' :
                            'bg-clay-soft text-ink/40'
                          }`}>
                            {i + 1}
                          </span>
                          <span className="flex-1 text-sm text-ink">{item.name}</span>
                          <span className="text-xs text-ink/40 font-mono">{item.qty} 份</span>
                          <span className="text-xs text-clay font-mono">NT$ {formatMoney(item.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-ink/30 text-sm">今日尚無資料</p>
                  )}
                </div>
              </div>

              {/* ── 庫存警示 detail ── */}
              <div className="col-span-6">
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <p className="text-xs text-red-600 uppercase tracking-wide mb-4">低庫存食材</p>
                  {lowStockItems.length > 0 ? (
                    <div className="space-y-2">
                      {lowStockItems.map(item => {
                        const pct = Math.round((item.stock_qty / item.safety_stock) * 100)
                        const isCritical = pct <= 50
                        return (
                          <div key={item.name} className="flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isCritical ? 'bg-red-500' : 'bg-yellow-400'}`} />
                            <span className="flex-1 text-sm text-ink">{item.name}</span>
                            <span className="text-xs text-ink/50 font-mono">
                              {item.stock_qty} / {item.safety_stock} {item.stock_unit}
                            </span>
                          </div>
                        )
                      })}
                      <a href="/admin/inventory" className="inline-block mt-2 text-xs text-clay hover:underline">
                        查看庫存頁面 →
                      </a>
                    </div>
                  ) : (
                    <p className="text-green-600 text-sm">✓ 所有食材庫存充足</p>
                  )}
                </div>
              </div>

              {/* ── 最近訂單 ── */}
              <div className="col-span-12">
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <p className="text-xs text-ink/40 uppercase tracking-wide mb-4">最近訂單</p>
                  {recentOrders.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-ink/40 text-left text-xs uppercase">
                            <th className="pb-2 pr-4">單號</th>
                            <th className="pb-2 pr-4">顧客</th>
                            <th className="pb-2 pr-4">日期</th>
                            <th className="pb-2 pr-4">金額</th>
                            <th className="pb-2">狀態</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentOrders.map(order => (
                            <tr key={order.order_id} className="border-t border-gray-200">
                              <td className="py-2 pr-4 font-mono text-xs text-ink">{order.order_id}</td>
                              <td className="py-2 pr-4 text-ink/70">{order.customer_name}</td>
                              <td className="py-2 pr-4 text-ink/40 text-xs">{formatDate(order.created_at)}</td>
                              <td className="py-2 pr-4 font-mono text-clay">NT$ {formatMoney(order.total)}</td>
                              <td className="py-2">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[order.status] ?? 'bg-gray-100'}`}>
                                  {order.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-ink/30 text-sm">尚無訂單</p>
                  )}
                </div>
              </div>

            </div>
          )}
      </main>
    </>
  )
}