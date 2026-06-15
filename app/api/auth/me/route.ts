// app/api/auth/me/route.ts — 給前端確認是否已登入
import { NextResponse } from 'next/server'
import { getSessionTokenFromRequest, isValidSession } from '@/lib/auth'

export async function GET(req: Request) {
  const token = getSessionTokenFromRequest(req)
  const authed = isValidSession(token)
  return NextResponse.json({ success: true, authed })
}
