import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const res = await fetch(`${BACKEND}/api/referral`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Backend error: ${res.status}`, detail: text }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json(data)

  } catch (err) {
    return NextResponse.json({ error: 'Failed to reach backend', detail: String(err) }, { status: 502 })
  }
}