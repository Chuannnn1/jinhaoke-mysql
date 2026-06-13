// app/api/suppliers/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// ============================================================
// 型別定義
// ============================================================
interface Supplier {
  name: string
  phone: string | null
}

interface CreateSupplierBody {
  name: string
  phone?: string
}

interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// ============================================================
// GET /api/suppliers — 取得全部供應商
// ============================================================
export async function GET() {
  try {
    const db = getDb()
    const suppliers = db.prepare('SELECT name, phone FROM supplier ORDER BY name')
      .all() as Supplier[]

    return NextResponse.json<ApiResponse<Supplier[]>>({ success: true, data: suppliers })
  } catch (err) {
    console.error('[GET /api/suppliers]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/suppliers — 新增供應商
// ============================================================
export async function POST(req: Request) {
  try {
    const body: CreateSupplierBody = await req.json()

    // ── 驗證（Validation）──────────────
    // 必要欄位檢查：name 是 PK，不能為空
    if (!body.name || body.name.trim() === '') {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '供應商名稱為必填欄位' },
        { status: 400 }
      )
    }

    const db = getDb()

    // ── 商業邏輯檢查（Business Logic）─────
    // 檢查是否已有同名供應商（PRIMARY KEY 衝突）
    const existing = db.prepare('SELECT name FROM supplier WHERE name = ?').get(body.name.trim())
    if (existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '供應商名稱已存在' },
        { status: 409 }                          // ← 409 Conflict：資源衝突
      )
    }

    // ── 寫入 ────────────────────────────
    db.prepare('INSERT INTO supplier (name, phone) VALUES (?, ?)')
      .run(body.name.trim(), body.phone?.trim() ?? null)

    // ── 回傳結果 ─────────────────────────
    // 回傳完整的供應商物件（含 server 產生的 null phone）
    const newSupplier = db.prepare('SELECT name, phone FROM supplier WHERE name = ?')
      .get(body.name.trim()) as Supplier

    return NextResponse.json<ApiResponse<Supplier>>(
      { success: true, data: newSupplier },
      { status: 201 }                             // ← 201 Created
    )

  } catch (err) {
    // 走到了這裡表示：不是驗證失敗、不是 PK 衝突
    // 而是預期之外的系統錯誤（例如：資料庫連線失敗）
    console.error('[POST /api/suppliers]', err)
    return NextResponse.json<ApiResponse>(
      { success: false, error: '未知錯誤' },
      { status: 500 }
    )
  }
}