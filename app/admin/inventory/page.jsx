'use client'
import { useState } from 'react'

// ============================================================
// 庫存管理頁面 — Mock Data Demo
// ============================================================

const MOCK_INVENTORY = [
  // --- 肉類 ---
  { id: 'I-01', name: '大比目魚排（扁鱈）', category: '肉類', unit: '片', stock: 18, safeStock: 10, supplier: '海鮮批發王' },
  { id: 'I-02', name: '豬排（無骨）',         category: '肉類', unit: '片', stock: 45, safeStock: 20, supplier: '肉品大王' },
  { id: 'I-03', name: '雞腿',                 category: '肉類', unit: '支', stock: 32, safeStock: 15, supplier: '大成長城' },
  { id: 'I-04', name: '豬五花',               category: '肉類', unit: '斤', stock: 8,  safeStock: 10, supplier: '肉品大王' },
  { id: 'I-05', name: '炸排骨（無骨）',       category: '肉類', unit: '片', stock: 28, safeStock: 15, supplier: '肉品大王' },
  { id: 'I-06', name: '帶骨排骨',             category: '肉類', unit: '片', stock: 22, safeStock: 15, supplier: '肉品大王' },
  { id: 'I-07', name: '牛肉片',               category: '肉類', unit: '斤', stock: 5,  safeStock: 8,  supplier: '牛肉專門店' },
  { id: 'I-08', name: '雞柳',                 category: '肉類', unit: '斤', stock: 12, safeStock: 8,  supplier: '大成長城' },
  { id: 'I-09', name: '豬肉片',               category: '肉類', unit: '斤', stock: 15, safeStock: 10, supplier: '肉品大王' },

  // --- 乾貨 / 配料 ---
  { id: 'I-10', name: '白米',                 category: '乾貨', unit: '公斤', stock: 60, safeStock: 30, supplier: '農會供銷部' },
  { id: 'I-11', name: '雞蛋',                 category: '乾貨', unit: '顆', stock: 90, safeStock: 50, supplier: '大成蛋品' },
  { id: 'I-12', name: '時蔬（當季）',         category: '乾貨', unit: '斤', stock: 14, safeStock: 10, supplier: '果菜市場' },
  { id: 'I-13', name: '菜脯',                 category: '乾貨', unit: '包', stock: 8,  safeStock: 5,  supplier: '南北雜貨行' },
  { id: 'I-14', name: '滷包（中藥材）',       category: '乾貨', unit: '包', stock: 5,  safeStock: 3,  supplier: '南北雜貨行' },
  { id: 'I-15', name: '沙茶醬',               category: '調味料', unit: '罐', stock: 6,  safeStock: 4,  supplier: '南北雜貨行' },
  { id: 'I-16', name: '紅麴醬',               category: '調味料', unit: '罐', stock: 4,  safeStock: 3,  supplier: '南北雜貨行' },
  { id: 'I-17', name: '醬油',                 category: '調味料', unit: '桶', stock: 3,  safeStock: 2,  supplier: '南北雜貨行' },
  { id: 'I-18', name: '食用油',               category: '調味料', unit: '桶', stock: 2,  safeStock: 2,  supplier: '南北雜貨行' },

  // --- 耗材 ---
  { id: 'I-19', name: '便當盒（附蓋）',       category: '耗材', unit: '組', stock: 200, safeStock: 100, supplier: '包材行' },
  { id: 'I-20', name: '免洗筷',               category: '耗材', unit: '雙', stock: 500, safeStock: 200, supplier: '包材行' },
]

const CATEGORIES = ['全部', '肉類', '乾貨', '調味料', '耗材']

// ============================================================
// 主元件
// ============================================================
export default function InventoryPage() {
  const [activeCategory, setActiveCategory] = useState('全部')
  const [search, setSearch] = useState('')

  // 過濾
  const filtered = MOCK_INVENTORY.filter(item => {
    const matchCategory = activeCategory === '全部' || item.category === activeCategory
    const matchSearch = search === '' || item.name.includes(search) || item.id.toLowerCase().includes(search.toLowerCase())
    return matchCategory && matchSearch
  })

  // 狀態標籤
  const getStatus = (stock, safe) => {
    if (stock <= safe * 0.5) return { label: '不足', color: 'bg-red-100 text-red-700' }
    if (stock <= safe) return { label: '偏低', color: 'bg-yellow-100 text-yellow-700' }
    return { label: '充足', color: 'bg-green-100 text-green-700' }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">

      {/* 頁首 */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">📦 庫存管理</h1>
            <p className="text-sm text-gray-500 mt-1">Mock Demo — 正式版將從 SQLite 讀取</p>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
            + 新增品項
          </button>
        </div>

        {/* 搜尋列 + 分類標籤 */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="搜尋品名或代碼..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <div className="flex gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 庫存表格 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-left">
                <th className="px-4 py-3 font-medium">代碼</th>
                <th className="px-4 py-3 font-medium">品名</th>
                <th className="px-4 py-3 font-medium">分類</th>
                <th className="px-4 py-3 font-medium">單位</th>
                <th className="px-4 py-3 font-medium text-right">目前庫存</th>
                <th className="px-4 py-3 font-medium text-right">安全存量</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">供應商</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const status = getStatus(item.stock, item.safeStock)
                return (
                  <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.id}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                    <td className="px-4 py-3 text-gray-500">{item.category}</td>
                    <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                    <td className="px-4 py-3 text-right font-mono">{item.stock}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{item.safeStock}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{item.supplier}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">沒有符合的品項</div>
          )}
        </div>

        {/* 摘要資訊 */}
        <div className="mt-6 flex gap-4">
          <div className="bg-white rounded-xl shadow-sm px-5 py-3 flex-1">
            <span className="text-xs text-gray-500">總品項</span>
            <p className="text-xl font-bold text-gray-800">{MOCK_INVENTORY.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-5 py-3 flex-1">
            <span className="text-xs text-gray-500">庫存不足</span>
            <p className="text-xl font-bold text-red-600">
              {MOCK_INVENTORY.filter(i => i.stock <= i.safeStock * 0.5).length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-5 py-3 flex-1">
            <span className="text-xs text-gray-500">偏低</span>
            <p className="text-xl font-bold text-yellow-600">
              {MOCK_INVENTORY.filter(i => i.stock > i.safeStock * 0.5 && i.stock <= i.safeStock).length}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}