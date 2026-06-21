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

// 多檔案匯入：每個檔案的本地 state（preview 解析結果 + 匯入後狀態）
interface FilePreview {
  file: File
  filename: string                                                // basename
  // preview 階段
  previewStatus: 'previewing' | 'preview_ok' | 'preview_failed'
  preview?: ImportPreviewResponse
  previewError?: string
  // 確認匯入後階段
  importStatus?: 'idle' | 'importing' | 'imported' | 'import_failed'
  imported?: number
  importedSkippedCodes?: number[]
  importError?: string
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
  // 多檔案匯入：每個檔案各自獨立 preview / import 狀態，
  // 但共用同一份 importMapping（code → item_id 全域對應）。
  const [importOpen, setImportOpen] = useState(false)
  const [importPhase, setImportPhase] = useState<'idle' | 'previewing' | 'done'>('idle')
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  // code -> item_id mapping（UI 下拉填入；所有檔案共用）
  const [importMapping, setImportMapping] = useState<Record<string, number>>({})
  // 哪個檔案 / 哪個 order 是展開狀態
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set())
  // 哪張 kanban 訂單卡被點開（modal 用；null = 沒開）
  const [detailOrder, setDetailOrder] = useState<any | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)
  // 拖卡 in-flight 樂觀狀態：order_id → 目標 status。
  // fetchOrders 看見有 in-flight 就用樂觀值覆蓋 server 值，避免 race。
  const pendingDragRef = useRef<Map<string, string>>(new Map())

  // 初次載入從 API 撈訂單
  //
  // 若 server 訂單仍是舊狀態、但前端有 in-flight 樂觀更新（PATCH 還沒回），
  // 用樂觀狀態蓋上去，避免拖卡尚未送達就被 auto-refresh 蓋掉。
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders')
      const data = await res.json()
      if (data.success) {
        const pending = pendingDragRef.current
        const merged = pending.size === 0
          ? data.data
          : data.data.map((o: any) => {
              const optimistic = pending.get(o.order_id)
              return optimistic ? { ...o, status: optimistic } : o
            })
        setOrders(merged)
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
  //
  // 同時做樂觀更新 + 標記 in-flight，避免 10 秒 auto-refresh 在 PATCH
  // 尚未完成時把樂觀狀態蓋掉（這是之前「挪卡後狀態沒生效」的根因）。
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

    // 樂觀更新 + 標記 in-flight
    pendingDragRef.current.set(orderId, targetStatus)
    setOrders((prev: any[]) => prev.map(o =>
      o.order_id === orderId ? { ...o, status: targetStatus } : o
    ))

    const apiKey = keyToApi[targetStatus]
    if (!apiKey) {
      pendingDragRef.current.delete(orderId)
      return
    }

    try {
      const res = await fetch('/api/orders/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: apiKey }),
      })
      const data = await res.json().catch(() => ({ success: false, error: 'JSON 解析失敗' }))
      if (!res.ok || !data.success) {
        // 401 / 500 / 業務錯誤都走這條：放掉 in-flight 標記再 fetch 回正
        pendingDragRef.current.delete(orderId)
        const msg = res.status === 401
          ? '登入狀態失效，請重新登入後再試'
          : (data.error || `更新失敗（HTTP ${res.status}）`)
        alert(msg)
        fetchOrders()
        return
      }
      // 成功：等下次 auto-refresh 就會帶回真實狀態，所以可以放掉標記了
      pendingDragRef.current.delete(orderId)
    } catch (err) {
      pendingDragRef.current.delete(orderId)
      console.error('Failed to update order status:', err)
      alert('連線錯誤，狀態未更新')
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
    setFilePreviews([])
    setImportError(null)
    setImportLoading(false)
    setImportProgress(null)
    setImportMapping({})
    setExpandedFiles(new Set())
    setExpandedOrderIds(new Set())
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

  const toggleFileExpand = (filename: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
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

  // 多檔上傳：一次 preview N 個檔案（檔案間獨立執行，並行 fetch）
  // 共用 importMapping；任一檔案 unmapped 都會在彙總提示。
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setImportError(null)
    setImportLoading(true)

    // 初始化所有檔案為 previewing
    const initial: FilePreview[] = files.map(f => ({
      file: f,
      filename: f.name,
      previewStatus: 'previewing',
    }))
    setFilePreviews(initial)
    setImportPhase('previewing')

    // 並行 preview，回來才更新對應的 FilePreview
    await Promise.all(files.map(async (file) => {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/orders/import', { method: 'POST', body: fd })
        const data: ImportPreviewResponse = await res.json().catch(() => ({ success: false, error: '回應解析失敗' }))
        setFilePreviews(prev => prev.map(fp => fp.filename === file.name
          ? data.success
            ? { ...fp, previewStatus: 'preview_ok', preview: data }
            : { ...fp, previewStatus: 'preview_failed', previewError: data.error || '預覽失敗' }
          : fp
        ))
      } catch {
        setFilePreviews(prev => prev.map(fp => fp.filename === file.name
          ? { ...fp, previewStatus: 'preview_failed', previewError: '網路錯誤' }
          : fp
        ))
      }
    }))
    setImportLoading(false)
  }

  // 確認匯入：序列跑每個 preview_ok 的檔案，個別檔案失敗不影響其它檔案。
  const handleConfirmImport = async () => {
    const candidates = filePreviews.filter(fp =>
      fp.previewStatus === 'preview_ok' &&
      (fp.preview?.errors?.length ?? 0) === 0 &&
      (fp.preview?.valid?.length ?? 0) > 0 &&
      fp.importStatus !== 'imported'
    )
    if (candidates.length === 0) return
    setImportLoading(true)
    setImportError(null)
    setImportProgress({ done: 0, total: candidates.length })

    let done = 0
    for (const fp of candidates) {
      setFilePreviews(prev => prev.map(x => x.filename === fp.filename ? { ...x, importStatus: 'importing' } : x))
      try {
        const fd = new FormData()
        fd.append('file', fp.file)
        fd.append('confirm', '1')
        fd.append('mapping', JSON.stringify(importMapping))
        const res = await fetch('/api/orders/import', { method: 'POST', body: fd })
        const data: ImportPreviewResponse = await res.json().catch(() => ({ success: false, error: '回應解析失敗' }))
        setFilePreviews(prev => prev.map(x => x.filename === fp.filename
          ? data.success
            ? { ...x, importStatus: 'imported', imported: data.imported ?? 0, importedSkippedCodes: data.skipped_unmapped_codes }
            : { ...x, importStatus: 'import_failed', importError: data.error || '匯入失敗' }
          : x
        ))
      } catch {
        setFilePreviews(prev => prev.map(x => x.filename === fp.filename
          ? { ...x, importStatus: 'import_failed', importError: '網路錯誤' }
          : x
        ))
      }
      done++
      setImportProgress({ done, total: candidates.length })
    }
    setImportLoading(false)
    setImportPhase('done')
    fetchOrders()
  }

  // 跨檔聚合所有 preview 抓到的 unmapped code
  const computeUnmappedCodes = (): number[] => {
    const all = new Set<number>()
    for (const fp of filePreviews) {
      for (const c of fp.preview?.unmapped_codes ?? []) {
        if (!importMapping[String(c)]) all.add(c)
      }
    }
    return Array.from(all).sort((a, b) => a - b)
  }

  // 跨檔聚合 menu_options（任一檔有就拿，去重）
  const aggregatedMenuOptions = (): ImportMenuOption[] => {
    const map = new Map<number, ImportMenuOption>()
    for (const fp of filePreviews) {
      for (const opt of fp.preview?.menu_options ?? []) {
        if (!map.has(opt.item_id)) map.set(opt.item_id, opt)
      }
    }
    return Array.from(map.values()).sort((a, b) => a.item_id - b.item_id)
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
                    請上傳當日訂單的
                    <code className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded mx-1">.csv</code>
                    檔案（可一次選多檔，每個檔案對應一個日期）。檔名格式為
                    <code className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded mx-1">
                      月日.csv
                    </code>
                    ，例如 0519.csv 對應 2026-05-19。欄位順序：
                    <code className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded mx-1">
                      編號、金額、電話、付款狀態、品項、辣度
                    </code>
                  </p>
                  <ul className="text-[12px] text-ink/50 list-disc pl-5 space-y-0.5">
                    <li>品項欄位以分號（;）分隔品項編號，數量用 *數量 表示（例：5;7*3 → 品項 5 一份、品項 7 三份）</li>
                    <li>品項編號對應菜單中的品項；已下架品項仍會自動辨識並標記</li>
                    <li>付款狀態：0 = 待付款，1 = 已完成</li>
                    <li>電話欄位：3~15 碼數字，或留空</li>
                    <li>多檔匯入：選擇後自動預覽所有檔案，按「全部匯入」後逐一寫入；個別失敗不影響其他檔案</li>
                  </ul>
                  <div className="flex items-center gap-3">
                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".csv"
                      multiple
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

              {importPhase === 'previewing' && filePreviews.length > 0 && (() => {
                const unmappedCodes = computeUnmappedCodes()
                const allOptions = aggregatedMenuOptions()
                // 聚合 stats
                const aggOrders = filePreviews.reduce((s, fp) => s + (fp.preview?.summary?.orders ?? 0), 0)
                const aggItems = filePreviews.reduce((s, fp) => s + (fp.preview?.summary?.items ?? 0), 0)
                const aggErrors = filePreviews.reduce((s, fp) => s + (fp.preview?.summary?.errors ?? 0), 0)
                const stillPreviewing = filePreviews.some(fp => fp.previewStatus === 'previewing')
                return (
                  <div className="space-y-4">
                    {/* 聚合 stats */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 border border-border">
                        <p className="text-[11px] text-ink/40">檔案</p>
                        <p className="font-mono text-lg text-ink font-semibold">
                          {filePreviews.length}
                        </p>
                        {stillPreviewing && (
                          <p className="text-[10px] text-ink/40">解析中…</p>
                        )}
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-border">
                        <p className="text-[11px] text-ink/40">訂單合計</p>
                        <p className="font-mono text-lg text-ink font-semibold">{aggOrders}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-border">
                        <p className="text-[11px] text-ink/40">項目合計</p>
                        <p className="font-mono text-lg text-ink font-semibold">{aggItems}</p>
                      </div>
                      <div className={`rounded-lg p-3 border ${
                        aggErrors > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-border'
                      }`}>
                        <p className="text-[11px] text-ink/40">錯誤列數</p>
                        <p className={`font-mono text-lg font-semibold ${aggErrors > 0 ? 'text-red-500' : 'text-ink'}`}>{aggErrors}</p>
                      </div>
                    </div>

                    {unmappedCodes.length > 0 && (
                      <div className="selectable border border-amber-200 bg-amber-50/40 rounded-lg px-3 py-2">
                        <p className="text-[12px] text-amber-700 mb-2">
                          以下 code 在菜單沒有對應，匯入時會被跳過。可在下方下拉手動指定：
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {unmappedCodes.map(code => (
                            <div key={code} className="flex items-center gap-1.5 bg-white border border-amber-300 rounded-md px-2 py-1">
                              <span className="font-mono text-[12px] text-amber-700">{code}</span>
                              <span className="text-amber-600 text-[11px]">→</span>
                              <select
                                value={importMapping[String(code)] ?? ''}
                                onChange={e => {
                                  const v = e.target.value
                                  setImportMapping(prev => {
                                    const next = { ...prev }
                                    if (v) next[String(code)] = parseInt(v, 10)
                                    else delete next[String(code)]
                                    return next
                                  })
                                }}
                                className="text-[11px] border-0 focus:outline-none focus:ring-0 bg-transparent"
                              >
                                <option value="">忽略</option>
                                {allOptions.map(opt => (
                                  <option key={opt.item_id} value={opt.item_id}>
                                    {opt.item_id}. {opt.name}{opt.is_active === 0 ? '（已下架）' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 每個檔案一張展開卡 */}
                    <div className="space-y-2">
                      {filePreviews.map(fp => {
                        const isExpanded = expandedFiles.has(fp.filename)
                        const previewing = fp.previewStatus === 'previewing'
                        const failed = fp.previewStatus === 'preview_failed'
                        const ok = fp.previewStatus === 'preview_ok'
                        const fileErrors = fp.preview?.errors?.length ?? 0
                        const fileOrders = fp.preview?.summary?.orders ?? 0
                        const fileItems = fp.preview?.summary?.items ?? 0
                        const fileDate = fp.preview?.summary?.order_date ?? '—'
                        return (
                          <div key={fp.filename} className="border border-border rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => ok && toggleFileExpand(fp.filename)}
                              disabled={!ok}
                              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors disabled:cursor-default disabled:hover:bg-gray-50"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="text-[14px]">
                                  {previewing && <span className="text-ink/40">⏳</span>}
                                  {failed && <span className="text-red-500">✗</span>}
                                  {ok && fileErrors === 0 && <span className="text-green-600">✓</span>}
                                  {ok && fileErrors > 0 && <span className="text-amber-500">⚠</span>}
                                </span>
                                <span className="font-mono text-[13px] text-ink font-semibold">{fp.filename}</span>
                                <span className="font-mono text-[11px] text-ink/50">{fileDate}</span>
                                {ok && (
                                  <span className="text-[11px] text-ink/50">
                                    {fileOrders} 筆訂單 · {fileItems} 項
                                    {fileErrors > 0 && (
                                      <span className="text-red-500 ml-1">· {fileErrors} 列錯誤</span>
                                    )}
                                  </span>
                                )}
                                {previewing && <span className="text-[11px] text-ink/40">解析中…</span>}
                                {failed && <span className="text-[11px] text-red-500">{fp.previewError}</span>}
                              </div>
                              {ok && (
                                <span className="text-ink/40 text-[12px] shrink-0">
                                  {isExpanded ? '▲' : '▼'}
                                </span>
                              )}
                            </button>

                            {isExpanded && ok && fp.preview && (
                              <div className="px-4 py-3 bg-white space-y-3 border-t border-border">
                                {fp.preview.errors && fp.preview.errors.length > 0 && (
                                  <div className="selectable">
                                    <p className="text-[12px] text-ink/60 font-semibold mb-2">錯誤列表</p>
                                    <div className="border border-red-200 rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                                      <table className="w-full text-[12px]">
                                        <thead className="bg-red-50 text-ink/70 sticky top-0">
                                          <tr>
                                            <th className="px-3 py-1.5 text-left w-16">列號</th>
                                            <th className="px-3 py-1.5 text-left">原因</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {fp.preview.errors.map((e, i) => (
                                            <tr key={i} className="border-t border-red-100">
                                              <td className="px-3 py-1.5 font-mono">{e.row}</td>
                                              <td className="px-3 py-1.5 text-red-600">{e.reason}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                                {fp.preview.valid && fp.preview.valid.length > 0 && (
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
                                          {fp.preview.valid.map(o => {
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
                                                <th className="text-left py-1 w-16">編號</th>
                                                <th className="text-left py-1">品名</th>
                                                <th className="text-right py-1 w-12">數量</th>
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
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {importError && (
                      <p className="text-[12px] text-red-500">{importError}</p>
                    )}
                  </div>
                )
              })()}

              {importPhase === 'done' && (() => {
                const totalImported = filePreviews.reduce((s, fp) => s + (fp.imported ?? 0), 0)
                const totalFailed = filePreviews.filter(fp => fp.importStatus === 'import_failed').length
                const aggSkipped = Array.from(new Set(filePreviews.flatMap(fp => fp.importedSkippedCodes ?? []))).sort((a, b) => a - b)
                return (
                  <div className="space-y-3">
                    <div className="py-4 text-center border-b border-border">
                      <p className="text-ink font-semibold text-lg">
                        共匯入 {totalImported} 筆訂單
                        {totalFailed > 0 && (
                          <span className="text-red-500 ml-2">（{totalFailed} 個檔案失敗）</span>
                        )}
                      </p>
                      {aggSkipped.length > 0 && (
                        <p className="text-[12px] text-amber-600 mt-1">
                          跳過的 code：{aggSkipped.join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      {filePreviews.map(fp => (
                        <div key={fp.filename} className="flex items-center justify-between gap-3 px-3 py-2 border border-border rounded-md">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[14px]">
                              {fp.importStatus === 'imported' && <span className="text-green-600">✓</span>}
                              {fp.importStatus === 'import_failed' && <span className="text-red-500">✗</span>}
                              {fp.importStatus === undefined && <span className="text-ink/40">—</span>}
                            </span>
                            <span className="font-mono text-[12px] text-ink">{fp.filename}</span>
                            <span className="font-mono text-[11px] text-ink/40">{fp.preview?.summary?.order_date ?? ''}</span>
                          </div>
                          <div className="text-[12px] text-ink/60">
                            {fp.importStatus === 'imported' && <span>已匯入 {fp.imported} 筆</span>}
                            {fp.importStatus === 'import_failed' && <span className="text-red-500">{fp.importError}</span>}
                            {fp.importStatus === undefined && <span className="text-ink/40">（未匯入）</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="px-6 py-3 border-t border-border flex items-center justify-between gap-2 shrink-0">
              {importPhase === 'previewing' && importProgress && (
                <p className="text-[12px] text-ink/60 font-mono">
                  進度 {importProgress.done} / {importProgress.total}
                </p>
              )}
              {!importProgress && <div />}
              {importPhase === 'previewing' && (
                <div className="flex items-center gap-2">
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
                    disabled={(() => {
                      if (importLoading) return true
                      const importable = filePreviews.filter(fp =>
                        fp.previewStatus === 'preview_ok' &&
                        (fp.preview?.errors?.length ?? 0) === 0 &&
                        (fp.preview?.valid?.length ?? 0) > 0 &&
                        fp.importStatus !== 'imported'
                      )
                      return importable.length === 0
                    })()}
                    className="text-[12px] px-3 py-1.5 rounded-md bg-clay text-white hover:bg-clay-deep disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {importLoading ? '匯入中…' : '全部匯入'}
                  </button>
                </div>
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
                <Meta label="電話" value={detailOrder.customer_phone || '—'} />
                <Meta label="付款狀態" value={detailOrder.status === '已完成' ? '已付款' : detailOrder.status === '已取消' ? '已取消' : detailOrder.status === '待付款' ? '未付款' : '尚未結帳'} />
              </div>

              {/* items table */}
              <div>
                <p className="text-[11px] text-ink-mute uppercase tracking-wider mb-2">品項明細</p>
                {(() => {
                  const items = detailOrder.items ?? []
                  // 展開每份為獨立 row
                  type ExpandedRow = { name: string; unitPrice: number; qty: number; addons: Array<{ label: string; price: number }>; addonTotal: number; subtotal: number }
                  const expanded: ExpandedRow[] = []
                  for (const it of items) {
                    const detail: Array<Array<{ id: string; label: string; price: number }>> = it.customizations_detail ?? []
                    const qty = it.quantity ?? it.qty ?? 1
                    const unitPrice = it.unit_price ?? 0
                    const name = it.name ?? it.item_name ?? `?code${it.code}`
                    if (detail.length > 0 && detail.length === qty) {
                      for (const unitAddons of detail) {
                        const addonTotal = unitAddons.reduce((s: number, a: { price: number }) => s + a.price, 0)
                        expanded.push({ name, unitPrice, qty: 1, addons: unitAddons, addonTotal, subtotal: unitPrice + addonTotal })
                      }
                    } else {
                      const addonTotal = it.customizations_amount ?? 0
                      expanded.push({ name, unitPrice, qty, addons: [], addonTotal, subtotal: unitPrice * qty + addonTotal })
                    }
                  }
                  const hasCustomCol = expanded.some(r => r.addonTotal > 0)
                  return (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-[11px] text-ink-mute">
                          <th className="text-left pb-1.5 font-normal">品名</th>
                          <th className="text-right pb-1.5 w-20 font-normal">單價</th>
                          <th className="text-right pb-1.5 w-12 font-normal">數量</th>
                          {hasCustomCol && <th className="text-right pb-1.5 w-20 font-normal">客製化加價</th>}
                          <th className="text-right pb-1.5 w-20 font-normal">小計</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expanded.map((row, i) => (
                          <tr key={i} className="border-t border-gray-200 align-top">
                            <td className="py-2 text-ink/85">
                              {row.name}
                              {row.addons.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {row.addons.map((a, j) => (
                                    <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-clay-soft text-clay-deep border border-clay/20 font-mono">
                                      {a.label} <span className="text-ink-mute">+{a.price}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-2 text-right font-mono text-ink/60">NT$ {row.unitPrice}</td>
                            <td className="py-2 text-right font-mono">{row.qty}</td>
                            {hasCustomCol && (
                              <td className="py-2 text-right font-mono text-clay">{row.addonTotal > 0 ? `+${row.addonTotal}` : '—'}</td>
                            )}
                            <td className="py-2 text-right font-mono text-ink">NT$ {row.subtotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
              </div>

              {/* note — editable */}
              <div>
                <p className="text-[11px] text-ink-mute uppercase tracking-wider mb-1">備註</p>
                <NoteEditor
                  orderId={detailOrder.order_id}
                  initialNote={detailOrder.note ?? ''}
                  onSaved={(note) => {
                    setOrders(prev => prev.map(o => o.order_id === detailOrder.order_id ? { ...o, note } : o))
                    setDetailOrder((prev: any) => prev ? { ...prev, note } : prev)
                  }}
                />
              </div>
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

function NoteEditor({ orderId, initialNote, onSaved }: { orderId: string; initialNote: string; onSaved: (note: string | null) => void }) {
  const [value, setValue] = useState(initialNote)
  const [saving, setSaving] = useState(false)
  const changed = value !== initialNote

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: value.trim() || null }),
      })
      const data = await res.json()
      if (data.success) onSaved(value.trim() || null)
    } catch { /* silent */ }
    setSaving(false)
  }

  return (
    <div className="flex gap-2 items-start">
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="無備註"
        rows={2}
        className="flex-1 text-[13px] text-ink/75 leading-relaxed bg-cream rounded-lg px-3 py-2 border border-border-soft focus:outline-none focus:ring-1 focus:ring-clay resize-none"
      />
      {changed && (
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 px-3 py-1.5 text-xs bg-clay text-white rounded-lg hover:bg-clay-deep transition-colors disabled:opacity-50"
        >
          {saving ? '...' : '儲存'}
        </button>
      )}
    </div>
  )
}