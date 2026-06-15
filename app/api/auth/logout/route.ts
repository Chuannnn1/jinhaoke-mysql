// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'
import { getSessionTokenFromRequest, deleteSession, buildClearCookie } from '@/lib/auth'

export async function POST(req: Request) {
  const token = getSessionTokenFromRequest(req)
  if (token) {
    try { deleteSession(token) } catch (err) { console.error('[auth/logout]', err) }
  }
  const res = NextResponse.json({ success: true })
  res.headers.set('Set-Cookie', buildClearCookie())
  return res
}
