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
  cost: number
  prev_cost: number
  profit: number
  prev_profit: number
  profit_change_pct: number | null
}
interface SeriesPoint { bucket: string; revenue: number; orders_count: number }
interface TopItem { name: string; qty: number; revenue: number }
interface OverviewReport {
  scope: 'today' | 'week' | 'month' | 'custom'
  range: { from: string; to: string }
  summary: SummaryBlock
  timeseries: SeriesPoint[]
  top_items: TopItem[]
  kpi_trend_revenue: number[]
  kpi_trend_orders: number[]
}
interface InventoryItem { name: string; stock_qty: number; safety_stock: number; stock_unit: string }
interface RecentOrder { order_id: string; status: string; created_at: string; total: number }
interface DrillOrderItem { item_id: number; name: string; quantity: number; unit_price: number; subtotal: number }
interface DrillOrder {
  order_id: string; status: string; created_at: string; total: number
  customer_name: string; customer_phone: string | null; note: string | null
  items: DrillOrderItem[]
}
interface DrillPO {
  採購單編號: number
  採購單日期: string
  供應商名稱: string
  進貨食材總成本: number
  採購單狀態: string
  items?: { 食材名稱: string; 數量: number; 已退數量: number }[]
}

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

// ── KPI 卡 sparkline（最近 14 天 line，無 axis、無 label） ──
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 80, H = 24
  if (data.length === 0) return null
  const max = Math.max(1, ...data)
  const pts = data.map((v, i) => {
    const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W
    const y = H - (v / max) * (H - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      <polyline
        fill="none"
        stroke={color}
        strokeOpacity={0.55}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  )
}

// ── KPI 卡片 ──
function KpiCard({
  label, value, sub, accent, changePct, trend, onClick,
}: {
  label: string; value: string; sub?: string; accent: string;
  changePct?: number | null; trend?: number[]; onClick?: () => void
}) {
  const positive = (changePct ?? 0) >= 0
  return (
    <div
      className={`bg-paper rounded-2xl shadow-sm p-7 h-full border border-border/40 relative overflow-hidden${onClick ? ' cursor-pointer hover:border-clay/60 hover:shadow-md transition-all' : ''}`}
      onClick={onClick}
    >
      <p className="text-sm text-ink-mute uppercase tracking-wider mb-3">{label}</p>
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
      {trend && trend.length > 0 && (
        <div className="absolute right-4 bottom-4 pointer-events-none" title="近 14 天">
          <Sparkline data={trend} color={accent} />
        </div>
      )}
    </div>
  )
}

// ── 折線圖（多日 revenue）──
function LineChart({
  data, stroke, height = 220, granularity = 'day',
}: {
  data: SeriesPoint[]; stroke: string; height?: number;
  granularity?: 'day' | 'week'
}) {
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

  // 主折線：以 revenue === 0 為斷點切成多段（每段 ≥2 點才畫）
  // 週視圖時不做斷線（週彙總 0 通常代表整週公休，直接照畫即可）
  const segments: Array<{ x: number; y: number }[]> = []
  if (granularity === 'day') {
    let cur: { x: number; y: number }[] = []
    for (const p of points) {
      if (p.d.revenue === 0) {
        if (cur.length) { segments.push(cur); cur = [] }
      } else {
        cur.push({ x: p.x, y: p.y })
      }
    }
    if (cur.length) segments.push(cur)
  } else {
    segments.push(points.map(p => ({ x: p.x, y: p.y })))
  }

  // x 軸標籤：依像素間距挑選，確保 label 不重疊且分佈均勻
  const xLabelIdxs = (() => {
    const minPxGap = 62
    const set = new Set<number>()
    if (points.length === 0) return set
    set.add(0)
    let lastX = points[0].x
    for (let i = 1; i < points.length - 1; i++) {
      if (points[i].x - lastX >= minPxGap) {
        set.add(i)
        lastX = points[i].x
      }
    }
    const last = points.length - 1
    if (last > 0) {
      if (points[last].x - lastX < minPxGap * 0.6) {
        set.delete(Array.from(set).pop()!)
      }
      set.add(last)
    }
    return set
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
      {/* 主折線 */}
      {segments.map((seg, i) => (
        <polyline
          key={`seg-${i}`}
          fill="none"
          stroke={stroke}
          strokeOpacity={1}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={seg.map(p => `${p.x},${p.y}`).join(' ')}
        />
      ))}
      {/* 端點（只在有營收的點）*/}
      {points.map((p, i) => (
        p.d.revenue > 0
          ? <circle key={i} cx={p.x} cy={p.y} r={3} fill={stroke} opacity={1} />
          : null
      ))}
      {/* x 軸標籤
          首尾 label clamp 到 chart 區內，避免在窄螢幕 / 卡片 padding 內被截掉。
          全部用 textAnchor='middle' 並 clamp 後位置，視覺一致也不跑版。 */}
      {points.map((p, i) => {
        if (!xLabelIdxs.has(i)) return null
        const labelHalfWidth = 18                                     // 五字 'MM-DD' 約 28px 寬 / 2 + 4 安全餘量
        const minX = padding.left + labelHalfWidth
        const maxX = padding.left + innerW - labelHalfWidth
        const clampedX = Math.max(minX, Math.min(maxX, p.x))
        return (
          <text
            key={i}
            x={clampedX}
            y={height - 8}
            fontSize="11"
            fill="#888"
            textAnchor="middle"
          >
            {p.d.bucket.length === 10 ? p.d.bucket.slice(5) : p.d.bucket}
          </text>
        )
      })}
      {/* hover */}
      {hover && (() => {
        const tipW = 132
        const tipPad = 10
        const flipLeft = hover.x + tipPad + tipW > padding.left + innerW
        const rectX = flipLeft ? hover.x - tipPad - tipW : hover.x + tipPad
        const textX = flipLeft ? hover.x - tipPad - tipW + 8 : hover.x + 18
        const hd = data[hover.i]
        return (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padding.top} y2={padding.top + innerH}
              stroke={stroke} strokeOpacity={0.3} strokeDasharray="3 4" />
            <circle cx={hover.x} cy={hover.y} r={5} fill={stroke} />
            <rect x={rectX} y={hover.y - 36} width={tipW} height={42} rx={6} fill="#1A1A1A" />
            <text x={textX} y={hover.y - 20} fontSize="10" fill="#bbb">{hd.bucket}</text>
            <text x={textX} y={hover.y - 6} fontSize="12" fill="white">
              {`NT$ ${fmtMoney(hd.revenue)} · ${hd.orders_count} 筆`}
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

// ── 將日 series 彙總成週（週起始日 = 週日）──
// week 視圖時用；bucket = 該週週日的 YYYY-MM-DD
function aggregateToWeek(data: SeriesPoint[]): SeriesPoint[] {
  if (data.length === 0) return []
  // 找週日：用 UTC date 算 day-of-week，往前推到週日
  function weekStart(ymd: string): string {
    const d = new Date(ymd + 'T00:00:00Z')
    const dow = d.getUTCDay() // 0=Sun
    d.setUTCDate(d.getUTCDate() - dow)
    return d.toISOString().slice(0, 10)
  }
  const buckets = new Map<string, { revenue: number; orders_count: number }>()
  for (const p of data) {
    const k = weekStart(p.bucket)
    const cur = buckets.get(k) ?? { revenue: 0, orders_count: 0 }
    cur.revenue += p.revenue
    cur.orders_count += p.orders_count
    buckets.set(k, cur)
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, v]) => ({ bucket, revenue: v.revenue, orders_count: v.orders_count }))
}

// ── 粒度切換器（日 / 週）──
type Granularity = 'day' | 'week'
function GranularityPills({
  value, onChange, accent,
}: { value: Granularity; onChange: (g: Granularity) => void; accent: string }) {
  return (
    <div className="inline-flex bg-cream rounded-full p-0.5 border border-border/40 text-xs">
      {(['day', 'week'] as Granularity[]).map(g => {
        const active = g === value
        return (
          <button
            key={g}
            onClick={() => onChange(g)}
            className="px-3 py-0.5 rounded-full font-medium transition-colors"
            style={active
              ? { backgroundColor: accent, color: 'white' }
              : { color: '#888' }
            }
          >
            {g === 'day' ? '日' : '週'}
          </button>
        )
      })}
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
  // 訂單 drill-down modal
  const [drillOrders, setDrillOrders] = useState<DrillOrder[] | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)
  const [drillDetail, setDrillDetail] = useState<DrillOrder | null>(null)
  // 採購單 drill-down modal
  const [drillPOs, setDrillPOs] = useState<DrillPO[] | null>(null)
  const [drillPOLoading, setDrillPOLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openDrillDown = async () => {
    if (!overview) return
    setDrillLoading(true)
    setDrillOrders(null)
    setDrillDetail(null)
    try {
      const { from, to } = overview.range
      const res = await fetch(`/api/orders?from=${from}&to=${to}`)
      const data = await res.json()
      if (data.success) setDrillOrders(data.data)
    } catch { /* silent */ }
    finally { setDrillLoading(false) }
  }

  const openPurchaseDrillDown = async () => {
    if (!overview) return
    setDrillPOLoading(true)
    setDrillPOs(null)
    try {
      const { from, to } = overview.range
      const res = await fetch(`/api/purchase?from=${from}&to=${to}`)
      const data = await res.json()
      if (data.success) setDrillPOs(data.data)
    } catch { /* silent */ }
    finally { setDrillPOLoading(false) }
  }

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

  // ── 粒度自動 / 手動切換 ──
  // 規則：scope 改變時重設使用者選擇；series 長度 60+ 預設週、其它預設日；使用者手動覆蓋時 sticky
  const seriesLen = overview?.timeseries.length ?? 0
  const autoGranularity: Granularity = seriesLen > 60 ? 'week' : 'day'
  const [userGranularity, setUserGranularity] = useState<Granularity | null>(null)
  useEffect(() => { setUserGranularity(null) }, [scope, appliedFrom, appliedTo])
  const granularity: Granularity = userGranularity ?? autoGranularity
  const showGranularityPills = !isHourly && seriesLen >= 8

  const chartSeries = useMemo<SeriesPoint[]>(() => {
    if (!overview) return []
    if (isHourly) return overview.timeseries
    const filtered = overview.timeseries.filter(p => p.revenue > 0)
    return granularity === 'week'
      ? aggregateToWeek(filtered)
      : filtered
  }, [overview, granularity, isHourly])

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

            {/* ── KPI 6 顆（兩列 × 3 卡）── */}
            {/* 第一列：核心財務（含 sparkline）*/}
            <div className="col-span-4">
              <KpiCard
                label={`${theme.label}營收`}
                value={`NT$ ${fmtMoney(summary.revenue)}`}
                sub={`vs ${summary.prev_label} NT$ ${fmtMoney(summary.prev_revenue)}`}
                accent={theme.hex}
                changePct={summary.change_pct}
                trend={overview!.kpi_trend_revenue}
              />
            </div>
            <div className="col-span-4">
              <KpiCard
                label="採購成本"
                value={`NT$ ${fmtMoney(summary.cost)}`}
                sub={`期間 ${overview!.range.from} → ${overview!.range.to}　▸ 點擊查看`}
                accent="#8B6F4D"
                onClick={openPurchaseDrillDown}
              />
            </div>
            <div className="col-span-4">
              <KpiCard
                label="毛利"
                value={`NT$ ${fmtMoney(summary.profit)}`}
                sub={`vs ${summary.prev_label} NT$ ${fmtMoney(summary.prev_profit)}`}
                accent={summary.profit >= 0 ? theme.hex : '#D44030'}
                changePct={summary.profit_change_pct}
              />
            </div>
            {/* 第二列：操作面 */}
            <div className="col-span-4">
              <KpiCard
                label="訂單數"
                value={String(summary.orders_count)}
                sub={`期間 ${overview!.range.from} → ${overview!.range.to}　▸ 點擊查看`}
                accent={theme.hex}
                trend={overview!.kpi_trend_orders}
                onClick={openDrillDown}
              />
            </div>
            <div className="col-span-4">
              <KpiCard
                label="均單金額"
                value={`NT$ ${fmtMoney(summary.avg_per_order)}`}
                sub="已完成訂單"
                accent={theme.hex}
              />
            </div>
            <div className="col-span-4">
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
                    {isHourly
                      ? '今日各時段營收'
                      : granularity === 'week' ? '期間週營收趨勢' : '期間日營收趨勢'}
                  </p>
                  <div className="flex items-center gap-3">
                    {showGranularityPills && (
                      <GranularityPills
                        value={granularity}
                        onChange={setUserGranularity}
                        accent={theme.hex}
                      />
                    )}
                    <p className="text-xs text-ink-faint font-mono">
                      {overview!.range.from}{overview!.range.from !== overview!.range.to ? ` → ${overview!.range.to}` : ''}
                    </p>
                  </div>
                </div>
                {overview!.timeseries.every(p => p.revenue === 0) ? (
                  <p className="text-ink-faint text-sm py-12 text-center">期間內無已完成訂單</p>
                ) : isHourly ? (
                  <BarChart24 data={overview!.timeseries} fill={theme.hex} />
                ) : (
                  <LineChart
                    data={chartSeries}
                    stroke={theme.hex}
                    granularity={granularity}
                  />
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

      {/* 訂單列表 drill-down modal */}
      {(drillOrders !== null || drillLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-ink text-base">
                期間訂單
                <span className="text-sm font-normal text-ink/50">
                  {overview?.range.from} → {overview?.range.to}
                </span>
              </h3>
              <button onClick={() => { setDrillOrders(null); setDrillDetail(null) }}
                className="text-ink/40 hover:text-ink text-2xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {drillLoading ? (
                <p className="text-center py-12 text-ink/40">載入中…</p>
              ) : drillOrders && drillOrders.length === 0 ? (
                <p className="text-center py-12 text-ink/40">期間內無訂單</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-xs text-ink/50 text-left">
                      <th className="px-4 py-2.5 font-medium">訂單編號</th>
                      <th className="px-4 py-2.5 font-medium">時間</th>
                      <th className="px-4 py-2.5 font-medium text-center">狀態</th>
                      <th className="px-4 py-2.5 font-medium text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillOrders?.map((o, i) => (
                      <tr key={o.order_id}
                        onClick={() => setDrillDetail(o)}
                        className={`border-t border-gray-100 cursor-pointer hover:bg-clay-soft/40 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                        <td className="px-4 py-2.5 font-mono text-xs text-ink/70">{o.order_id}</td>
                        <td className="px-4 py-2.5 text-xs text-ink/50">{o.created_at?.replace('T', ' ').slice(0, 16)}</td>
                        <td className="px-4 py-2.5 text-center"><StatusBadge status={o.status} /></td>
                        <td className="px-4 py-2.5 text-right font-mono">NT$ {fmtMoney(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {drillOrders && (
              <div className="px-6 py-3 border-t border-gray-200 text-xs text-ink/50 shrink-0">
                共 {drillOrders.length} 筆訂單　·
                合計 NT$ {fmtMoney(drillOrders.reduce((s, o) => s + o.total, 0))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 採購單 drill-down modal */}
      {(drillPOs !== null || drillPOLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-ink text-base">
                期間採購單{' '}
                <span className="text-sm font-normal text-ink/50">
                  {overview?.range.from} → {overview?.range.to}
                </span>
              </h3>
              <button onClick={() => setDrillPOs(null)}
                className="text-ink/40 hover:text-ink text-2xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {drillPOLoading ? (
                <p className="text-center py-12 text-ink/40">載入中...</p>
              ) : drillPOs && drillPOs.length === 0 ? (
                <p className="text-center py-12 text-ink/40">期間內無採購單</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-xs text-ink/50 text-left">
                      <th className="px-4 py-2.5 font-medium">PO #</th>
                      <th className="px-4 py-2.5 font-medium">日期</th>
                      <th className="px-4 py-2.5 font-medium">供應商</th>
                      <th className="px-4 py-2.5 font-medium text-center">狀態</th>
                      <th className="px-4 py-2.5 font-medium text-right">成本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillPOs?.map((po, i) => (
                      <tr key={po.採購單編號}
                        className={`border-t border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                        <td className="px-4 py-2.5 font-mono text-xs text-ink/70">#{po.採購單編號}</td>
                        <td className="px-4 py-2.5 text-xs text-ink/50 font-mono">{po.採購單日期?.slice(0, 10)}</td>
                        <td className="px-4 py-2.5 text-sm text-ink">{po.供應商名稱}</td>
                        <td className="px-4 py-2.5 text-center"><PurchaseStatusBadge status={po.採購單狀態} /></td>
                        <td className="px-4 py-2.5 text-right font-mono" style={{ color: '#8B6F4D' }}>
                          NT$ {fmtMoney(po.進貨食材總成本)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {drillPOs && (
              <div className="px-6 py-3 border-t border-gray-200 text-xs text-ink/50 shrink-0 flex items-center justify-between">
                <span>
                  共 {drillPOs.length} 筆採購單 · 合計 NT$ {fmtMoney(drillPOs.reduce((s, po) => s + (po.進貨食材總成本 || 0), 0))}
                </span>
                <a href="/admin/purchase" className="text-xs hover:underline" style={{ color: '#8B6F4D' }}>
                  前往採購管理 →
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 單筆訂單詳情 modal */}
      {drillDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-ink text-base font-mono">{drillDetail.order_id}</h3>
                <p className="text-xs text-ink/50 mt-0.5">{drillDetail.created_at?.replace('T', ' ').slice(0, 16)}</p>
              </div>
              <button onClick={() => setDrillDetail(null)}
                className="text-ink/40 hover:text-ink text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="flex gap-4 text-xs text-ink/60">
                <span>顧客：{drillDetail.customer_name}</span>
                <span>電話：{drillDetail.customer_phone || '—'}</span>
                <StatusBadge status={drillDetail.status} />
              </div>
              {drillDetail.note && (
                <p className="text-xs text-ink/50 bg-gray-50 px-3 py-1.5 rounded">備註：{drillDetail.note}</p>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink/40 border-b">
                    <th className="py-1.5 text-left font-medium">品項</th>
                    <th className="py-1.5 text-right font-medium">數量</th>
                    <th className="py-1.5 text-right font-medium">單價</th>
                    <th className="py-1.5 text-right font-medium">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDetail.items.map(it => (
                    <tr key={it.item_id} className="border-t border-gray-100">
                      <td className="py-1.5">{it.name}</td>
                      <td className="py-1.5 text-right font-mono">{it.quantity}</td>
                      <td className="py-1.5 text-right font-mono text-ink/50">${it.unit_price}</td>
                      <td className="py-1.5 text-right font-mono">${fmtMoney(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-right font-mono font-semibold text-base pt-2 border-t border-gray-200"
                style={{ color: theme.hex }}>
                合計 NT$ {fmtMoney(drillDetail.total)}
              </div>
            </div>
            <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
              <button onClick={() => setDrillDetail(null)}
                className="px-4 py-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
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

function PurchaseStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    '未到貨': 'bg-blue-100 text-blue-700',
    '已到貨': 'bg-amber-100 text-amber-700',
    '已完成驗收': 'bg-green-100 text-green-700',
    '已退貨': 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100'}`}>
      {status}
    </span>
  )
}
