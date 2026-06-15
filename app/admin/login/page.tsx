'use client'
// 後台登入頁
// - 沒 cookie 從 middleware 被導過來
// - 輸入密碼 → POST /api/auth/login → 種 cookie → 跳回原本要去的路徑（?from=...）
import { useState, FormEvent, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams?.get('from') || '/admin'

  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 已登入則直接跳走，不顯示登入頁
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.authed) router.replace(from) })
      .catch(() => { /* ignore */ })
  }, [router, from])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || '登入失敗')
        setSubmitting(false)
        return
      }
      router.replace(from)
    } catch {
      setError('網路錯誤')
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm bg-paper rounded-2xl shadow-md border border-border/40 p-8">
        <h1 className="text-xl font-bold text-ink mb-1">金濠客 — 後台登入</h1>
        <p className="text-xs text-ink-mute mb-6">輸入管理密碼以進入後台。登入有效期 30 天。</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pw" className="text-xs text-ink-mute uppercase tracking-wider block mb-1">
              密碼
            </label>
            <input
              id="pw"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full px-4 py-2.5 bg-clay text-white rounded-lg text-sm font-semibold hover:bg-clay-deep transition-colors disabled:opacity-50"
          >
            {submitting ? '登入中…' : '登入'}
          </button>
        </form>

        <p className="text-[11px] text-ink-faint mt-6 leading-relaxed">
          這台後台只接受 Tailnet 內網訪問；如果你不是負責人，請關閉此頁面。
        </p>
      </div>
    </main>
  )
}
