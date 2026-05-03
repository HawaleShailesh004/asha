import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/proxy'

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  return proxyToBackend(`/api/survivorship/checkin/${encodeURIComponent(params.id)}`, { method: 'DELETE' })
}
