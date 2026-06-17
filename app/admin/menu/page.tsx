'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface MenuItem {
  item_id: number
  name: string
  category: string
  price: number
  emoji: string
  tag: string
  sub: string
  option: string
  description: string
  is_active: number
  image_url: string
}

type FormData = {
  name: string
  category: string
  price: number
  emoji: string
  tag: string
  sub: string
  option: string
  description: string
  image_url: string
}

// 預設分類（即使 DB 還沒任何 item 也會顯示）
const DEFAULT_MENU_CATEGORIES = ['手作便當', '燴飯', '單點']
// 舊資料（後台手動誤加）會有「便當」，UI 上一律歸到「手作便當」
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  '便當': '手作便當',
}
const normalizeCategory = (c: string) => LEGACY_CATEGORY_MAP[c] ?? c

// 特殊膠囊：選中時只顯示已下架品項（不受 category 限制）
const PILL_INACTIVE = '已下架'

const EMPTY_FORM: FormData = {
  name: '',
  category: '手作便當',
  price: 0,
  emoji: '',
  tag: '',
  sub: '',
  option: '',
  description: '',
  image_url: '',
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
      // 一律抓全部（含已下架）；前端用「已下架」膠囊切換顯示
      const res = await fetch('/api/menu?include_inactive=1')
      const data = await res.json()
      if (data.success) setItems(data.data)
      else setError(data.error || '讀取失敗')
    } catch {
      setError('網路錯誤')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMenu() }, [fetchMenu])

  const filtered = items.filter(item => {
    const matchSearch = search === '' || item.name.includes(search)
    if (!matchSearch) return false

    // 「已下架」膠囊：只顯示 is_active = 0，不再受 category 限制
    if (activeCategory === PILL_INACTIVE) return item.is_active !== 1

    // 其餘膠囊只看上架中
    if (item.is_active !== 1) return false
    return (
      activeCategory === '全部' ||
      item.category === activeCategory ||
      normalizeCategory(item.category) === activeCategory
    )
  })

  const totalItems = items.filter(i => i.is_active === 1).length
  const inactiveCount = items.filter(i => i.is_active !== 1).length
  const categoryCount = new Set(
    items.filter(i => i.is_active === 1).map(i => normalizeCategory(i.category))
  ).size

  // 動態組合 filter chip：預設 + 實際 DB 出現的分類（先 normalize 去掉舊「便當」）
  // 已下架的品項分類不會擠進這份清單（避免出現只剩已下架的舊分類）
  const dynamicCategorySet = new Set<string>(DEFAULT_MENU_CATEGORIES)
  for (const i of items) {
    if (!i.category || i.is_active !== 1) continue
    dynamicCategorySet.add(normalizeCategory(i.category))
  }
  const CATEGORIES = ['全部', ...Array.from(dynamicCategorySet)]
  // 新增/編輯 form 的下拉選項（不含「全部」，也不含舊「便當」）
  const MENU_CATEGORIES = Array.from(dynamicCategorySet)

  // 把篩出來的品項依分類分組，渲染時做 section 標題
  const groupedByCategory: Array<{ category: string; items: MenuItem[] }> = (() => {
    const order = Array.from(dynamicCategorySet)
    const map = new Map<string, MenuItem[]>()
    for (const it of filtered) {
      const cat = normalizeCategory(it.category) || '其他'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(it)
    }
    // 先照 DEFAULT_MENU_CATEGORIES 的順序排，剩下的補後面
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
      name: item.name,
      // 編輯時把舊「便當」正規化為「手作便當」，存檔時順手 migrate
      category: normalizeCategory(item.category),
      price: item.price,
      emoji: item.emoji,
      tag: item.tag,
      sub: item.sub,
      option: item.option,
      description: item.description,
      image_url: item.image_url || '',
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
    if (!form.name.trim() || !form.category || form.price <= 0) {
      setFormError('品名、分類、價格為必填，價格需大於 0')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const url = editTarget ? `/api/menu/${editTarget.item_id}` : '/api/menu'
      const method = editTarget ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, is_active: editTarget ? editTarget.is_active : 1 }),
      })
      const data = await res.json()
      if (!data.success) {
        setFormError(data.error || '儲存失敗')
        setSubmitting(false)
        return
      }

      const targetId = editTarget ? editTarget.item_id : data.data?.item_id
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
    if (!window.confirm(`確定要下架「${item.name}」？`)) return
    try {
      const res = await fetch(`/api/menu/${item.item_id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) fetchMenu()
    } catch {
      // silent
    }
  }

  const handleReactivate = async (item: MenuItem) => {
    try {
      const res = await fetch(`/api/menu/${item.item_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: 1 }),
      })
      const data = await res.json()
      if (data.success) fetchMenu()
    } catch {
      // silent
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
                {/* 已下架特殊膠囊：點下去只看下架的品項 */}
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
              <button
                onClick={openNew}
                className="px-4 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-clay-deep transition-colors font-medium"
              >
                + 新增品項
              </button>
            </div>

            {/* 分組品項列表（每個 category 一段 + 全寬橫線分隔） */}
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm text-center py-12 text-ink/30">
                {items.length === 0 ? '尚無品項' : '沒有符合的品項'}
              </div>
            ) : (
              <div className="space-y-6">
                {groupedByCategory.map(group => (
                  <section key={group.category} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    {/* Section header — 全寬橫線到底 */}
                    <div className="flex items-center px-5 py-3 bg-clay-soft/40 border-b-2 border-clay/40">
                      <span className="text-sm font-semibold text-clay tracking-wide whitespace-nowrap">
                        {group.category}
                      </span>
                      <span className="ml-2 text-[11px] text-clay/60 font-mono">
                        {group.items.length} 項
                      </span>
                      <span className="flex-1 ml-3 border-t border-clay/40"></span>
                    </div>

                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/60 text-ink/50 text-left text-xs uppercase tracking-wide">
                          <th className="px-4 py-2 font-medium w-16 text-center">圖片</th>
                          <th className="px-4 py-2 font-medium">品名</th>
                          <th className="px-4 py-2 font-medium">標籤</th>
                          <th className="px-4 py-2 font-medium text-right">價格</th>
                          <th className="px-4 py-2 font-medium">副標 / 選項</th>
                          <th className="px-4 py-2 font-medium text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item, idx) => {
                          const inactive = item.is_active !== 1
                          const baseRow = inactive
                            ? 'opacity-60 bg-gray-100/60'
                            : idx % 2 === 0
                              ? 'bg-white'
                              : 'bg-gray-50/20'
                          return (
                            <tr
                              key={item.item_id}
                              className={`border-t border-gray-200 hover:bg-gray-50/50 transition-colors ${baseRow}`}
                            >
                              <td className="px-4 py-3 text-center">
                                {item.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={item.image_url}
                                    alt={item.name}
                                    className="w-10 h-10 rounded-md object-cover inline-block"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-md bg-gray-100 inline-flex items-center justify-center text-[10px] text-ink/30">
                                    無圖
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-medium text-ink">{item.name}</span>
                                {inactive && (
                                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 align-middle">
                                    已下架
                                  </span>
                                )}
                                {item.description && (
                                  <p className="text-xs text-ink/40 mt-0.5 truncate max-w-[180px]">
                                    {item.description}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-ink/50 text-xs">{item.tag || '—'}</td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                                ${item.price}
                              </td>
                              <td className="px-4 py-3 text-xs text-ink/50">
                                {[item.sub, item.option].filter(Boolean).join(' · ') || '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => openEdit(item)}
                                    className="px-3 py-1 text-xs rounded-md border border-border text-clay hover:bg-gray-50 transition-colors"
                                  >
                                    編輯
                                  </button>
                                  {inactive ? (
                                    <button
                                      onClick={() => handleReactivate(item)}
                                      className="px-3 py-1 text-xs rounded-md border border-green-200 text-green-600 hover:bg-green-50 transition-colors"
                                    >
                                      重新上架
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleDelete(item)}
                                      className="px-3 py-1 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
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
                {editTarget ? `編輯「${editTarget.name}」` : '新增品項'}
              </h3>
              <button
                onClick={closeModal}
                className="text-ink/40 hover:text-ink text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* 包成 form：所有單行 input 按 Enter 即可送出儲存；textarea 保持換行行為 */}
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
                    ) : form.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.image_url} alt="目前圖片" className="w-full h-full object-cover" />
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
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
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
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
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
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                    min={1}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-clay"
                  />
                </div>
              </div>

              {/* tag */}
              <div>
                <label className="text-xs text-ink/50 mb-1 block">標籤</label>
                <input
                  type="text"
                  value={form.tag}
                  onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
                  placeholder="豬、雞、魚…"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                />
              </div>

              {/* sub + option */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-ink/50 mb-1 block">副標題</label>
                  <input
                    type="text"
                    value={form.sub}
                    onChange={e => setForm(f => ({ ...f, sub: e.target.value }))}
                    placeholder="扁鱈"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-ink/50 mb-1 block">選項</label>
                  <input
                    type="text"
                    value={form.option}
                    onChange={e => setForm(f => ({ ...f, option: e.target.value }))}
                    placeholder="加辣+10"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                  />
                </div>
              </div>

              {/* description */}
              <div>
                <label className="text-xs text-ink/50 mb-1 block">描述</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
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
