// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { verifyPassword, createSession, buildSessionCookie } from '@/lib/auth'

interface LoginBody {
  password?: string
}

export async function POST(req: Request) {
  try {
    const body: LoginBody = await req.json().catch(() => ({}))
    const password = (body.password || '').toString()
    if (!password) {
      return NextResponse.json(
        { success: false, error: '請輸入密碼' },
        { status: 400 }
      )
    }

    const expectedHash = process.env.ADMIN_PASSWORD_HASH
    if (!expectedHash) {
      console.error('[auth/login] ADMIN_PASSWORD_HASH 未設定')
      return NextResponse.json(
        { success: false, error: '伺服器尚未設定管理員密碼，請聯絡部署者' },
        { status: 500 }
      )
    }

    if (!verifyPassword(password, expectedHash)) {
      // 故意慢一點點，降低 brute-force 速度（scrypt 本身已經慢）
      await new Promise(r => setTimeout(r, 250))
      return NextResponse.json(
        { success: false, error: '密碼錯誤' },
        { status: 401 }
      )
    }

    const userAgent = req.headers.get('user-agent') ?? undefined
    const { token, expiresAt } = createSession(userAgent)

    const res = NextResponse.json({ success: true, expires_at: expiresAt.toISOString() })
    res.headers.set('Set-Cookie', buildSessionCookie(token, expiresAt))
    return res
  } catch (err) {
    console.error('[POST /api/auth/login]', err)
    return NextResponse.json(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}
