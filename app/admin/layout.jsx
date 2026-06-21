'use client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { label: '概覽',     href: '/admin/dashboard' },
  { label: '當日訂單', href: '/admin' },
  { label: '庫存管理', href: '/admin/inventory' },
  { label: '菜單管理', href: '/admin/menu' },
  { label: '採購管理', href: '/admin/purchase' },
]

export default function AdminLayout({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [showPwModal, setShowPwModal] = useState(false)

  // 登入頁不套 admin 殼
  if (pathname === '/admin/login' || pathname?.startsWith('/admin/login/')) {
    return children
  }

  const isActive = (href) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* ignore */ }
    router.replace('/admin/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[200px] bg-white border-r border-border flex flex-col shrink-0">
        <a href="/admin" className="px-5 py-5 border-b border-border flex items-center gap-3 hover:bg-gray-50 transition-colors">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/jinhaoke-logo.webp"
            alt="金濠客食堂"
            className="w-12 h-12 rounded-full shrink-0 object-cover"
          />
          <div className="min-w-0">
            <h1 className="text-ink font-body text-sm font-bold leading-tight truncate">
              金濠客食堂
            </h1>
            <p className="text-ink-mute text-[11px] mt-0.5 font-body">
              後台管理
            </p>
          </div>
        </a>
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV.map(item => (
            <a
              key={item.label}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                              isActive(item.href)
                                ? 'font-medium text-clay bg-clay-soft'
                                : 'text-ink-mute hover:text-ink hover:bg-gray-100'
                            }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-border space-y-0.5">
          <button
            onClick={() => setShowPwModal(true)}
            className="w-full text-left px-3 py-2 rounded-md text-xs text-ink-mute hover:text-ink hover:bg-gray-100 transition-colors"
          >
            改密碼
          </button>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-md text-xs text-ink-mute hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            登出
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
      {showPwModal && (
        <PasswordInfoModal onClose={() => setShowPwModal(false)} />
      )}
    </div>
  )
}

function PasswordInfoModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-paper rounded-2xl shadow-lg border border-border/40 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink mb-3">修改密碼</h2>
        <p className="text-sm text-ink-mute mb-4 leading-relaxed">
          目前系統僅有一組管理員帳號，密碼 hash 儲存於伺服器環境變數中。
        </p>
        <div className="bg-gray-50 border border-border rounded-lg p-3 mb-4">
          <p className="text-xs text-ink font-mono mb-1">.env.local</p>
          <p className="text-xs text-ink-mute font-mono">ADMIN_PASSWORD_HASH=scrypt:...</p>
        </div>
        <p className="text-xs text-ink-mute mb-5">
          請直接編輯伺服器上的 <span className="font-mono">.env.local</span> 檔案，修改後重啟服務即生效。
        </p>
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 bg-clay text-white rounded-lg text-sm font-semibold hover:bg-clay-deep transition-colors"
        >
          了解
        </button>
      </div>
    </div>
  )
}

