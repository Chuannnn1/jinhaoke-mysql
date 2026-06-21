'use client'
import { useState, FormEvent, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PasswordInput from '@/components/PasswordInput'

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginPageInner />
    </Suspense>
  )
}

function AdminLoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams?.get('from') || '/admin'

  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await fetch('/api/auth/me').then(r => r.json())
        if (cancelled) return
        if (me.authed) {
          router.replace(from)
          return
        }
      } catch { /* ignore */ }
      if (!cancelled) setReady(true)
    })()
    return () => { cancelled = true }
  }, [router, from])

  async function handleLogin(e: FormEvent) {
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
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
      const me = await meRes.json().catch(() => ({}))
      if (!me?.authed) {
        setError('登入成功但 cookie 沒被瀏覽器接受，請檢查瀏覽器設定或改用 HTTPS。')
        setSubmitting(false)
        return
      }
      router.replace(from)
    } catch {
      setError('網路錯誤')
      setSubmitting(false)
    }
  }

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-cream px-4">
        <p className="text-sm text-ink-mute">載入中...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm bg-paper rounded-2xl shadow-md border border-border/40 p-8">
        <div className="flex flex-col items-center mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/jinhaoke-logo.webp"
            alt="金濠客食堂"
            className="w-24 h-24 rounded-full object-cover shadow-sm"
          />
        </div>
        <h1 className="text-xl font-bold text-ink mb-1 text-center">
          金濠客 — 後台登入
        </h1>
        <p className="text-xs text-ink-mute mb-6 text-center">
          輸入管理密碼以進入後台。登入有效期 60 天。
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <PasswordInput
            id="pw"
            label="密碼"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />

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
            {submitting ? '登入中...' : '登入'}
          </button>
        </form>
      </div>
    </main>
  )
}
