import { NextResponse } from 'next/server'
import { getBackendBases, orderBackendsByWinner, pickFastestHealthyBackend } from '@/lib/backend'

const REQUEST_TIMEOUT_MS = 30000

export async function proxyToBackend(path: string, init: RequestInit = {}) {
  const backends = getBackendBases()
  if (!backends.length) {
    return NextResponse.json(
      { error: 'backend config missing', detail: 'Set NEXT_PUBLIC_API_URL in Vercel env.' },
      { status: 500 }
    )
  }

  const winner = await pickFastestHealthyBackend(backends)
  const orderedBackends = orderBackendsByWinner(backends, winner)
  let lastStatus = 502
  let lastError = 'backend unreachable'

  for (const backend of orderedBackends) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(`${backend}${path}`, {
        ...init,
        signal: controller.signal,
        cache: 'no-store',
      })
      const text = await res.text()
      let data: any = {}
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          data = { detail: text }
        }
      }
      if (!res.ok) {
        lastStatus = res.status
        lastError = data?.detail || data?.error || `backend responded ${res.status}`
        continue
      }
      return NextResponse.json(data, { status: res.status })
    } catch (err) {
      lastError = String(err)
      continue
    } finally {
      clearTimeout(timeout)
    }
  }

  return NextResponse.json(
    { error: 'backend error', status: lastStatus, detail: lastError, tried: orderedBackends },
    { status: 502 }
  )
}
