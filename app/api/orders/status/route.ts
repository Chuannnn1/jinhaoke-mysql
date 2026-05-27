import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// ============================================================
// 型別定義（TypeScript 的核心：先定義資料的形狀）
// ============================================================

/** PATCH /api/orders/status — request body 的型別 */
interface UpdateStatusBody {
  order_id: string
  status: string
}

/** API 統一回應格式 */
interface ApiResponse {
  success: boolean
  error?: string
}

// ============================================================
// PATCH /api/orders/status — 更新訂單狀態
// ============================================================
export async function PATCH(request: Request) {
  try {
    // 解析 request body，並標注它應該長什麼樣子
    // 如果前端傳的東西不符合 UpdateStatusBody，TS 在編譯時就會警告
    const body: UpdateStatusBody = await request.json()

    if (!body.order_id || !body.status) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '缺少 order_id 或 status' },
        { status: 400 }
      )
    }

    // 對應後台的三個狀態到 DB 的狀態值
    const statusMap: Record<string, string> = {
      pending: 'pending',
      preparing: 'preparing',
      done: 'completed',
    }

    const dbStatus = statusMap[body.status] || body.status

    const db = getDb()
    db.prepare(`UPDATE "order" SET status = ? WHERE order_id = ?`)
      .run(dbStatus, body.order_id)

    return NextResponse.json<ApiResponse>({ success: true })
  } catch (error) {
    console.error('PATCH /api/orders/status error:', error)
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        // error 可能是任何東西（unknown），所以要判斷是否為 Error 實體
        error: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500 }
    )
  }
}