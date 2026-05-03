import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/proxy'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  return proxyToBackend(`/api/patients/${encodeURIComponent(params.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  return proxyToBackend(`/api/patients/${encodeURIComponent(params.id)}`, { method: 'DELETE' })
}
