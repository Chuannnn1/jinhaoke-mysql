'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface ImportValidItem {
  code: number
  qty: number
  spice: string
  item_name?: string
  unit_price?: number
  item_id?: number
  is_active?: number
}

interface ImportValidOrder {
  order_id: string
  status: string
  items: ImportValidItem[]
  total: number
  amount_csv: number
  phone: string
  note: string
}

interface ImportRowError {
  row: number
  reason: string
}

interface ImportMenuOption {
  item_id: number
  name: string
  price: number
  is_active?: number
}

interface ImportPreviewResponse {
  success: boolean
  preview?: boolean
  summary?: {
    orders: number
    items: number
    errors: number
    file?: string
    order_date?: string
  }
  valid?: ImportValidOrder[]
  errors?: ImportRowError[]
  unmapped_codes?: number[]
  menu_options?: ImportMenuOption[]
  imported?: number
  total_csv_orders?: number
  skipped_unmapped_codes?: number[]
  error?: string
}

const COLUMNS = [
  { key: '待製作', label: '待製作', color: 'bg-amber-50  border-amber-300',  header: 'bg-amber-100/70  text-amber-700',  badge: 'bg-amber-500 text-white' },
  { key: '製作中', label: '製作中', color: 'bg-blue-50   border-blue-300',   header: 'bg-blue-100/70   text-blue-700',   badge: 'bg-blue-500  text-white' },
  { key: '待付款', label: '待付款', color: 'bg-orange-50 border-orange-300', header: 'bg-orange-100/70 text-orange-700', badge: 'bg-orange-500 text-white' },
  { key: '已完成', label: '已完成', color: 'bg-green-50  border-green-300',  header: 'bg-green-100/70  text-green-700',  badge: 'bg-green-500 text-white' },
  { key: '已取消', label: '已取消', color: 'bg-red-50    border-red-300',    header: 'bg-red-100/70    text-red-700',    badge: 'bg-red-500   text-white' },
]

// API 英文 key ↔ DB 中文 status 對應
const keyToApi: Record<string, string> = {
  '待製作':  'pending',
  '製作中':  'preparing',
  '待付款':  'awaiting_payment',
  '已完成':  'done',
  '已取消':  'cancelled',
}

// 終態：已完成 / 已取消 的訂單不能再被拖回前面狀態
const TERMINAL_STATUSES = new Set(['已完成', '已取消', 'done', 'cancelled'])
const isTerminalStatus = (status: unknown): boolean =>
  typeof status === 'string' && TERMINAL_STATUSES.has(status)

export default function AdminOrderPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  // 匯入 Modal 狀態
  const [importOpen, setImportOpen] = useState(false)
  const [importPhase, setImportPhase] = useState<'idle' | 'previewing' | 'done'>('idle')
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [importedSkippedCodes, setImportedSkippedCodes] = useState<number[] | undefined>(undefined)
  // code -> item_id mapping（UI 下拉填入）
  const [importMapping, setImportMapping] = useState<Record<string, number>>({})
  // 哪個 order 是展開狀態（import preview 內用）
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set())
  // 哪張 kanban 訂單卡被點開（modal 用；null = 沒開）
  const [detailOrder, setDetailOrder] = useState<any | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)
  const importedFileRef = useRef<File | null>(null)

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

  // 拖曳放下去 -> 更新訂單狀態（targetStatus 是中文 key，如「待製作」）
  const handleDrop = useCallback(async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault()
    setDragOverCol(null)
    const orderId = e.dataTransfer.getData('text/plain')
    if (!orderId) return
    const order = orders.find((o: any) => o.order_id === orderId)
    if (!order) return

    // Defensive guard：已完成 / 已取消 的訂單為終態，拒絕任何拖曳變更
    if (isTerminalStatus(order.status)) return

    // 沒變動就不打 API
    if (order.status === targetStatus) return

    setOrders((prev: any[]) => prev.map(o =>
      o.order_id === orderId ? { ...o, status: targetStatus } : o
    ))

    const apiKey = keyToApi[targetStatus]
    if (!apiKey) return

    try {
      const res = await fetch('/api/orders/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: apiKey }),
      })
      const data = await res.json()
      if (!data.success) {
        alert(data.error || '更新失敗')
        fetchOrders()
      }
    } catch (err) {
      console.error('Failed to update order status:', err)
      fetchOrders()
    }
  }, [orders, fetchOrders])

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colKey)
  }

  const handleDragLeave = () => {
    setDragOverCol(null)
  }

  const handleDragStart = (e: React.DragEvent, orderId: string, status: string) => {
    // 終態（已完成 / 已取消）禁止拖曳
    if (isTerminalStatus(status)) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/plain', orderId)
    e.dataTransfer.effectAllowed = 'move'
  }

  // ============================================================
  // 匯入訂單流程
  // ============================================================
  const resetImport = () => {
      setImportPhase('idle')
      setImportPreview(null)
      setImportError(null)
      setImportLoading(false)
      setImportedCount(0)
      setImportedSkippedCodes(undefined)
      setImportMapping({})
      setExpandedOrderIds(new Set())
      importedFileRef.current = null
      if (importFileRef.current) importFileRef.current.value = ''
    }

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrderIds(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const openImport = () => {
    resetImport()
    setImportOpen(true)
  }

  const closeImport = () => {
    setImportOpen(false)
    resetImport()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    importedFileRef.current = file
    setImportError(null)
    setImportLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/orders/import', { method: 'POST', body: fd })
      const data: ImportPreviewResponse = await res.json()
      if (!data.success) {
        setImportError(data.error || '預覽失敗')
        setImportPhase('idle')
      } else {
        setImportPreview(data)
        setImportPhase('previewing')
      }
    } catch {
      setImportError('網路錯誤')
      setImportPhase('idle')
    } finally {
      setImportLoading(false)
    }
  }

  const handleConfirmImport = async () => {
    const file = importedFileRef.current
    if (!file) return
    setImportLoading(true)
    setImportError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('confirm', '1')
      fd.append('mapping', JSON.stringify(importMapping))
      const res = await fetch('/api/orders/import', { method: 'POST', body: fd })
      const data: ImportPreviewResponse = await res.json()
      if (!data.success) {
              setImportError(data.error || '匯入失敗')
            } else {
              setImportedCount(data.imported ?? 0)
              setImportedSkippedCodes(data.skipped_unmapped_codes)
              setImportPhase('done')
              fetchOrders()
              setTimeout(() => {
                closeImport()
              }, 2000)
            }
    } catch {
      setImportError('網路錯誤')
    } finally {
      setImportLoading(false)
    }
  }

  // 真正沒對應上的 code：以 API 端 unmapped_codes 為準（API 已做自動 1:1 + 套用 user mapping），
  // 再額外扣掉使用者剛在 UI 補的 mapping（即將在下一輪 preview/confirm 生效）。
  const computeUnmappedCodes = (): number[] => {
    if (!importPreview) return []
    const apiUnmapped = importPreview.unmapped_codes ?? []
    return apiUnmapped.filter(code => !importMapping[String(code)])
  }

  return (
    <>
      <header className="h-16 bg-white border-b border-border flex items-center justify-between px-8 shrink-0">
        <h2 className="text-ink font-body font-semibold text-sm tracking-wide">
          當日訂單
        </h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={openImport}
            className="text-[12px] px-3 py-1.5 rounded-md border border-border text-ink hover:bg-clay hover:text-white hover:border-clay transition-colors"
          >
            匯入訂單
          </button>
          <span className="text-[12px] text-ink/30 font-mono">
            每 10 秒自動更新
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-ink/30">載入中…</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-4 h-full">
              {COLUMNS.map(col => {
                const colOrders = orders.filter((o: any) =>
                  o.status === col.key
                )
                return (
                  <div
                    key={col.key}
                    onDragOver={e => handleDragOver(e, col.key)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, col.key)}
                    className={`flex flex-col rounded-2xl border-2 shadow-sm overflow-hidden transition-all duration-200 ${
                      dragOverCol === col.key
                        ? `${col.color} border-dashed border-clay shadow-md`
                        : `${col.color} border-solid`
                    }`}
                  >
                    {/* Column header */}
                    <div className={`flex items-center justify-between px-4 py-3 shrink-0 cursor-default ${col.header}`}>
                      <span className="text-sm font-semibold font-body tracking-wide">
                        {col.label}
                      </span>
                      <span className={`min-w-[1.5rem] h-6 px-1.5 rounded-full ${col.badge} text-[11px] font-bold flex items-center justify-center`}>
                        {colOrders.length}
                      </span>
                    </div>

                    {/* Orders */}
                    <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                      {colOrders.length === 0 ? (
                        <p className="text-center text-[12px] text-ink/20 py-8">
                          暫無訂單
                        </p>
                      ) : (
                        colOrders.map(order => {
                          const locked = isTerminalStatus(order.status)
                          return (
                            <div
                              key={order.order_id}
                              draggable={!locked}
                              onDragStart={e => handleDragStart(e, order.order_id, order.status)}
                              onClick={() => setDetailOrder(order)}
                              title={locked ? '此訂單已為終態，無法再變更狀態（點擊可看詳情）' : '拖曳變更狀態，點擊看詳情'}
                              className={`bg-white rounded-lg p-3 shadow-sm transition-all hover:shadow-md hover:ring-1 hover:ring-clay/40 ${
                                locked
                                  ? 'opacity-60 border border-dashed border-ink/10 cursor-pointer'
                                  : 'cursor-grab active:cursor-grabbing'
                              }`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <p className="font-mono text-[12px] font-semibold text-ink">
                                  #{order.order_id}
                                </p>
                                <p className="text-[11px] text-ink/30 font-mono">
                                  {order.created_at ? order.created_at.slice(11, 16) : ''}
                                </p>
                              </div>
                              <p className="text-[12px] text-ink/60 mb-1">
                                {order.items?.length ?? 0} 項 · <span className="font-mono text-clay font-semibold">NT$ {order.total ?? 0}</span>
                              </p>
                              {order.note && (
                                <p className="text-[11px] text-ink/30 italic truncate">
                                  {order.note}
                                </p>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      </main>

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-card-hover w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h3 className="text-ink font-body font-semibold text-sm">匯入訂單</h3>
              <button
                type="button"
                onClick={closeImport}
                className="text-ink/40 hover:text-ink text-lg leading-none"
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {importPhase === 'idle' && (
                <div className="space-y-4">
                  <p className="text-[13px] text-ink/70 leading-relaxed">
                    請上傳當日訂單 CSV，檔名為
                    <code className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded mx-1">
                      MMDD.csv
                    </code>
                    （如 0519.csv 對應 2026-05-19）。欄位順序：
                    <code className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded mx-1">
                      編號,金額,電話,付款狀態,品項,辣度
                    </code>
                  </p>
                  <ul className="text-[12px] text-ink/50 list-disc pl-5 space-y-0.5">
                    <li>品項以分號分隔 code，可加 *N 表數量（例：5;7*3）</li>
                    <li>code 直接對應菜單 item_id；已下架品項（如 6 號滷豬腳便當）仍會自動辨識並標記</li>
                    <li>付款狀態 0 = 待付款；1 = 已完成</li>
                    <li>電話接受 3~15 碼或 null</li>
                  </ul>
                  <div className="flex items-center gap-3">
                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      disabled={importLoading}
                      className="text-[12px] text-ink/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-white file:text-ink file:text-[12px] file:cursor-pointer file:hover:bg-clay file:hover:text-white file:hover:border-clay"
                    />
                    <a
                      href="/templates/orders-template.csv"
                      download
                      className="text-[12px] text-clay hover:underline"
                    >
                      下載模板
                    </a>
                  </div>
                  {importLoading && (
                    <p className="text-[12px] text-ink/40">解析中…</p>
                  )}
                  {importError && (
                    <p className="text-[12px] text-red-500">{importError}</p>
                  )}
                </div>
              )}

              {importPhase === 'previewing' && importPreview && (() => {
                const unmappedCodes = computeUnmappedCodes()
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 border border-border">
                        <p className="text-[11px] text-ink/40">檔案 / 日期</p>
                        <p className="font-mono text-[13px] text-ink font-semibold truncate">
                          {importPreview.summary?.file ?? '—'}
                        </p>
                        <p className="font-mono text-[11px] text-ink/50">
                          {importPreview.summary?.order_date ?? '—'}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-border">
                        <p className="text-[11px] text-ink/40">訂單數</p>
                        <p className="font-mono text-lg text-ink font-semibold">
                          {importPreview.summary?.orders ?? 0}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-border">
                        <p className="text-[11px] text-ink/40">項目數</p>
                        <p className="font-mono text-lg text-ink font-semibold">
                          {importPreview.summary?.items ?? 0}
                        </p>
                      </div>
                      <div className={`rounded-lg p-3 border ${
                        (importPreview.summary?.errors ?? 0) > 0
                          ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-border'
                      }`}>
                        <p className="text-[11px] text-ink/40">錯誤</p>
                        <p className={`font-mono text-lg font-semibold ${
                          (importPreview.summary?.errors ?? 0) > 0 ? 'text-red-500' : 'text-ink'
                        }`}>
                          {importPreview.summary?.errors ?? 0}
                        </p>
                      </div>
                    </div>

                    {unmappedCodes.length > 0 && (
                      <div className="selectable border border-amber-200 bg-amber-50/40 rounded-lg px-3 py-2">
                        <p className="text-[12px] text-amber-700">
                          已忽略 {unmappedCodes.length} 個未對應 code（{unmappedCodes.join(', ')}），這些品項不會匯入。
                        </p>
                      </div>
                    )}

                    {importPreview.errors && importPreview.errors.length > 0 && (
                      <div className="selectable">
                        <p className="text-[12px] text-ink/60 font-semibold mb-2">錯誤列表（可拖曳複製）</p>
                        <div className="border border-red-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                          <table className="w-full text-[12px]">
                            <thead className="bg-red-50 text-ink/70 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left w-16">列號</th>
                                <th className="px-3 py-2 text-left">原因</th>
                              </tr>
                            </thead>
                            <tbody>
                              {importPreview.errors.map((e, i) => (
                                <tr key={i} className="border-t border-red-100">
                                  <td className="px-3 py-2 font-mono">{e.row}</td>
                                  <td className="px-3 py-2 text-red-600">{e.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {importPreview.valid && importPreview.valid.length > 0 && (
                      <div>
                        <p className="text-[12px] text-ink/60 font-semibold mb-2">可匯入訂單</p>
                        <div className="border border-border rounded-lg overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead className="bg-gray-50 text-ink/70">
                              <tr>
                                <th className="px-3 py-2 text-left w-32">訂單編號</th>
                                <th className="px-3 py-2 text-left w-20">狀態</th>
                                <th className="px-3 py-2 text-left">摘要</th>
                                <th className="px-3 py-2 text-right w-24">計算總額</th>
                                <th className="px-3 py-2 text-right w-20">CSV金額</th>
                                <th className="px-3 py-2 text-left w-28">電話</th>
                                <th className="px-3 py-2 text-center w-12"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {importPreview.valid.map(o => {
                                const expanded = expandedOrderIds.has(o.order_id)
                                return (
                                  <>
                                    <tr key={o.order_id} className="border-t border-border">
                                      <td className="px-3 py-2 font-mono">{o.order_id}</td>
                                      <td className="px-3 py-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[11px] ${
                                          o.status === '已完成'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-orange-100 text-orange-700'
                                        }`}>{o.status}</span>
                                      </td>
                                      <td className="px-3 py-2 text-ink/70">
                                        {o.items.map((it, i) => (
                                          <span key={i}>
                                            {i > 0 && '、'}
                                            <span className={it.item_id === undefined ? 'text-amber-600' : ''}>
                                              {it.item_name ?? `?code${it.code}`}
                                            </span>
                                            {it.is_active === 0 && (
                                              <span className="ml-1 px-1 py-[1px] rounded text-[10px] bg-gray-200 text-gray-600 font-medium align-middle">
                                                已下架
                                              </span>
                                            )}
                                            <span className="text-ink/50">×{it.qty}</span>
                                          </span>
                                        ))}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-clay font-semibold">
                                        NT$ {o.total}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-ink/40">
                                        {o.amount_csv}
                                      </td>
                                      <td className="px-3 py-2 font-mono text-ink/60">
                                        {o.phone || '—'}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <button
                                          type="button"
                                          onClick={() => toggleOrderExpand(o.order_id)}
                                          className="text-ink/40 hover:text-ink text-[11px]"
                                          aria-label="展開明細"
                                        >
                                          {expanded ? '▲' : '▼'}
                                        </button>
                                      </td>
                                    </tr>
                                    {expanded && (
                                      <tr key={`${o.order_id}-detail`} className="border-t border-border bg-gray-50/60">
                                        <td colSpan={7} className="px-6 py-2">
                                          <table className="w-full text-[11px]">
                                            <thead className="text-ink/40">
                                              <tr>
                                                <th className="text-left py-1 w-16">code</th>
                                                <th className="text-left py-1">品名</th>
                                                <th className="text-right py-1 w-12">qty</th>
                                                <th className="text-right py-1 w-20">單價</th>
                                                <th className="text-left py-1 w-20">辣度</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {o.items.map((it, idx) => (
                                                <tr key={idx} className="border-t border-border/40">
                                                  <td className="py-1 font-mono">{it.code}</td>
                                                  <td className="py-1 text-ink/70">
                                                    {it.item_name ? (
                                                      <span>
                                                        {it.item_name}
                                                        {it.is_active === 0 && (
                                                          <span className="ml-1.5 px-1 py-[1px] rounded text-[10px] bg-gray-200 text-gray-600 font-medium align-middle">
                                                            已下架
                                                          </span>
                                                        )}
                                                      </span>
                                                    ) : (
                                                      <span className="text-amber-600">（未對應）</span>
                                                    )}
                                                  </td>
                                                  <td className="py-1 text-right font-mono">{it.qty}</td>
                                                  <td className="py-1 text-right font-mono text-ink/50">
                                                    {it.unit_price !== undefined ? `NT$ ${it.unit_price}` : '—'}
                                                  </td>
                                                  <td className="py-1 text-ink/50">{it.spice || '—'}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                          {o.note && (
                                            <p className="text-[11px] text-ink/40 italic mt-1">備註：{o.note}</p>
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[11px] text-ink/40 mt-2">
                          辣度資訊僅供預覽，不會寫入資料庫（schema 無 note 欄位）。
                        </p>
                      </div>
                    )}

                    {importError && (
                      <p className="text-[12px] text-red-500">{importError}</p>
                    )}
                  </div>
                )
              })()}

              {importPhase === 'done' && (
                              <div className="py-10 text-center">
                                <p className="text-ink font-semibold text-base">
                                  已匯入 {importedCount} 筆訂單
                                </p>
                                {importedSkippedCodes && importedSkippedCodes.length > 0 && (
                                  <p className="text-[12px] text-amber-600 mt-1">
                                    以下 code 因無對應餐點已被跳過：{importedSkippedCodes.join(', ')}
                                  </p>
                                )}
                                <p className="text-[12px] text-ink/40 mt-2">視窗即將關閉…</p>
                              </div>
                            )}
            </div>

            <div className="px-6 py-3 border-t border-border flex items-center justify-end gap-2 shrink-0">
              {importPhase === 'previewing' && (
                <>
                  <button
                    type="button"
                    onClick={resetImport}
                    disabled={importLoading}
                    className="text-[12px] px-3 py-1.5 rounded-md border border-border text-ink hover:bg-gray-50"
                  >
                    丟棄
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={
                                          importLoading ||
                                          (importPreview?.errors?.length ?? 0) > 0 ||
                                          (importPreview?.valid?.length ?? 0) === 0
                                        }
                    className="text-[12px] px-3 py-1.5 rounded-md bg-clay text-white hover:bg-clay-deep disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {importLoading ? '匯入中…' : '確認匯入'}
                  </button>
                </>
              )}
              {importPhase !== 'previewing' && (
                <button
                  type="button"
                  onClick={closeImport}
                  className="text-[12px] px-3 py-1.5 rounded-md border border-border text-ink hover:bg-gray-50"
                >
                  關閉
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 訂單詳情 modal — 點擊卡片開啟。整個面板套 .selectable 才能拖曳複製文字 */}
      {detailOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4"
          onClick={() => setDetailOrder(null)}
        >
          <div
            className="selectable bg-white rounded-2xl shadow-card-hover ring-1 ring-clay/15 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between px-6 py-4 bg-clay-soft border-b border-clay/20 shrink-0">
              <div className="flex items-center gap-3">
                <p className="font-mono text-sm font-semibold text-ink">#{detailOrder.order_id}</p>
                {(() => {
                  const col = COLUMNS.find(c => c.key === detailOrder.status)
                  return (
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${col?.badge ?? 'bg-gray-200 text-gray-700'}`}>
                      {detailOrder.status}
                    </span>
                  )
                })()}
              </div>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="text-ink/50 hover:text-ink text-lg leading-none px-2"
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-paper-warm">
              {/* meta row */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                <Meta label="建立時間" value={detailOrder.created_at?.replace('T', ' ').slice(0, 16) ?? '—'} />
                <Meta label="顧客" value={detailOrder.customer_name ?? '內用顧客'} />
                <Meta label="電話" value={detailOrder.customer_phone || '—'} />
                <Meta label="付款狀態" value={detailOrder.paid ? '已付款' : '未付款'} />
              </div>

              {/* items table */}
              <div>
                <p className="text-[11px] text-ink-mute uppercase tracking-wider mb-2">品項明細</p>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] text-ink-mute">
                      <th className="text-left pb-1.5 font-normal">品名</th>
                      <th className="text-right pb-1.5 w-20 font-normal">單價</th>
                      <th className="text-right pb-1.5 w-12 font-normal">數量</th>
                      <th className="text-right pb-1.5 w-20 font-normal">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailOrder.items ?? []).map((it: any, i: number) => {
                      const detail: Array<Array<{ id: string; label: string; price: number }>> = it.customizations_detail ?? []
                      const cAmount: number = it.customizations_amount ?? 0
                      // 把 N 份的 addon 攤平統計：[{label, count, totalPrice}]
                      const tally: Record<string, { label: string; count: number; price: number }> = {}
                      for (const unit of detail) {
                        for (const a of unit) {
                          const k = a.label
                          if (!tally[k]) tally[k] = { label: k, count: 0, price: a.price }
                          tally[k].count++
                        }
                      }
                      const chips = Object.values(tally)
                      return (
                        <tr key={i} className="border-t border-gray-200 align-top">
                          <td className="py-2 text-ink/85">
                            {it.name ?? it.item_name ?? `?code${it.code}`}
                            {it.spice && it.spice !== '無' && (
                              <span className="ml-2 text-[11px] text-clay">辣度 {it.spice}</span>
                            )}
                            {chips.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {chips.map(c => (
                                  <span
                                    key={c.label}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-clay-soft text-clay-deep border border-clay/20 font-mono"
                                  >
                                    {c.label} ×{c.count} <span className="text-ink-mute">+{c.count * c.price}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2 text-right font-mono text-ink/60">
                            {it.unit_price !== undefined ? `NT$ ${it.unit_price}` : '—'}
                          </td>
                          <td className="py-2 text-right font-mono">{it.quantity ?? it.qty ?? 1}</td>
                          <td className="py-2 text-right font-mono text-ink">
                            {it.subtotal !== undefined
                              ? `NT$ ${it.subtotal}`
                              : (it.unit_price !== undefined && it.qty !== undefined)
                                ? `NT$ ${it.unit_price * it.qty + cAmount}`
                                : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* note */}
              {detailOrder.note && (
                <div>
                  <p className="text-[11px] text-ink-mute uppercase tracking-wider mb-1">備註</p>
                  <p className="text-[13px] text-ink/75 leading-relaxed bg-cream rounded-lg px-3 py-2 border border-border-soft">
                    {detailOrder.note}
                  </p>
                </div>
              )}
            </div>

            {/* footer total */}
            <div className="px-6 py-4 bg-white border-t border-border flex items-center justify-between shrink-0">
              <span className="text-[12px] text-ink-mute">總計</span>
              <span className="font-mono text-clay font-bold text-lg">NT$ {detailOrder.total ?? 0}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-ink-mute text-[11px] uppercase tracking-wider">{label}</span>
      <span className="text-ink/85 font-mono text-[12px]">{value}</span>
    </div>
  )
}