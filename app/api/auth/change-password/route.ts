// app/api/auth/change-password/route.ts
// 改密碼：必須帶 admin cookie；驗證當前密碼 → hash 新密碼 → 寫進 admin_setting DB
// 不動 process.env / .env 檔；DB 永遠是 source of truth（getStoredHash 已改成 DB 優先）
import { NextResponse } from 'next/server'
import {
  requireAdmin,
  verifyPassword,
  hashPassword,
  getStoredHash,
  setAdminSetting,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface Body {
  current?: string
  new_password?: string
}

export async function POST(req: Request) {
  const guard = requireAdmin(req)
  if (guard) return guard

  let body: Body = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: '請傳 JSON body' },
      { status: 400 }
    )
  }

  const current = (body.current || '').toString()
  const next = (body.new_password || '').toString()

  if (!current) {
    return NextResponse.json(
      { success: false, error: '請輸入當前密碼' },
      { status: 400 }
    )
  }
  if (next.length < 6) {
    return NextResponse.json(
      { success: false, error: '新密碼至少 6 字' },
      { status: 400 }
    )
  }
  if (next === current) {
    return NextResponse.json(
      { success: false, error: '新密碼不能跟當前一樣' },
      { status: 400 }
    )
  }

  const stored = getStoredHash()
  if (!stored) {
    return NextResponse.json(
      { success: false, error: '目前沒有設定密碼（請回登入頁走初始化）' },
      { status: 500 }
    )
  }
  if (!verifyPassword(current, stored)) {
    // 故意延遲，降 brute-force 速度
    await new Promise(r => setTimeout(r, 250))
    return NextResponse.json(
      { success: false, error: '當前密碼錯誤' },
      { status: 401 }
    )
  }

  try {
    setAdminSetting('admin_password_hash', hashPassword(next))
  } catch (e) {
    console.error('[auth/change-password] 寫 DB 失敗:', e)
    return NextResponse.json(
      { success: false, error: '無法寫入資料庫' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
