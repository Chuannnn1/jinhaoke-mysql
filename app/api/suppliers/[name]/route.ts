import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

interface SupplierRow extends RowDataPacket {
  name: string
  phone: string | null
}

const SELECT_SQL = 'SELECT `供應商名稱` AS name, `供應商電話` AS phone FROM `供應商` WHERE `供應商名稱` = ?'

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const pool = getPool()
    const [rows] = await pool.execute<SupplierRow[]>(SELECT_SQL, [params.name])
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: '找不到該供應商' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[GET /api/suppliers/:name]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const body = await req.json()
    const pool = getPool()

    const [rows] = await pool.execute<SupplierRow[]>(SELECT_SQL, [params.name])
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: '找不到該供應商' }, { status: 404 })
    }

    if (body.phone !== undefined) {
      const phone = (typeof body.phone === 'string' && body.phone.trim()) ? body.phone.trim() : null
      await pool.execute('UPDATE `供應商` SET `供應商電話` = ? WHERE `供應商名稱` = ?', [phone, params.name])
    }

    const [updated] = await pool.execute<SupplierRow[]>(SELECT_SQL, [params.name])
    return NextResponse.json({ success: true, data: updated[0] })
  } catch (err) {
    console.error('[PUT /api/suppliers/:name]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const pool = getPool()
    await pool.execute('DELETE FROM `供應商` WHERE `供應商名稱` = ?', [params.name])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/suppliers/:name]', err)
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 })
  }
}
