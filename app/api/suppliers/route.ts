import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

interface SupplierRow extends RowDataPacket {
  name: string
  phone: string | null
}

// GET /api/suppliers
export async function GET() {
  try {
    const pool = getPool()
    const [rows] = await pool.execute<SupplierRow[]>(
      'SELECT `供應商名稱` AS name, `供應商電話` AS phone FROM `供應商` ORDER BY `供應商名稱`'
    )
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    console.error('[GET /api/suppliers]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}

// POST /api/suppliers
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const name = (body.供應商名稱 ?? body.name ?? '').trim()
    const phone = (body.供應商電話 ?? body.phone ?? '').trim()

    if (!name) {
      return NextResponse.json({ success: false, error: '供應商名稱為必填' }, { status: 400 })
    }

    const pool = getPool()

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT `供應商名稱` FROM `供應商` WHERE `供應商名稱` = ?', [name]
    )
    if (existing.length > 0) {
      return NextResponse.json({ success: false, error: '供應商名稱已存在' }, { status: 409 })
    }

    await pool.execute(
      'INSERT INTO `供應商` (`供應商名稱`, `供應商電話`) VALUES (?, ?)',
      [name, phone || null]
    )

    const [rows] = await pool.execute<SupplierRow[]>(
      'SELECT `供應商名稱` AS name, `供應商電話` AS phone FROM `供應商` WHERE `供應商名稱` = ?', [name]
    )

    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/suppliers]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}
