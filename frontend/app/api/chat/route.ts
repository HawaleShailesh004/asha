import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000')
  .trim()
  .replace(/\/+$/, '')

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { user_id, message, image } = body

  if (!user_id || !message) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    // Forward to FastAPI /api/chat endpoint
    const res = await fetch(`${BACKEND}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, message, image }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'backend error', status: res.status }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'backend unreachable' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}