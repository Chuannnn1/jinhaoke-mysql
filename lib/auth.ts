// lib/auth.ts — 後台單一密碼登入機制
//
// 設計：
//   · 密碼用 scrypt 雜湊（node:crypto 內建，無第三方相依）
//   · 登入成功 → 產生 32-byte 隨機 token → 寫 admin_session → 種 httpOnly cookie 30 天
//   · API 端點用 requireAdmin() 檢查 cookie token 是否有效（DB lookup）
//   · 登出 = DELETE 該 token；清空整張表 = 強制所有 device 重新登入
//
// 部署：在 .env.local 設 ADMIN_PASSWORD_HASH（用 scripts/set-admin-password.js 產）
import { NextResponse } from 'next/server'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getDb } from './db'

export const COOKIE_NAME = 'jinhaoke_admin_session'
export const SESSION_DAYS = 60

// ── 密碼雜湊 / 驗證 ──
//   stored 格式: scrypt:<salt-hex>:<hash-hex>
//   參數固定：N=16384, r=8, p=1, keyLen=64
//   分隔符用 ':' 而不是 '$'，避免 .env 檔被 dotenv-expand 誤解
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = parts[1]
  const expectedHex = parts[2]
  try {
    const testHex = scryptSync(password, salt, 64).toString('hex')
    if (testHex.length !== expectedHex.length) return false
    return timingSafeEqual(Buffer.from(testHex, 'hex'), Buffer.from(expectedHex, 'hex'))
  } catch {
    return false
  }
}

// ── Session 管理 ──
export function createSession(userAgent?: string): {
  token: string
  expiresAt: Date
} {
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400 * 1000)
  getDb().prepare(`
    INSERT INTO admin_session (token, created_at, expires_at, last_seen, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, now.toISOString(), expiresAt.toISOString(), now.toISOString(), userAgent?.slice(0, 200) ?? null)
  return { token, expiresAt }
}

export function isValidSession(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string' || token.length !== 64) return false
  const row = getDb()
    .prepare('SELECT expires_at FROM admin_session WHERE token = ?')
    .get(token) as { expires_at: string } | undefined
  if (!row) return false
  if (Date.parse(row.expires_at) < Date.now()) {
    // 順手清掉過期
    getDb().prepare('DELETE FROM admin_session WHERE token = ?').run(token)
    return false
  }
  // 更新 last_seen（不阻塞）
  getDb()
    .prepare('UPDATE admin_session SET last_seen = ? WHERE token = ?')
    .run(new Date().toISOString(), token)
  return true
}

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM admin_session WHERE token = ?').run(token)
}

export function cleanExpiredSessions(): number {
  const r = getDb()
    .prepare('DELETE FROM admin_session WHERE expires_at < ?')
    .run(new Date().toISOString())
  return r.changes
}

// ── 設定值：通用 key/value（目前只用 'admin_password_hash'）──
export function getAdminSetting(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM admin_setting WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setAdminSetting(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO admin_setting (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString())
}

// ── 取得「目前生效」的密碼 hash ──
// 優先讀 admin_setting DB（first-boot wizard / GUI 改密碼寫進去的）；
// 沒有再 fallback 到 process.env.ADMIN_PASSWORD_HASH（給「全新部署、env 帶 initial seed」用）。
// 一旦 DB 有值，env 就被忽略 → 改密碼從 GUI 改即可（不用碰 systemd EnvironmentFile）。
export function getStoredHash(): string | undefined {
  const fromDb = getAdminSetting('admin_password_hash')
  if (fromDb) return fromDb
  return process.env.ADMIN_PASSWORD_HASH || undefined
}

export function hasAdminPassword(): boolean {
  return !!getStoredHash()
}

// ── Helper：從 Request 取 cookie 值 ──
export function getSessionTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') ?? ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === COOKIE_NAME) return decodeURIComponent(rest.join('='))
  }
  return null
}

// ── API 路由用的守衛 ──
// 用法：
//   const guard = requireAdmin(req)
//   if (guard) return guard
//   ...handler 繼續
export function requireAdmin(req: Request): NextResponse | null {
  const token = getSessionTokenFromRequest(req)
  if (!isValidSession(token)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 }
    )
  }
  return null
}

// ── 設定 cookie helper（POST /api/auth/login 用）──
export function buildSessionCookie(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  // 若有 https（NODE_ENV=production 但本機開發用 http），就加 Secure
  if (process.env.NODE_ENV === 'production' && process.env.COOKIE_INSECURE !== '1') {
    parts.push('Secure')
  }
  return parts.join('; ')
}

export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
