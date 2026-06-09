'use client'
import { usePathname } from 'next/navigation'

const NAV = [
  { label: '概覽',     href: '/admin/dashboard' },
  { label: '當日訂單', href: '/admin' },
  { label: '庫存管理', href: '/admin/inventory' },
  { label: '菜單管理', href: '/admin/menu' },
  { label: '採購',     href: '/admin/purchase-orders' },
  { label: '採購管理', href: '/admin/purchase' },
  { label: '報表',     href: '/admin/reports' },
]

export default function AdminLayout({ children }) {
  const pathname = usePathname()

  const isActive = (href) => {
    if (href === '/admin') return pathname === '/admin'
    // /admin/purchase 不能蓋住 /admin/purchase-orders
    if (href === '/admin/purchase') {
      return pathname === '/admin/purchase' || pathname.startsWith('/admin/purchase/')
    }
    return pathname.startsWith(href)
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
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                isActive(item.href)
                  ? 'font-medium text-clay bg-clay-soft'
                  : 'text-ink-mute hover:text-ink hover:bg-gray-100'
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
