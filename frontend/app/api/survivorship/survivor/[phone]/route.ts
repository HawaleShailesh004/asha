import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/proxy'

export async function PUT(req: NextRequest, { params }: { params: { phone: string } }) {
  const body = await req.json()
  return proxyToBackend(`/api/survivorship/survivor/${encodeURIComponent(params.phone)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function DELETE(_: NextRequest, { params }: { params: { phone: string } }) {
  return proxyToBackend(`/api/survivorship/survivor/${encodeURIComponent(params.phone)}`, { method: 'DELETE' })
}
