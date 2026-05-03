import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/proxy'

export async function GET(req: NextRequest) {
  const limit = req.nextUrl.searchParams.get('limit') || '200'
  return proxyToBackend(`/api/patients?limit=${encodeURIComponent(limit)}`)
}
