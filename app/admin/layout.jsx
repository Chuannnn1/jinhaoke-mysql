'use client'
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
        <div className="px-5 py-5 border-b border-border">
          <h1 className="text-ink font-body text-lg font-bold">
            金濠客食堂
          </h1>
          <p className="text-ink-mute text-[11px] mt-0.5 font-body">
            後台管理
          </p>
        </div>
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
        <div className="px-3 py-3 border-t border-border">
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
    </div>
  )
}
