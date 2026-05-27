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
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/menu — 查詢全部（可依分類篩選）
// ============================================================
export async function GET(req: Request) {
  try {
    const db = getDb()
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    let sql = `
      SELECT item_id, name, category, price, emoji, tag, sub, option, description, is_active
      FROM menu_item
      WHERE is_active = 1
      ORDER BY category, item_id
    `
    const params: string[] = []

    if (category) {
      sql = `
        SELECT item_id, name, category, price, emoji, tag, sub, option, description, is_active
        FROM menu_item
        WHERE is_active = 1 AND category = ?
        ORDER BY item_id
      `
      params.push(category)
    }

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
      INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      body.is_active ?? 1
    )

    const newItem = db.prepare(
      'SELECT item_id, name, category, price, emoji, tag, sub, option, description, is_active FROM menu_item WHERE item_id = ?'
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