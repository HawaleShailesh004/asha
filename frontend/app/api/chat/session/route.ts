import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/proxy'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId?.trim()) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }
  return proxyToBackend(`/api/chat/session?user_id=${encodeURIComponent(userId.trim())}`)
}
