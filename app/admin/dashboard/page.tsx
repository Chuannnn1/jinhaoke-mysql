'use client'
// ============================================================
// 後台概覽 dashboard
// - 右上角四顆膠囊：今日 / 本周 / 本月 / 自訂
// - 切換時改主 KPI 數字色 + 圖表 stroke / fill 顏色
// - 圖表自畫 SVG（不引第三方 chart lib）
// ============================================================
import { useState, useEffect, useMemo, useRef } from 'react'

// ── 型別 ──
interface SummaryBlock {
  revenue: number
  orders_count: number
  avg_per_order: number
  prev_revenue: number
  prev_label: string
  change_pct: number | null
}
interface SeriesPoint { bucket: string; revenue: number; orders_count: number }
interface TopItem { name: string; qty: number; revenue: number }
interface OverviewReport {
  scope: 'today' | 'week' | 'month' | 'custom'
  range: { from: string; to: string }
  summary: SummaryBlock
  timeseries: SeriesPoint[]
  top_items: TopItem[]
}
interface InventoryItem { name: string; stock_qty: number; safety_stock: number; stock_unit: string }
interface RecentOrder { order_id: string; status: string; created_at: string; total: number }

// ── 主題色（呼應 clay 體系）──
type Scope = 'today' | 'week' | 'month' | 'custom'
const THEMES: Record<Scope, { hex: string; soft: string; label: string }> = {
  today:  { hex: '#D4A847', soft: '#FAEFD2', label: '今日' },
  week:   { hex: '#C65D21', soft: '#FFE9D8', label: '本周' },
  month:  { hex: '#A44A17', soft: '#F6D8C2', label: '本月' },
  custom: { hex: '#1A1A1A', soft: '#E5E5E5', label: '自訂' },
}

// ── 工具 ──
function todayTW() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}
function fmtMoney(n: number) { return n.toLocaleString('zh-TW') }
function fmtPct(n: number | null) {
  if (n === null) return '—'
  const s = n > 0 ? `+${n}` : String(n)
  return `${s}%`
}

// ── KPI 卡片 ──
function KpiCard({
  label, value, sub, accent, changePct,
}: {
  label: string; value: string; sub?: string; accent: string; changePct?: number | null
}) {
  const positive = (changePct ?? 0) >= 0
  return (
    <div className="bg-paper rounded-2xl shadow-sm p-7 h-full border border-border/40">
      <p className="text-xs text-ink-mute uppercase tracking-wider mb-3">{label}</p>
      <p className="text-4xl font-bold font-mono tracking-tight" style={{ color: accent }}>
        {value}
      </p>
      {sub && <p className="text-sm text-ink-mute mt-2">{sub}</p>}
      {changePct !== undefined && (
        <p className={`text-xs mt-1 font-mono ${
          changePct === null ? 'text-ink-faint' : positive ? 'text-emerald-600' : 'text-red-500'
        }`}>
          {changePct === null
            ? '無對照資料'
            : `${positive ? '▲' : '▼'} ${fmtPct(changePct)}`
          }
        </p>
      )}
    </div>
  )
}

// ── 折線圖（多日 revenue）──
function LineChart({
  data, stroke, height = 220,
}: { data: SeriesPoint[]; stroke: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const padding = { top: 20, right: 24, bottom: 28, left: 56 }
  const width = 760

  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const maxRev = Math.max(1, ...data.map(d => d.revenue))

  // y 軸 4 條格線
  const yTicks = 4
  const yLines = Array.from({ length: yTicks + 1 }, (_, i) => i * maxRev / yTicks)

  const points = data.map((d, i) => {
    const x = padding.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
    const y = padding.top + innerH - (d.revenue / maxRev) * innerH
    return { x, y, d, i }
  })
  const polyline = points.map(p => `${p.x},${p.y}`).join(' ')

  // x 軸標籤：太多時跳著顯示；最後一筆若太靠近前一筆 stride 點就 replace（避免重疊）
  const xLabelStride = Math.max(1, Math.floor(data.length / 10))
  const xLabelIdxs = (() => {
    const idxs: number[] = []
    for (let i = 0; i < data.length; i += xLabelStride) idxs.push(i)
    const last = data.length - 1
    if (idxs.length === 0) {
      idxs.push(last)
    } else if (idxs[idxs.length - 1] !== last) {
      if (last - idxs[idxs.length - 1] < xLabelStride) {
        idxs[idxs.length - 1] = last
      } else {
        idxs.push(last)
      }
    }
    return new Set(idxs)
  })()

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = ref.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const cx = (e.clientX - rect.left) * (width / rect.width)
    // 找最近點
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - cx)
      if (d < bestDist) { bestDist = d; best = i }
    }
    setHover({ i: best, x: points[best].x, y: points[best].y })
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full block"
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      {/* y 格線 + 標籤 */}
      {yLines.map((v, i) => {
        const y = padding.top + innerH - (v / maxRev) * innerH
        return (
          <g key={i}>
            <line x1={padding.left} x2={padding.left + innerW} y1={y} y2={y}
              stroke="#E5DDD4" strokeDasharray="3 4" strokeWidth={1} />
            <text x={padding.left - 10} y={y + 4} fontSize="11" fill="#888" textAnchor="end">
              {v >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v)}
            </text>
          </g>
        )
      })}
      {/* 折線 */}
      <polyline fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
        points={polyline} />
      {/* 端點 */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={stroke} />
      ))}
      {/* x 軸標籤 */}
      {points.map((p, i) => {
        if (!xLabelIdxs.has(i)) return null
        const isLast = i === points.length - 1
        const isFirst = i === 0
        return (
          <text
            key={i}
            x={p.x}
            y={height - 8}
            fontSize="11"
            fill="#888"
            textAnchor={isLast ? 'end' : isFirst ? 'start' : 'middle'}
          >
            {p.d.bucket.length === 10 ? p.d.bucket.slice(5) : p.d.bucket}
          </text>
        )
      })}
      {/* hover */}
      {hover && (() => {
        const tipW = 132
        const tipPad = 10
        // 若往右畫會超出 innerW，改畫在左側
        const flipLeft = hover.x + tipPad + tipW > padding.left + innerW
        const rectX = flipLeft ? hover.x - tipPad - tipW : hover.x + tipPad
        const textX = flipLeft ? hover.x - tipPad - tipW + 8 : hover.x + 18
        return (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padding.top} y2={padding.top + innerH}
              stroke={stroke} strokeOpacity={0.3} strokeDasharray="3 4" />
            <circle cx={hover.x} cy={hover.y} r={5} fill={stroke} />
            <rect x={rectX} y={hover.y - 36} width={tipW} height={42} rx={6} fill="#1A1A1A" />
            <text x={textX} y={hover.y - 20} fontSize="10" fill="#bbb">{data[hover.i].bucket}</text>
            <text x={textX} y={hover.y - 6} fontSize="12" fill="white">
              NT$ {fmtMoney(data[hover.i].revenue)} · {data[hover.i].orders_count} 筆
            </text>
          </g>
        )
      })()}
    </svg>
  )
}

// ── 24 小時柱狀圖 ──
function BarChart24({ data, fill }: { data: SeriesPoint[]; fill: string }) {
  const width = 760, height = 200
  const padding = { top: 16, right: 16, bottom: 28, left: 40 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const maxRev = Math.max(1, ...data.map(d => d.revenue))
  const barW = innerW / 24 * 0.78
  const gap = innerW / 24 * 0.22

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full block">
      {[0.25, 0.5, 0.75, 1].map((r, i) => {
        const y = padding.top + innerH - r * innerH
        return <line key={i} x1={padding.left} x2={padding.left + innerW} y1={y} y2={y}
          stroke="#E5DDD4" strokeDasharray="3 4" strokeWidth={1} />
      })}
      {data.map((d, i) => {
        const h = (d.revenue / maxRev) * innerH
        const x = padding.left + (i / 24) * innerW + gap / 2
        const y = padding.top + innerH - h
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(0, h)} rx={2} fill={fill} opacity={d.revenue > 0 ? 1 : 0.18} />
            {(i % 3 === 0) && (
              <text x={x + barW / 2} y={height - 8} fontSize="11" fill="#888" textAnchor="middle">{d.bucket}</text>
            )}
            {d.revenue > 0 && (
              <text x={x + barW / 2} y={y - 4} fontSize="10" fill="#666" textAnchor="middle">
                {fmtMoney(d.revenue)}
              </text>
            )}
            {d.revenue > 0 && (
              <title>{d.bucket}:00 — NT$ {fmtMoney(d.revenue)} · {d.orders_count} 筆</title>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── 暢銷品項橫條（純 div + tailwind）──
function TopRanking({ items, accent }: { items: TopItem[]; accent: string }) {
  const max = Math.max(1, ...items.map(i => i.qty))
  if (items.length === 0) return <p className="text-ink-faint text-sm">期間內尚無資料</p>
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.name} className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
            style={{ backgroundColor: i < 3 ? accent : '#C9BFB1' }}>
            {i + 1}
          </span>
          <span className="flex-1 text-sm text-ink truncate">{it.name}</span>
          <div className="w-24 h-2 rounded-full bg-cream overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(it.qty / max) * 100}%`, backgroundColor: accent }} />
          </div>
          <span className="w-10 text-right text-xs text-ink-mute font-mono">{it.qty}</span>
          <span className="w-20 text-right text-xs font-mono" style={{ color: accent }}>
            NT$ {fmtMoney(it.revenue)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── 膠囊切換器 ──
function ScopePills({
  scope, onChange,
}: { scope: Scope; onChange: (s: Scope) => void }) {
  return (
    <div className="inline-flex bg-paper rounded-full p-1 border border-border/40 shadow-sm">
      {(['today', 'week', 'month', 'custom'] as Scope[]).map(s => {
        const active = s === scope
        const t = THEMES[s]
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className="px-5 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={active
              ? { backgroundColor: t.hex, color: 'white' }
              : { color: '#888' }
            }
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================
// 主元件
// ============================================================
export default function DashboardPage() {
  const [scope, setScope] = useState<Scope>('today')
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const t = todayTW()
    const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 6)
    return d.toISOString().slice(0, 10)
  })
  const [customTo, setCustomTo] = useState<string>(todayTW())
  const [appliedFrom, setAppliedFrom] = useState(customFrom)
  const [appliedTo, setAppliedTo] = useState(customTo)

  const [overview, setOverview] = useState<OverviewReport | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const theme = THEMES[scope]

  // 主資料抓取
  useEffect(() => {
    let qs = `scope=${scope}`
    if (scope === 'custom') qs += `&from=${appliedFrom}&to=${appliedTo}`
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`/api/reports/overview?${qs}`).then(r => r.json()),
      fetch('/api/inventory').then(r => r.json()),
      fetch('/api/orders').then(r => r.json()),
    ]).then(([ov, inv, ord]) => {
      if (ov.success) setOverview(ov.data); else setError(ov.error || '報表讀取失敗')
      if (inv.success) setInventory(inv.data)
      if (ord.success) setRecentOrders(ord.data.slice(0, 8))
    }).catch(() => setError('網路錯誤'))
      .finally(() => setLoading(false))
  }, [scope, appliedFrom, appliedTo])

  const lowStockItems = useMemo(() =>
    inventory.filter(i => i.safety_stock > 0 && i.stock_qty <= i.safety_stock).slice(0, 6),
    [inventory]
  )

  const summary = overview?.summary
  const isHourly = scope === 'today'

  return (
    <>
      <header className="h-16 bg-paper border-b border-border flex items-center justify-between px-8 shrink-0">
        <h2 className="text-ink font-body font-semibold text-sm tracking-wide">概覽</h2>
        <div className="flex items-center gap-4">
          {scope === 'custom' && (
            <div className="flex items-center gap-2 text-xs text-ink-mute">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="border border-border rounded-md px-2 py-1 text-ink font-mono"
              />
              <span>–</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="border border-border rounded-md px-2 py-1 text-ink font-mono"
              />
              <button
                onClick={() => { setAppliedFrom(customFrom); setAppliedTo(customTo) }}
                className="px-3 py-1 rounded-md text-white text-xs font-medium"
                style={{ backgroundColor: theme.hex }}
              >
                套用
              </button>
            </div>
          )}
          <ScopePills scope={scope} onChange={setScope} />
        </div>
      </header>

      <main className="flex-1 overflow-auto p-8 bg-cream">
        {loading && !overview ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-ink-faint">載入中…</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-red-500">{error}</p>
          </div>
        ) : !summary ? null : (
          <div className="grid grid-cols-12 gap-8">

            {/* ── KPI 4 顆 ── */}
            <div className="col-span-3">
              <KpiCard
                label={`${theme.label}營收`}
                value={`NT$ ${fmtMoney(summary.revenue)}`}
                sub={`vs ${summary.prev_label} NT$ ${fmtMoney(summary.prev_revenue)}`}
                accent={theme.hex}
                changePct={summary.change_pct}
              />
            </div>
            <div className="col-span-3">
              <KpiCard
                label="訂單數"
                value={String(summary.orders_count)}
                sub={`期間 ${overview!.range.from} → ${overview!.range.to}`}
                accent={theme.hex}
              />
            </div>
            <div className="col-span-3">
              <KpiCard
                label="均單金額"
                value={`NT$ ${fmtMoney(summary.avg_per_order)}`}
                sub="已完成訂單"
                accent={theme.hex}
              />
            </div>
            <div className="col-span-3">
              <KpiCard
                label="低庫存品項"
                value={String(lowStockItems.length)}
                sub="低於安全存量"
                accent={lowStockItems.length > 0 ? '#D44030' : theme.hex}
              />
            </div>

            {/* ── 主圖 ── */}
            <div className="col-span-12">
              <div className="bg-paper rounded-2xl shadow-sm p-7 border border-border/40">
                <div className="flex items-baseline justify-between mb-4">
                  <p className="text-xs text-ink-mute uppercase tracking-wider">
                    {isHourly ? '今日各時段營收' : '期間日營收趨勢'}
                  </p>
                  <p className="text-xs text-ink-faint font-mono">
                    {overview!.range.from}{overview!.range.from !== overview!.range.to ? ` → ${overview!.range.to}` : ''}
                  </p>
                </div>
                {overview!.timeseries.every(p => p.revenue === 0) ? (
                  <p className="text-ink-faint text-sm py-12 text-center">期間內無已完成訂單</p>
                ) : isHourly ? (
                  <BarChart24 data={overview!.timeseries} fill={theme.hex} />
                ) : (
                  <LineChart data={overview!.timeseries} stroke={theme.hex} />
                )}
              </div>
            </div>

            {/* ── 暢銷排行 ── */}
            <div className="col-span-7">
              <div className="bg-paper rounded-2xl shadow-sm p-7 border border-border/40">
                <p className="text-xs text-ink-mute uppercase tracking-wider mb-4">
                  期間暢銷 Top {overview!.top_items.length || (scope === 'month' || scope === 'custom' ? 10 : 5)}
                </p>
                <TopRanking items={overview!.top_items} accent={theme.hex} />
              </div>
            </div>

            {/* ── 低庫存清單 ── */}
            <div className="col-span-5">
              <div className="bg-paper rounded-2xl shadow-sm p-7 border border-border/40 h-full">
                <p className="text-xs text-red-600 uppercase tracking-wider mb-4">低庫存食材</p>
                {lowStockItems.length > 0 ? (
                  <div className="space-y-3">
                    {lowStockItems.map(item => {
                      const pct = Math.round((item.stock_qty / item.safety_stock) * 100)
                      const critical = pct <= 50
                      return (
                        <div key={item.name} className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${critical ? 'bg-red-500' : 'bg-amber-400'}`} />
                          <span className="flex-1 text-sm text-ink">{item.name}</span>
                          <span className="text-xs text-ink-mute font-mono">
                            {item.stock_qty} / {item.safety_stock} {item.stock_unit}
                          </span>
                        </div>
                      )
                    })}
                    <a href="/admin/inventory" className="inline-block mt-2 text-xs hover:underline" style={{ color: theme.hex }}>
                      去庫存頁面補貨 →
                    </a>
                  </div>
                ) : (
                  <p className="text-emerald-600 text-sm">所有食材庫存充足</p>
                )}
              </div>
            </div>

            {/* ── 最近訂單（已砍 顧客 column）── */}
            <div className="col-span-12">
              <div className="bg-paper rounded-2xl shadow-sm p-7 border border-border/40">
                <p className="text-xs text-ink-mute uppercase tracking-wider mb-4">最近訂單</p>
                {recentOrders.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-ink-mute text-left text-xs uppercase tracking-wider">
                        <th className="pb-3 pr-4">單號</th>
                        <th className="pb-3 pr-4">時間</th>
                        <th className="pb-3 pr-4">金額</th>
                        <th className="pb-3">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map(o => (
                        <tr key={o.order_id} className="border-t border-border/40">
                          <td className="py-3 pr-4 font-mono text-xs text-ink">{o.order_id}</td>
                          <td className="py-3 pr-4 text-ink-mute text-xs font-mono">
                            {o.created_at ? o.created_at.slice(0, 16).replace('T', ' ') : '—'}
                          </td>
                          <td className="py-3 pr-4 font-mono" style={{ color: theme.hex }}>NT$ {fmtMoney(o.total)}</td>
                          <td className="py-3">
                            <StatusBadge status={o.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-ink-faint text-sm">尚無訂單</p>
                )}
              </div>
            </div>

          </div>
        )}
      </main>
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    '待製作': 'bg-amber-100 text-amber-700',
    '製作中': 'bg-blue-100 text-blue-700',
    '待付款': 'bg-orange-100 text-orange-700',
    '已完成': 'bg-emerald-100 text-emerald-700',
    '已取消': 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100'}`}>
      {status}
    </span>
  )
}
