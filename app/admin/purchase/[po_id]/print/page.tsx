'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

// ============================================================
// 採購單列印頁 /admin/purchase/[po_id]/print
//
// 採用純 HTML/CSS 排版（無 PDF 套件依賴）。
// 老闆按瀏覽器列印（或 Ctrl+P / 「列印 PO」按鈕）就會輸出 A4 採購單。
//
// @media print 會：
//   - 隱藏頂部工具列、sidebar、列印按鈕
//   - 把單據放滿頁面、調整字級與留白
// ============================================================

interface POItem {
  ingredient_name: string
  order_qty: number
  total_cost: number
}

interface PO {
  po_id: number
  po_date: string
  supplier_name: string
  total_amount: number
  status: string
  items: POItem[]
}

interface IngredientMeta {
  name: string
  stock_unit: string
  order_unit: string
  qty_per_order_unit: number
}

interface Supplier {
  name: string
  phone: string | null
}

const STORE_NAME = '金濠客食堂'
const STORE_ADDR = '嘉義市某路某號'  // mock，之後可從 settings 撈
const STORE_PHONE = '05-XXX-XXXX'

function formatMoney(n: number) {
  return Number(n || 0).toLocaleString('zh-TW')
}

function formatQty(n: number) {
  if (!Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(1)
}

export default function PurchaseOrderPrintPage() {
  const params = useParams<{ po_id: string }>()
  const poId = params?.po_id
  const [po, setPo] = useState<PO | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [ingMeta, setIngMeta] = useState<Map<string, IngredientMeta>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    if (!poId) return
    setLoading(true)
    try {
      const [poRes, supRes, ingRes] = await Promise.all([
        fetch(`/api/purchase/${poId}`).then(r => r.json()),
        fetch('/api/suppliers').then(r => r.json()),
        fetch('/api/inventory').then(r => r.json()),
      ])
      if (!poRes.success) {
        setError(poRes.error || '找不到採購單')
        return
      }
      setPo(poRes.data)
      if (supRes.success) {
        const s = (supRes.data as Supplier[]).find(x => x.name === poRes.data.supplier_name) ?? null
        setSupplier(s)
      }
      if (ingRes.success) {
        const m = new Map<string, IngredientMeta>()
        for (const ing of ingRes.data as IngredientMeta[]) m.set(ing.name, ing)
        setIngMeta(m)
      }
    } catch {
      setError('網路錯誤')
    } finally {
      setLoading(false)
    }
  }, [poId])

  useEffect(() => { loadAll() }, [loadAll])

  if (loading) {
    return <div className="p-12 text-ink/40">載入中…</div>
  }
  if (error || !po) {
    return <div className="p-12 text-red-500">{error || '找不到採購單'}</div>
  }

  const printedAt = new Date().toLocaleString('zh-TW', { hour12: false })

  return (
    <div className="po-print-root min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      {/* 工具列 — 列印時隱藏 */}
      <div className="print:hidden max-w-[820px] mx-auto mb-4 flex items-center justify-between px-4">
        <a href="/admin/purchase" className="text-sm text-ink/50 hover:text-clay">← 回採購管理</a>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-clay text-white text-sm rounded-lg hover:bg-clay-deep transition-colors font-medium"
        >
          🖨 列印 / 存成 PDF
        </button>
      </div>

      {/* 採購單本體 */}
      <div className="po-sheet mx-auto bg-white shadow-md print:shadow-none">
        {/* 抬頭 */}
        <div className="border-b-2 border-black px-10 py-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">{STORE_NAME}</h1>
            <p className="text-xs text-gray-500 mt-1">{STORE_ADDR} · TEL {STORE_PHONE}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tracking-[0.3em]">採購單</p>
            <p className="text-xs text-gray-500 mt-1">PURCHASE ORDER</p>
          </div>
        </div>

        {/* Meta：PO 編號、日期、供應商 */}
        <div className="grid grid-cols-2 gap-x-12 gap-y-3 px-10 py-5 text-sm border-b border-gray-300">
          <Field label="採購單號" value={`PO-${String(po.po_id).padStart(6, '0')}`} mono />
          <Field label="開單日期" value={po.po_date} mono />
          <Field label="供應商" value={po.supplier_name} bold />
          <Field label="供應商電話" value={supplier?.phone || '—'} mono />
          <Field label="狀態" value={po.status} />
          <Field label="列印時間" value={printedAt} mono />
        </div>

        {/* 明細表 */}
        <div className="px-10 py-5">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="py-2 w-10">#</th>
                <th className="py-2">食材名稱</th>
                <th className="py-2 text-right w-28">叫貨數量</th>
                <th className="py-2 text-right w-24">單位</th>
                <th className="py-2 text-right w-28">預估成本</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((it, i) => {
                const meta = ingMeta.get(it.ingredient_name)
                return (
                  <tr key={it.ingredient_name} className="border-b border-gray-200">
                    <td className="py-2 text-gray-500">{i + 1}</td>
                    <td className="py-2">{it.ingredient_name}</td>
                    <td className="py-2 text-right font-mono">{formatQty(it.order_qty)}</td>
                    <td className="py-2 text-right text-gray-600">{meta?.stock_unit ?? '—'}</td>
                    <td className="py-2 text-right font-mono">
                      {it.total_cost > 0 ? `NT$ ${formatMoney(it.total_cost)}` : '—'}
                    </td>
                  </tr>
                )
              })}
              {/* 補空白行，讓整張看起來像表單（最多 8 行） */}
              {Array.from({ length: Math.max(0, 8 - po.items.length) }).map((_, i) => (
                <tr key={`pad-${i}`} className="border-b border-gray-200">
                  <td className="py-2 text-gray-300">{po.items.length + i + 1}</td>
                  <td className="py-2">&nbsp;</td>
                  <td className="py-2"></td>
                  <td className="py-2"></td>
                  <td className="py-2"></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black">
                <td colSpan={4} className="py-3 text-right font-semibold">合計 TOTAL</td>
                <td className="py-3 text-right font-mono font-bold">
                  NT$ {formatMoney(po.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 備註 + 簽章 */}
        <div className="px-10 pb-8 pt-2">
          <div className="text-xs text-gray-500 mb-6">
            <p className="font-semibold text-gray-700 mb-1">備註</p>
            <div className="border border-gray-300 rounded h-16"></div>
          </div>
          <div className="grid grid-cols-3 gap-8 text-xs">
            <SignBox label="採購人簽章" />
            <SignBox label="廠商確認" />
            <SignBox label="驗收人簽章" />
          </div>
        </div>
      </div>

      <style jsx global>{`
        .po-sheet {
          width: 210mm;
          min-height: 297mm;
          box-sizing: border-box;
        }
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: white !important; }
          /* 隱藏 admin layout 的 sidebar / header */
          aside, header, nav { display: none !important; }
          .po-print-root { padding: 0 !important; }
          .po-sheet { width: 100%; min-height: auto; box-shadow: none; }
        }
      `}</style>
    </div>
  )
}

function Field({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      <span className={`flex-1 border-b border-gray-300 pb-0.5 ${mono ? 'font-mono' : ''} ${bold ? 'font-semibold text-base' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function SignBox({ label }: { label: string }) {
  return (
    <div>
      <p className="text-gray-500 mb-1">{label}</p>
      <div className="border-b border-black h-12"></div>
    </div>
  )
}
