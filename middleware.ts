// middleware.ts — 後台路由守衛（edge runtime）
//
// 邏輯：
//   · /admin/* 路徑（除了 /admin/login）→ 需要 admin cookie
//     · 沒 cookie → redirect /admin/login?from=<原 path>
//   · /api/* 路徑 → 需要 cookie；公開白名單例外（顧客點餐用）
//     · /api/auth/*                       公開（登入登出本身）
//     · /api/menu       (GET)             公開（前台顯示菜單）
//     · /api/orders     (POST)            公開（前台下單）
//     · /api/orders     (GET)             受保護（後台才看訂單列表）
//   · 其他 /api/* → 沒 cookie 回 401
//
// 注意：middleware 跑在 edge runtime，沒辦法接 better-sqlite3。
//       所以這裡只做 cookie 存在性檢查；真正的 token 有效性由 API route 端
//       透過 lib/auth.ts 的 requireAdmin() 二次驗證。
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'jinhaoke_admin_session'

function hasSessionCookie(req: NextRequest): boolean {
  const v = req.cookies.get(COOKIE_NAME)?.value
  return !!v && v.length > 10
}

function isPublicApi(pathname: string, method: string): boolean {
  if (pathname.startsWith('/api/auth/')) return true
  if (pathname === '/api/menu' && method === 'GET') return true
  if (pathname === '/api/orders' && method === 'POST') return true
  // 顧客觸控前台點 /api/menu/:id GET 也要放（看單品）
  if (/^\/api\/menu\/[^\/]+$/.test(pathname) && method === 'GET') return true
  return false
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const method = req.method.toUpperCase()

  // ── /admin/* ──
  if (pathname.startsWith('/admin')) {
    // /admin/login 自己不擋
    if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
      return NextResponse.next()
    }
    if (!hasSessionCookie(req)) {
      const url = req.nextUrl.clone()
      url.pathname = '/admin/login'
      url.searchParams.set('from', pathname + req.nextUrl.search)
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // ── /api/* ──
  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname, method)) return NextResponse.next()
    if (!hasSessionCookie(req)) {
      return NextResponse.json(
        { success: false, error: 'unauthorized' },
        { status: 401 }
      )
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
}
