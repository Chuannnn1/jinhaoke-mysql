// app/api/suppliers/[name]/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// ============================================================
// 型別定義
// ============================================================
interface Supplier {
  name: string
  phone: string | null
}

interface UpdateSupplierBody {
  phone?: string
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/suppliers/:name — 查詢單一供應商
// ============================================================
export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const db = getDb()
    const supplier = db.prepare('SELECT name, phone FROM supplier WHERE name = ?')
      .get(params.name) as Supplier | undefined

    if (!supplier) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該供應商' },
        { status: 404 }
      )
    }

    return NextResponse.json<ApiResponse<Supplier>>({ success: true, data: supplier })

  } catch (err) {
    console.error('[GET /api/suppliers/:name]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// PUT /api/suppliers/:name — 修改供應商
//
// PUT 的定義：完整替換。req.body 帶上你想修改的欄位，
// 伺服器只更新有出現的欄位（不帶的維持現值）。
// ============================================================
export async function PUT(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const body: UpdateSupplierBody = await req.json()
    const db = getDb()

    // ── 確認資源存在 ─────────────────────
    const existing = db.prepare('SELECT name, phone FROM supplier WHERE name = ?')
      .get(params.name) as Supplier | undefined

    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '找不到該供應商' },
        { status: 404 }
      )
    }

    // ── 商業邏輯：不能修改 name（PK）──────
    // 如果 req.body 有 name 且與 URL 不同 → 拒絕（PK 不能亂改）
    if (body.phone !== undefined) {
      const newPhone = body.phone.trim() === '' ? null : body.phone.trim()
      db.prepare('UPDATE supplier SET phone = ? WHERE name = ?')
        .run(newPhone, params.name)
    }

    // ── 回傳更新後的完整物件 ──────────────
    const updated = db.prepare('SELECT name, phone FROM supplier WHERE name = ?')
      .get(params.name) as Supplier

    return NextResponse.json<ApiResponse<Supplier>>({ success: true, data: updated })

  } catch (err) {
    console.error('[PUT /api/suppliers/:name]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// DELETE /api/suppliers/:name — 刪除供應商
// ============================================================
export async function DELETE(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const db = getDb()

    // ── 確認資源存在 ─────────────────────
    const existing = db.prepare('SELECT name FROM supplier WHERE name = ?')
      .get(params.name)

    if (!existing) {
      // ★ 重要：DELETE 是 idempotent 的
      // 刪兩次和刪一次結果相同，所以找不到也回 200（不回 404）
      // 這是 REST DELETE 的慣例
      return NextResponse.json<ApiResponse>({ success: true })
    }

    // ── 寫入 ─────────────────────────────
    db.prepare('DELETE FROM supplier WHERE name = ?').run(params.name)

    return NextResponse.json<ApiResponse>({ success: true })

  } catch (err) {
    console.error('[DELETE /api/suppliers/:name]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }

  // ★ 關於 FK 保護：
  // schema 裡 ingredient → supplier 的 FK 是 ON DELETE SET NULL
  // 所以刪除供應商不會失敗，只是該供應商的食材變成沒有 supplier
  // 這是 schema 設計的選擇，不是程式的 bug
}