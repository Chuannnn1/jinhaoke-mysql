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
  kpi_trend_revenue: number[]
  kpi_trend_orders: number[]
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
  label, value, sub, accent, changePct, trend,
}: {
  label: string; value: string; sub?: string; accent: string;
  changePct?: number | null; trend?: number[]
}) {
  const positive = (changePct ?? 0) >= 0
  return (
    <div className="bg-paper rounded-2xl shadow-sm p-7 h-full border border-border/40 relative overflow-hidden">
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
      {trend && trend.length > 0 && (
        <div className="absolute right-4 bottom-4 pointer-events-none" title="近 14 天">
          <Sparkline data={trend} color={accent} />
        </div>
      )}
    </div>
  )
}

// ── 7 日移動平均（前 6 天用 partial、第 7 天起 full window）──
// 注意：只有 revenue > 0 的點才納入平均；公休（revenue===0）視為斷點不計入也不出 MA 值
function computeMovingAvg(data: SeriesPoint[], window = 7): Array<number | null> {
  const out: Array<number | null> = []
  for (let i = 0; i < data.length; i++) {
    // 公休日不畫 MA
    if (data[i].revenue === 0) { out.push(null); continue }
    const start = Math.max(0, i - window + 1)
    const slice = data.slice(start, i + 1).filter(d => d.revenue > 0)
    if (slice.length === 0) { out.push(null); continue }
    const avg = slice.reduce((s, d) => s + d.revenue, 0) / slice.length
    out.push(avg)
  }
  return out
}

// ── 折線圖（多日 revenue）──
// showMovingAvg：8 天以上才開；公休（revenue===0 連續一天以上）會：
//   1) 主折線斷開（不硬連）
//   2) 該日背景畫灰塊 + 上方寫「公休」
function LineChart({
  data, stroke, height = 220, showMovingAvg = false, granularity = 'day',
}: {
  data: SeriesPoint[]; stroke: string; height?: number;
  showMovingAvg?: boolean; granularity?: 'day' | 'week'
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

  // 公休灰塊：找出 revenue===0 的連續區間，畫成淡灰背景 + 「公休」label
  // 只對日視圖做
  const closedBlocks: Array<{ x1: number; x2: number; midX: number }> = []
  if (granularity === 'day') {
    const step = data.length > 1 ? innerW / (data.length - 1) : innerW
    let runStart = -1
    for (let i = 0; i <= points.length; i++) {
      const isZero = i < points.length && data[i].revenue === 0
      if (isZero && runStart === -1) runStart = i
      if ((!isZero || i === points.length) && runStart !== -1) {
        const a = points[runStart].x - step / 2
        const b = points[i - 1].x + step / 2
        closedBlocks.push({
          x1: Math.max(padding.left, a),
          x2: Math.min(padding.left + innerW, b),
          midX: (points[runStart].x + points[i - 1].x) / 2,
        })
        runStart = -1
      }
    }
  }

  // 移動平均：再畫一條疊在上方
  const maRaw = showMovingAvg ? computeMovingAvg(data, 7) : []
  const maPoints = showMovingAvg
    ? maRaw.map((v, i) => {
        if (v === null) return null
        return {
          x: points[i].x,
          y: padding.top + innerH - (v / maxRev) * innerH,
        }
      })
    : []
  // MA 也以 null 為斷點切段
  const maSegments: Array<{ x: number; y: number }[]> = []
  {
    let cur: { x: number; y: number }[] = []
    for (const p of maPoints) {
      if (p === null) {
        if (cur.length) { maSegments.push(cur); cur = [] }
      } else {
        cur.push(p)
      }
    }
    if (cur.length) maSegments.push(cur)
  }

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

  // 主折線樣式：有 MA 時主線變細變淡
  const mainStrokeW = showMovingAvg ? 1.5 : 2.5
  const mainOpacity = showMovingAvg ? 0.7 : 1

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full block"
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      {/* 公休灰塊（畫在最底層）*/}
      {closedBlocks.map((b, i) => (
        <g key={`closed-${i}`}>
          <rect
            x={b.x1}
            y={padding.top}
            width={Math.max(0, b.x2 - b.x1)}
            height={innerH}
            fill="#F0EBE3"
            opacity={0.4}
          />
          <text
            x={b.midX}
            y={padding.top + 12}
            fontSize="9"
            fill="#B0A89A"
            textAnchor="middle"
          >
            公休
          </text>
        </g>
      ))}
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
      {/* 主折線（分段，遇公休斷開）*/}
      {segments.map((seg, i) => (
        <polyline
          key={`seg-${i}`}
          fill="none"
          stroke={stroke}
          strokeOpacity={mainOpacity}
          strokeWidth={mainStrokeW}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={seg.map(p => `${p.x},${p.y}`).join(' ')}
        />
      ))}
      {/* 端點（只在有營收的點）*/}
      {points.map((p, i) => (
        p.d.revenue > 0
          ? <circle key={i} cx={p.x} cy={p.y} r={showMovingAvg ? 2 : 3} fill={stroke} opacity={mainOpacity} />
          : null
      ))}
      {/* 7 日移動平均 overlay */}
      {showMovingAvg && maSegments.map((seg, i) => (
        <polyline
          key={`ma-${i}`}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={seg.map(p => `${p.x},${p.y}`).join(' ')}
        />
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
        const flipLeft = hover.x + tipPad + tipW > padding.left + innerW
        const rectX = flipLeft ? hover.x - tipPad - tipW : hover.x + tipPad
        const textX = flipLeft ? hover.x - tipPad - tipW + 8 : hover.x + 18
        const hd = data[hover.i]
        const isClosed = granularity === 'day' && hd.revenue === 0
        return (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padding.top} y2={padding.top + innerH}
              stroke={stroke} strokeOpacity={0.3} strokeDasharray="3 4" />
            {!isClosed && <circle cx={hover.x} cy={hover.y} r={5} fill={stroke} />}
            <rect x={rectX} y={hover.y - 36} width={tipW} height={42} rx={6} fill="#1A1A1A" />
            <text x={textX} y={hover.y - 20} fontSize="10" fill="#bbb">{hd.bucket}</text>
            <text x={textX} y={hover.y - 6} fontSize="12" fill="white">
              {isClosed
                ? '公休'
                : `NT$ ${fmtMoney(hd.revenue)} · ${hd.orders_count} 筆`
              }
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

  // ── 粒度自動 / 手動切換 ──
  // 規則：scope 改變時重設使用者選擇；series 長度 60+ 預設週、其它預設日；使用者手動覆蓋時 sticky
  const seriesLen = overview?.timeseries.length ?? 0
  const autoGranularity: Granularity = seriesLen > 60 ? 'week' : 'day'
  const [userGranularity, setUserGranularity] = useState<Granularity | null>(null)
  useEffect(() => { setUserGranularity(null) }, [scope, appliedFrom, appliedTo])
  const granularity: Granularity = userGranularity ?? autoGranularity
  const showGranularityPills = !isHourly && seriesLen >= 8
  // 8-60 天：開啟 7 日移動平均；其它（≤7 或週視圖）關閉
  const showMovingAvg = !isHourly && granularity === 'day' && seriesLen >= 8 && seriesLen <= 90

  const chartSeries = useMemo<SeriesPoint[]>(() => {
    if (!overview) return []
    if (isHourly) return overview.timeseries
    return granularity === 'week'
      ? aggregateToWeek(overview.timeseries)
      : overview.timeseries
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

            {/* ── KPI 4 顆 ── */}
            <div className="col-span-3">
              <KpiCard
                label={`${theme.label}營收`}
                value={`NT$ ${fmtMoney(summary.revenue)}`}
                sub={`vs ${summary.prev_label} NT$ ${fmtMoney(summary.prev_revenue)}`}
                accent={theme.hex}
                changePct={summary.change_pct}
                trend={overview!.kpi_trend_revenue}
              />
            </div>
            <div className="col-span-3">
              <KpiCard
                label="訂單數"
                value={String(summary.orders_count)}
                sub={`期間 ${overview!.range.from} → ${overview!.range.to}`}
                accent={theme.hex}
                trend={overview!.kpi_trend_orders}
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
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-ink-mute uppercase tracking-wider">
                      {isHourly
                        ? '今日各時段營收'
                        : granularity === 'week' ? '期間週營收趨勢' : '期間日營收趨勢'}
                    </p>
                    {showMovingAvg && (
                      <span className="text-[10px] text-ink-faint font-mono">＋7 日移動平均</span>
                    )}
                  </div>
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
                    showMovingAvg={showMovingAvg}
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
