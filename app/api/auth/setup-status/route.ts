import { NextResponse } from 'next/server'
import { hasAdminPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ needs_setup: !hasAdminPassword() })
}
