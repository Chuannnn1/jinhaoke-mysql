import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// ============================================================
// [id]/route.ts — 單筆操作（查詢、修改、軟刪除、上下架切換）
// 對應：GET    /api/menu/:id
//       PUT    /api/menu/:id
//       PATCH  /api/menu/:id  — 切換 is_active
//       DELETE /api/menu/:id  — 軟刪除（is_active=0）
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

interface UpdateMenuBody {
  name?: string
  category?: string
  price?: number
  emoji?: string
  tag?: string
  sub?: string
  option?: string
  description?: string
  is_active?: number
  image_url?: string
}

interface PatchBody {
  is_active?: number
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/menu/:id — 查詢單一品項
// ============================================================
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb()
    const id = parseInt(params.id, 10)

    if (isNaN(id)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '無效的品項 ID' },
        { status: 400 }
      )
    }

    const item = db.prepare(
      'SELECT item_id, name, category, price, emoji, tag, sub, option, description, is_active, image_url FROM menu_item WHERE item_id = ?'
    ).get(id) as MenuItem | undefined

    if (!item) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到品項' },
        { status: 404 }
      )
    }

    return NextResponse.json<ApiResponse<MenuItem>>({ success: true, data: item })
  } catch (err) {
    console.error('[GET /api/menu/:id]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// PUT /api/menu/:id — 修改品項
// ============================================================
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb()
    const id = parseInt(params.id, 10)

    if (isNaN(id)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '無效的品項 ID' },
        { status: 400 }
      )
    }

    const existing = db.prepare(
      'SELECT item_id FROM menu_item WHERE item_id = ?'
    ).get(id)

    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到品項' },
        { status: 404 }
      )
    }

    const body: UpdateMenuBody = await req.json()

    const fields: string[] = []
    const values: (string | number)[] = []

    if (body.name !== undefined)        { fields.push('name = ?');        values.push(body.name) }
    if (body.category !== undefined)    { fields.push('category = ?');    values.push(body.category) }
    if (body.price !== undefined)       { fields.push('price = ?');       values.push(body.price) }
    if (body.emoji !== undefined)       { fields.push('emoji = ?');       values.push(body.emoji) }
    if (body.tag !== undefined)         { fields.push('tag = ?');         values.push(body.tag) }
    if (body.sub !== undefined)         { fields.push('sub = ?');         values.push(body.sub) }
    if (body.option !== undefined)      { fields.push('option = ?');      values.push(body.option) }
    if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description) }
    if (body.is_active !== undefined)   { fields.push('is_active = ?');   values.push(body.is_active) }
    if (body.image_url !== undefined)   { fields.push('image_url = ?');   values.push(body.image_url) }

    if (fields.length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '沒有要更新的欄位' },
        { status: 400 }
      )
    }

    values.push(id)
    db.prepare(`UPDATE menu_item SET ${fields.join(', ')} WHERE item_id = ?`).run(...values)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/menu/:id]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// PATCH /api/menu/:id — 切換上下架狀態
// body: { is_active: 0 | 1 }
// ============================================================
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb()
    const id = parseInt(params.id, 10)

    if (isNaN(id)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '無效的品項 ID' },
        { status: 400 }
      )
    }

    const existing = db.prepare(
      'SELECT item_id FROM menu_item WHERE item_id = ?'
    ).get(id)

    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到品項' },
        { status: 404 }
      )
    }

    const body: PatchBody = await req.json()
    if (body.is_active !== 0 && body.is_active !== 1) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'is_active 必須為 0 或 1' },
        { status: 400 }
      )
    }

    db.prepare('UPDATE menu_item SET is_active = ? WHERE item_id = ?').run(body.is_active, id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PATCH /api/menu/:id]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// DELETE /api/menu/:id — 軟刪除（is_active=0）
// ============================================================
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb()
    const id = parseInt(params.id, 10)

    if (isNaN(id)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '無效的品項 ID' },
        { status: 400 }
      )
    }

    const existing = db.prepare(
      'SELECT item_id FROM menu_item WHERE item_id = ?'
    ).get(id)

    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到品項' },
        { status: 404 }
      )
    }

    db.prepare('UPDATE menu_item SET is_active = 0 WHERE item_id = ?').run(id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/menu/:id]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
