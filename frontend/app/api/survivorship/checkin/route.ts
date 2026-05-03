import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/proxy'

export async function POST(req: NextRequest) {
  const body = await req.json()
  return proxyToBackend('/api/survivorship/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
