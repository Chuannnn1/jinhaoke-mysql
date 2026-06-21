import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise'

export const dynamic = 'force-dynamic'

interface MenuItemRow extends RowDataPacket {
  餐點編號: number
  餐點名稱: string
  餐點分類: string
  餐點價格: number
  圖示: string
  分類標籤: string
  餐點描述: string
  上下架狀態: number
  圖片網址: string
  客製化屬性: string
}

function parseAddons(raw: string | null): Array<{ id: string; label: string; price: number }> {
  try {
    const p = JSON.parse(raw ?? '[]')
    return Array.isArray(p) ? p : []
  } catch { return [] }
}

export async function GET(req: Request) {
  try {
    const pool = getPool()
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const includeInactive = searchParams.get('include_inactive') === '1'

    const conditions: string[] = []
    const params: (string | number)[] = []

    if (!includeInactive) {
      conditions.push('`上下架狀態` = 1')
    }
    if (category) {
      conditions.push('`餐點分類` = ?')
      params.push(category)
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
    const order = category ? 'ORDER BY `餐點編號`' : 'ORDER BY `餐點分類`, `餐點編號`'

    const [rows] = await pool.execute<MenuItemRow[]>(
      `SELECT \`餐點編號\`, \`餐點名稱\`, \`餐點分類\`, \`餐點價格\`, \`圖示\`, \`分類標籤\`, \`餐點描述\`, \`上下架狀態\`, \`圖片網址\`, \`客製化屬性\`
       FROM \`餐點\` ${where} ${order}`,
      params
    )

    const data = rows.map(r => ({
      item_id: r.餐點編號,
      name: r.餐點名稱,
      category: r.餐點分類,
      price: r.餐點價格,
      emoji: r.圖示,
      tag: r.分類標籤,
      description: r.餐點描述,
      active: r.上下架狀態,
      image_url: r.圖片網址,
      addons: parseAddons(r.客製化屬性),
    }))

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/menu]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const name = (body.餐點名稱 ?? '').trim()
    const category = (body.餐點分類 ?? '').trim()
    const price = body.餐點價格

    if (!name || !category || price === undefined) {
      return NextResponse.json(
        { success: false, error: '餐點名稱、餐點分類、餐點價格 為必填' },
        { status: 400 }
      )
    }

    const pool = getPool()
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO \`餐點\` (\`餐點名稱\`, \`餐點分類\`, \`餐點價格\`, \`圖示\`, \`分類標籤\`, \`餐點描述\`, \`上下架狀態\`, \`圖片網址\`, \`客製化屬性\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        category,
        price,
        body.圖示 ?? '',
        body.分類標籤 ?? '其他',
        body.餐點描述 ?? '',
        body.上下架狀態 ?? 1,
        body.圖片網址 ?? '',
        JSON.stringify(body.客製化屬性 ?? []),
      ]
    )

    const [rows] = await pool.execute<MenuItemRow[]>(
      'SELECT `餐點編號`, `餐點名稱`, `餐點分類`, `餐點價格`, `圖示`, `分類標籤`, `餐點描述`, `上下架狀態`, `圖片網址`, `客製化屬性` FROM `餐點` WHERE `餐點編號` = ?',
      [result.insertId]
    )

    const r = rows[0]
    return NextResponse.json({
      success: true,
      data: {
        item_id: r.餐點編號,
        name: r.餐點名稱,
        category: r.餐點分類,
        price: r.餐點價格,
        emoji: r.圖示,
        tag: r.分類標籤,
        description: r.餐點描述,
        active: r.上下架狀態,
        image_url: r.圖片網址,
        addons: parseAddons(r.客製化屬性),
      },
    }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/menu]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}
