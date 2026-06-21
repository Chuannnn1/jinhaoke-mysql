import { NextResponse } from 'next/server'
import { scryptSync, timingSafeEqual, createHmac } from 'crypto'

export const COOKIE_NAME = 'jinhaoke_admin_session'
const SESSION_DAYS = 60

function getSecret(): string {
  return process.env.JWT_SECRET || 'jinhaoke-default-secret-change-me'
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

export function getStoredHash(): string | undefined {
  return process.env.ADMIN_PASSWORD_HASH || undefined
}

export function hasAdminPassword(): boolean {
  return !!getStoredHash()
}

function sign(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

function verify(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const sig = createHmac('sha256', getSecret()).update(`${parts[0]}.${parts[1]}`).digest('base64url')
  if (sig !== parts[2]) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function createSessionToken(): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000)
  const token = sign({ sub: 'admin', exp: Math.floor(expiresAt.getTime() / 1000) })
  return { token, expiresAt }
}

export function isValidSession(token: string | undefined | null): boolean {
  if (!token) return false
  return verify(token) !== null
}

export function getSessionTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') ?? ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === COOKIE_NAME) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function requireAdmin(req: Request): NextResponse | null {
  const token = getSessionTokenFromRequest(req)
  if (!isValidSession(token)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  return null
}

export function buildSessionCookie(token: string, expiresAt: Date, req?: Request): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (shouldUseSecure(req)) parts.push('Secure')
  return parts.join('; ')
}

function shouldUseSecure(req?: Request): boolean {
  if (process.env.COOKIE_INSECURE === '1') return false
  if (process.env.COOKIE_FORCE_SECURE === '1') return true
  if (!req) return false
  const xfp = req.headers.get('x-forwarded-proto')
  if (xfp) return xfp.split(',')[0].trim().toLowerCase() === 'https'
  try {
    return new URL(req.url).protocol === 'https:'
  } catch {
    return false
  }
}

export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
