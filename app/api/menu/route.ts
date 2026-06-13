// app/api/menu/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// ============================================================
// 型別定義
// ============================================================
interface MenuItem {
  item_id: number
  name: string
  category: string
  price: number
  emoji: string
  tag: string
  sub: string
  option: string
  description: string
  is_active: number
  image_url: string
}

interface CreateMenuBody {
  name: string
  category: string
  price: number
  emoji?: string
  tag?: string
  sub?: string
  option?: string
  description?: string
  is_active?: number
  image_url?: string
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/menu — 查詢全部（可依分類篩選）
// query：
//   category=...        — 依分類篩選
//   include_inactive=1  — 連同已下架品項一併回傳
// ============================================================
export async function GET(req: Request) {
  try {
    const db = getDb()
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const includeInactive = searchParams.get('include_inactive') === '1'

    const conditions: string[] = []
    const params: string[] = []

    if (!includeInactive) {
      conditions.push('is_active = 1')
    }
    if (category) {
      conditions.push('category = ?')
      params.push(category)
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''
    const orderClause = category
      ? 'ORDER BY item_id'
      : 'ORDER BY category, item_id'

    const sql = `
      SELECT item_id, name, category, price, emoji, tag, sub, option, description, is_active, image_url
      FROM menu_item
      ${whereClause}
      ${orderClause}
    `

    const menu = db.prepare(sql).all(...params) as MenuItem[]
    return NextResponse.json<ApiResponse<MenuItem[]>>({ success: true, data: menu })
  } catch (err) {
    console.error('[GET /api/menu]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/menu — 新增品項
// ============================================================
export async function POST(req: Request) {
  try {
    const body: CreateMenuBody = await req.json()

    if (!body.name || !body.category || body.price === undefined) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'name、category、price 為必填欄位' },
        { status: 400 }
      )
    }

    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description, is_active, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      body.name,
      body.category,
      body.price,
      body.emoji ?? '',
      body.tag ?? '其他',
      body.sub ?? '',
      body.option ?? '',
      body.description ?? '',
      body.is_active ?? 1,
      body.image_url ?? ''
    )

    const newItem = db.prepare(
      'SELECT item_id, name, category, price, emoji, tag, sub, option, description, is_active, image_url FROM menu_item WHERE item_id = ?'
    ).get(result.lastInsertRowid) as MenuItem

    return NextResponse.json<ApiResponse<MenuItem>>(
      { success: true, data: newItem },
      { status: 201 }
    )
  } catch (err) {
    console.error('[POST /api/menu]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
