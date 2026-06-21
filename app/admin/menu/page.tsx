'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface MenuItem {
  餐點編號: number
  餐點名稱: string
  餐點分類: string
  餐點價格: number
  圖示: string
  分類標籤: string
  餐點描述: string
  上下架狀態: number
  圖片網址: string
}

type FormData = {
  餐點名稱: string
  餐點分類: string
  餐點價格: number
  圖示: string
  分類標籤: string
  餐點描述: string
  圖片網址: string
}

const DEFAULT_MENU_CATEGORIES = ['手作便當', '燴飯', '單點']
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  '便當': '手作便當',
}
const normalizeCategory = (c: string) => LEGACY_CATEGORY_MAP[c] ?? c

const PILL_INACTIVE = '已下架'

const EMPTY_FORM: FormData = {
  餐點名稱: '',
  餐點分類: '手作便當',
  餐點價格: 0,
  圖示: '',
  分類標籤: '',
  餐點描述: '',
  圖片網址: '',
}

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('全部')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MenuItem | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchMenu = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/menu?include_inactive=1')
      const data = await res.json()
      if (data.success) {
        setItems(data.data.map((r: Record<string, unknown>) => ({
          餐點編號: r.item_id,
          餐點名稱: r.name,
          餐點分類: r.category,
          餐點價格: r.price,
          圖示: r.emoji,
          分類標籤: r.tag,
          餐點描述: r.description,
          上下架狀態: r.active,
          圖片網址: r.image_url,
        })))
      } else setError(data.error || '讀取失敗')
    } catch {
      setError('網路錯誤')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMenu() }, [fetchMenu])

  const filtered = items.filter(item => {
    const matchSearch = search === '' || item.餐點名稱.includes(search)
    if (!matchSearch) return false

    if (activeCategory === PILL_INACTIVE) return item.上下架狀態 !== 1

    if (item.上下架狀態 !== 1) return false
    return (
      activeCategory === '全部' ||
      item.餐點分類 === activeCategory ||
      normalizeCategory(item.餐點分類) === activeCategory
    )
  })

  const totalItems = items.filter(i => i.上下架狀態 === 1).length
  const inactiveCount = items.filter(i => i.上下架狀態 !== 1).length
  const categoryCount = new Set(
    items.filter(i => i.上下架狀態 === 1).map(i => normalizeCategory(i.餐點分類))
  ).size

  const dynamicCategorySet = new Set<string>(DEFAULT_MENU_CATEGORIES)
  for (const i of items) {
    if (!i.餐點分類 || i.上下架狀態 !== 1) continue
    dynamicCategorySet.add(normalizeCategory(i.餐點分類))
  }
  const CATEGORIES = ['全部', ...Array.from(dynamicCategorySet)]
  const MENU_CATEGORIES = Array.from(dynamicCategorySet)

  const groupedByCategory: Array<{ category: string; items: MenuItem[] }> = (() => {
    const order = Array.from(dynamicCategorySet)
    const map = new Map<string, MenuItem[]>()
    for (const it of filtered) {
      const cat = normalizeCategory(it.餐點分類) || '其他'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(it)
    }
    const seen = new Set<string>()
    const out: Array<{ category: string; items: MenuItem[] }> = []
    for (const cat of order) {
      if (map.has(cat)) {
        out.push({ category: cat, items: map.get(cat)! })
        seen.add(cat)
      }
    }
    for (const [cat, list] of map) {
      if (!seen.has(cat)) out.push({ category: cat, items: list })
    }
    return out
  })()

  const resetFileState = () => {
    setPendingFile(null)
    setPendingPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openNew = () => {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    resetFileState()
    setModalOpen(true)
  }

  const openEdit = (item: MenuItem) => {
    setEditTarget(item)
    setForm({
      餐點名稱: item.餐點名稱,
      餐點分類: normalizeCategory(item.餐點分類),
      餐點價格: item.餐點價格,
      圖示: item.圖示,
      分類標籤: item.分類標籤,
      餐點描述: item.餐點描述 || '',
      圖片網址: item.圖片網址 || '',
    })
    setFormError(null)
    resetFileState()
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditTarget(null)
    setFormError(null)
    resetFileState()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (!file) {
      setPendingFile(null)
      setPendingPreview(null)
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormError('圖片需小於 2MB')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('僅支援 JPEG / PNG / WebP')
      return
    }
    setFormError(null)
    setPendingFile(file)
    const reader = new FileReader()
    reader.onload = () => setPendingPreview(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  const uploadImage = async (itemId: number, file: File): Promise<boolean> => {
    const fd = new globalThis.FormData()
    fd.append('file', file)
    fd.append('item_id', String(itemId))
    try {
      const res = await fetch('/api/menu/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.success) {
        setFormError(data.error || '圖片上傳失敗')
        return false
      }
      return true
    } catch {
      setFormError('圖片上傳失敗（網路錯誤）')
      return false
    }
  }

  const handleSubmit = async () => {
    if (!form.餐點名稱.trim() || !form.餐點分類 || form.餐點價格 <= 0) {
      setFormError('品名、分類、價格為必填，價格需大於 0')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const url = editTarget ? `/api/menu/${editTarget.餐點編號}` : '/api/menu'
      const method = editTarget ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, 上下架狀態: editTarget ? editTarget.上下架狀態 : 1 }),
      })
      const data = await res.json()
      if (!data.success) {
        setFormError(data.error || '儲存失敗')
        setSubmitting(false)
        return
      }

      const targetId = editTarget ? editTarget.餐點編號 : data.data?.item_id
      if (pendingFile && targetId) {
        const ok = await uploadImage(targetId, pendingFile)
        if (!ok) {
          setSubmitting(false)
          await fetchMenu()
          return
        }
      }

      closeModal()
      fetchMenu()
    } catch {
      setFormError('網路錯誤')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (item: MenuItem) => {
    if (!window.confirm(`確定要下架「${item.餐點名稱}」？`)) return
    try {
      const res = await fetch(`/api/menu/${item.餐點編號}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) fetchMenu()
    } catch {
      // silent
    }
  }

  const handleReactivate = async (item: MenuItem) => {
    try {
      const res = await fetch(`/api/menu/${item.餐點編號}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 上下架狀態: 1 }),
      })
      const data = await res.json()
      if (data.success) fetchMenu()
    } catch {
      // silent
    }
  }

  const handlePermanentDelete = async (item: MenuItem) => {
    if (!window.confirm(`確定要永久刪除「${item.餐點名稱}」？此操作無法復原。`)) return
    try {
      const res = await fetch(`/api/menu/${item.餐點編號}?permanent=1`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) fetchMenu()
      else alert(data.error || '刪除失敗')
    } catch {
      alert('網路錯誤')
    }
  }

  return (
    <>
      <header className="h-16 bg-white border-b border-border flex items-center px-8 shrink-0">
        <h2 className="text-ink font-body font-semibold text-sm tracking-wide">
          菜單管理
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
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-sm px-5 py-4">
                <span className="text-xs text-ink/40 uppercase tracking-wide">上架品項</span>
                <p className="text-2xl font-bold text-ink mt-1">{totalItems}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm px-5 py-4">
                <span className="text-xs text-ink/40 uppercase tracking-wide">分類數</span>
                <p className="text-2xl font-bold text-ink mt-1">{categoryCount}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm px-5 py-4">
                <span className="text-xs text-ink/40 uppercase tracking-wide">篩選顯示</span>
                <p className="text-2xl font-bold text-ink mt-1">{filtered.length}</p>
              </div>
            </div>

            {/* Search + Filter */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <input
                type="text"
                placeholder="搜尋品名…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-sm w-64 bg-white focus:outline-none focus:ring-2 focus:ring-clay"
              />
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      activeCategory === cat
                        ? 'bg-gray-500 text-white'
                        : 'bg-white text-ink/60 border border-border hover:bg-gray-50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                <button
                  onClick={() => setActiveCategory(PILL_INACTIVE)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors inline-flex items-center gap-1.5 ${
                    activeCategory === PILL_INACTIVE
                      ? 'bg-red-500 text-white'
                      : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'
                  }`}
                >
                  已下架
                  {inactiveCount > 0 && (
                    <span
                      className={`px-1.5 py-[1px] rounded-full text-[10px] font-bold ${
                        activeCategory === PILL_INACTIVE ? 'bg-white/30 text-white' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {inactiveCount}
                    </span>
                  )}
                </button>
              </div>
              <div className="flex-1" />
            </div>

            {/* Item list grouped by category */}
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm text-center py-12 text-ink/30">
                {items.length === 0 ? '尚無品項' : '沒有符合的品項'}
              </div>
            ) : (
              <div className="space-y-6">
                {groupedByCategory.map(group => (
                  <section key={group.category} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center px-5 py-3 bg-clay-soft/40 border-b-2 border-clay/40">
                      <span className="text-sm font-semibold text-clay tracking-wide whitespace-nowrap">
                        {group.category}
                      </span>
                      <span className="ml-2 text-[11px] text-clay/60 font-mono">
                        {group.items.length} 項
                      </span>
                      <span className="flex-1 ml-3 border-t border-clay/40"></span>
                    </div>

                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col className="w-16" />
                        <col className="w-[24%]" />
                        <col className="w-[10%]" />
                        <col className="w-[8%]" />
                        <col />
                        <col className="w-[22%]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-gray-50/60 text-ink/50 text-left text-xs uppercase tracking-wide">
                          <th className="px-4 py-2 font-medium text-center">圖片</th>
                          <th className="px-4 py-2 font-medium">品名</th>
                          <th className="px-4 py-2 font-medium">標籤</th>
                          <th className="px-4 py-2 font-medium text-right">價格</th>
                          <th className="px-4 py-2 font-medium">描述</th>
                          <th className="px-4 py-2 font-medium text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item, idx) => {
                          const inactive = item.上下架狀態 !== 1
                          const baseRow = inactive
                            ? 'bg-gray-100/60'
                            : idx % 2 === 0
                              ? 'bg-white'
                              : 'bg-gray-50/20'
                          return (
                            <tr
                              key={item.餐點編號}
                              className={`border-t border-gray-200 hover:bg-gray-50/50 transition-colors ${baseRow}`}
                            >
                              <td className={`px-4 py-3 text-center ${inactive ? 'opacity-50' : ''}`}>
                                {item.圖片網址 ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={item.圖片網址}
                                    alt={item.餐點名稱}
                                    className="w-10 h-10 rounded-md object-cover inline-block"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-md bg-gray-100 inline-flex items-center justify-center text-[10px] text-ink/30">
                                    無圖
                                  </div>
                                )}
                              </td>
                              <td className={`px-4 py-3 truncate ${inactive ? 'opacity-50' : ''}`}>
                                <span className="font-medium text-ink">{item.餐點名稱}</span>
                                {inactive && (
                                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 align-middle opacity-100">
                                    已下架
                                  </span>
                                )}
                              </td>
                              <td className={`px-4 py-3 text-ink/50 text-xs truncate ${inactive ? 'opacity-50' : ''}`}>{item.分類標籤 || '—'}</td>
                              <td className={`px-4 py-3 text-right font-mono font-semibold text-ink ${inactive ? 'opacity-50' : ''}`}>
                                ${item.餐點價格}
                              </td>
                              <td className={`px-4 py-3 text-xs text-ink/50 truncate ${inactive ? 'opacity-50' : ''}`}>
                                {item.餐點描述 || '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-2 flex-nowrap">
                                  <button
                                    onClick={() => openEdit(item)}
                                    className="px-3 py-1 text-xs rounded-md bg-clay-soft text-clay-deep border border-clay-deep/30 hover:bg-clay-deep hover:text-white transition-colors font-medium whitespace-nowrap"
                                  >
                                    編輯
                                  </button>
                                  {inactive ? (
                                    <>
                                      <button
                                        onClick={() => handleReactivate(item)}
                                        className="px-3 py-1 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors font-medium whitespace-nowrap"
                                      >
                                        重新上架
                                      </button>
                                      <button
                                        onClick={() => handlePermanentDelete(item)}
                                        className="px-3 py-1 text-xs rounded-md border border-red-300 text-red-700 bg-red-50 hover:bg-red-600 hover:text-white transition-colors font-medium whitespace-nowrap"
                                      >
                                        刪除
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => handleDelete(item)}
                                      className="px-3 py-1 text-xs rounded-md border border-red-300 text-red-700 bg-red-50 hover:bg-red-600 hover:text-white transition-colors font-medium whitespace-nowrap"
                                    >
                                      下架
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-ink text-base">
                {editTarget ? `編輯「${editTarget.餐點名稱}」` : '新增品項'}
              </h3>
              <button
                onClick={closeModal}
                className="text-ink/40 hover:text-ink text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault()
                if (!submitting) handleSubmit()
              }}
            >
            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {/* image upload */}
              <div>
                <label className="text-xs text-ink/50 mb-1 block">圖片</label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-lg bg-gray-50 border border-border flex items-center justify-center overflow-hidden shrink-0">
                    {pendingPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pendingPreview} alt="預覽" className="w-full h-full object-cover" />
                    ) : form.圖片網址 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.圖片網址} alt="目前圖片" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[11px] text-ink/40 text-center px-2">尚未上傳</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="block w-full text-xs text-ink/70 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-border file:bg-white file:text-clay file:text-xs file:cursor-pointer file:hover:bg-gray-50"
                    />
                    <p className="text-[11px] text-ink/40 mt-1">JPEG / PNG / WebP，≤ 2MB</p>
                  </div>
                </div>
              </div>

              {/* name */}
              <div>
                <label className="text-xs text-ink/50 mb-1 block">
                  品名 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.餐點名稱}
                  onChange={e => setForm(f => ({ ...f, 餐點名稱: e.target.value }))}
                  placeholder="酥炸豬排便當"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                />
              </div>

              {/* category + price */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-ink/50 mb-1 block">
                    分類 <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={form.餐點分類}
                    onChange={e => setForm(f => ({ ...f, 餐點分類: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-clay"
                  >
                    {MENU_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <label className="text-xs text-ink/50 mb-1 block">
                    價格 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={form.餐點價格}
                    onChange={e => setForm(f => ({ ...f, 餐點價格: Number(e.target.value) }))}
                    min={1}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-clay"
                  />
                </div>
              </div>

              {/* tag */}
              <div>
                <label className="text-xs text-ink/50 mb-1 block">標籤</label>
                <select
                  value={form.分類標籤}
                  onChange={e => setForm(f => ({ ...f, 分類標籤: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-clay"
                >
                  {['豬', '雞', '牛', '魚', '其他'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* description */}
              <div>
                <label className="text-xs text-ink/50 mb-1 block">餐點描述</label>
                <textarea
                  value={form.餐點描述}
                  onChange={e => setForm(f => ({ ...f, 餐點描述: e.target.value }))}
                  rows={2}
                  placeholder="簡短說明…"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-clay"
                />
              </div>

              {formError && (
                <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-sm text-ink/50 hover:text-ink transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-clay-deep transition-colors font-medium disabled:opacity-50"
              >
                {submitting ? '儲存中…' : '儲存'}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
