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
        <ChangePasswordModal onClose={() => setShowPwModal(false)} />
      )}
    </div>
  )
}

function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (next.length < 6) {
      setError('新密碼至少 6 字')
      return
    }
    if (next !== confirm) {
      setError('兩次新密碼不一致')
      return
    }
    if (next === current) {
      setError('新密碼不能跟當前一樣')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, new_password: next }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || '改密碼失敗')
        setSubmitting(false)
        return
      }
      setDone(true)
      setSubmitting(false)
    } catch {
      setError('網路錯誤')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-paper rounded-2xl shadow-lg border border-border/40 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink mb-1">改密碼</h2>
        <p className="text-xs text-ink-mute mb-5">
          {done
            ? '新密碼已生效，下次登入請用新密碼。'
            : '請先確認當前密碼，再設定新密碼。設定後立即生效，目前的登入 session 不會被踢出。'}
        </p>

        {done ? (
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-clay text-white rounded-lg text-sm font-semibold hover:bg-clay-deep transition-colors"
          >
            完成
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field
              id="cur" label="當前密碼" value={current} onChange={setCurrent}
              autoComplete="current-password" autoFocus
            />
            <Field
              id="new" label="新密碼（至少 6 字）" value={next} onChange={setNext}
              autoComplete="new-password"
            />
            <Field
              id="new2" label="確認新密碼" value={confirm} onChange={setConfirm}
              autoComplete="new-password"
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-white border border-border text-ink rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting || !current || !next || !confirm}
                className="flex-1 px-4 py-2.5 bg-clay text-white rounded-lg text-sm font-semibold hover:bg-clay-deep transition-colors disabled:opacity-50"
              >
                {submitting ? '更新中…' : '確認更改'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Field({ id, label, value, onChange, autoComplete, autoFocus }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-ink-mute uppercase tracking-wider block mb-1">
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
        placeholder="••••••••"
      />
    </div>
  )
}
