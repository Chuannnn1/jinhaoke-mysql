'use client'
// 後台登入頁（同時也是 first-boot 註冊頁）
// 流程：
//   1. mount 時打 /api/auth/setup-status 判斷現況
//      · needs_setup → 進「設定密碼」模式（兩個欄位 + 自動登入）
//      · 已設定 → 順手打 /api/auth/me，若已登入則跳走，否則顯示登入表單
//   2. 表單送出 → /api/auth/login 或 /api/auth/setup → 種 cookie → router.replace(from)
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

type Mode = 'loading' | 'setup' | 'login'

function AdminLoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams?.get('from') || '/admin'

  const [mode, setMode] = useState<Mode>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await fetch('/api/auth/setup-status').then(r => r.json())
        if (cancelled) return
        if (s.needs_setup) {
          setMode('setup')
          return
        }
        // 已設密碼：看看自己有沒有 cookie，已登入就跳走
        const me = await fetch('/api/auth/me').then(r => r.json())
        if (cancelled) return
        if (me.authed) {
          router.replace(from)
          return
        }
        setMode('login')
      } catch {
        if (!cancelled) setMode('login')
      }
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
      router.replace(from)
    } catch {
      setError('網路錯誤')
      setSubmitting(false)
    }
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('密碼至少 6 字')
      return
    }
    if (password !== confirm) {
      setError('兩次輸入不一致')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        // 若被搶占（410）就回到登入模式
        if (res.status === 410) {
          setMode('login')
          setError('密碼已被其他人設定，請輸入登入密碼')
          setPassword('')
          setConfirm('')
          setSubmitting(false)
          return
        }
        setError(data.error || '設定失敗')
        setSubmitting(false)
        return
      }
      router.replace(from)
    } catch {
      setError('網路錯誤')
      setSubmitting(false)
    }
  }

  if (mode === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-cream px-4">
        <p className="text-sm text-ink-mute">載入中…</p>
      </main>
    )
  }

  const isSetup = mode === 'setup'

  return (
    <main className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm bg-paper rounded-2xl shadow-md border border-border/40 p-8">
        <h1 className="text-xl font-bold text-ink mb-1">
          金濠客 — {isSetup ? '初始化設定' : '後台登入'}
        </h1>
        <p className="text-xs text-ink-mute mb-6">
          {isSetup
            ? '這台機器是第一次啟動，請設定後台管理密碼。設完即自動登入，有效期 60 天。'
            : '輸入管理密碼以進入後台。登入有效期 60 天。'}
        </p>

        <form onSubmit={isSetup ? handleSetup : handleLogin} className="space-y-4">
          <PasswordInput
            id="pw"
            label={isSetup ? '新密碼（至少 6 字）' : '密碼'}
            autoFocus
            autoComplete={isSetup ? 'new-password' : 'current-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          {isSetup && (
            <PasswordInput
              id="pw2"
              label="再輸入一次"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !password || (isSetup && !confirm)}
            className="w-full px-4 py-2.5 bg-clay text-white rounded-lg text-sm font-semibold hover:bg-clay-deep transition-colors disabled:opacity-50"
          >
            {submitting
              ? (isSetup ? '設定中…' : '登入中…')
              : (isSetup ? '設定密碼並登入' : '登入')}
          </button>
        </form>

        {isSetup && (
          <p className="text-[11px] text-ink-faint mt-6 leading-relaxed">
            密碼會用 scrypt 雜湊後寫入後端資料庫。設定後可至後台 sidebar「改密碼」重設。
          </p>
        )}
      </div>
    </main>
  )
}
