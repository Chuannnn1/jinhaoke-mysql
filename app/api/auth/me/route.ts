import { NextResponse } from 'next/server'
import { getSessionTokenFromRequest, isValidSession } from '@/lib/auth'

export async function GET(req: Request) {
  const token = getSessionTokenFromRequest(req)
  return NextResponse.json({ success: true, authed: isValidSession(token) })
}
