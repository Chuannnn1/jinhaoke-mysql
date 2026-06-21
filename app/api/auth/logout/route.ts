import { NextResponse } from 'next/server'
import { buildClearCookie } from '@/lib/auth'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.headers.set('Set-Cookie', buildClearCookie())
  return res
}
