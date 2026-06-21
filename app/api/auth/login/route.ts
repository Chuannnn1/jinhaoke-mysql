import { NextResponse } from 'next/server'
import { verifyPassword, createSessionToken, buildSessionCookie, getStoredHash } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const password = (body.password || '').toString()
    if (!password) {
      return NextResponse.json({ success: false, error: '請輸入密碼' }, { status: 400 })
    }

    const expectedHash = getStoredHash()
    if (!expectedHash) {
      return NextResponse.json(
        { success: false, error: '尚未設定 ADMIN_PASSWORD_HASH 環境變數' },
        { status: 503 }
      )
    }

    if (!verifyPassword(password, expectedHash)) {
      await new Promise(r => setTimeout(r, 250))
      return NextResponse.json({ success: false, error: '密碼錯誤' }, { status: 401 })
    }

    const { token, expiresAt } = createSessionToken()
    const res = NextResponse.json({ success: true, expires_at: expiresAt.toISOString() })
    res.headers.set('Set-Cookie', buildSessionCookie(token, expiresAt, req))
    return res
  } catch (err) {
    console.error('[POST /api/auth/login]', err)
    return NextResponse.json({ success: false, error: '未知錯誤' }, { status: 500 })
  }
}
