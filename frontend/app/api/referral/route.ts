import { NextRequest, NextResponse } from 'next/server'
import {
  getBackendBases,
  orderBackendsByWinner,
  pickFastestHealthyBackend,
} from '@/lib/backend'

const REQUEST_TIMEOUT_MS = 30000

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const backends = getBackendBases()
    if (!backends.length) {
      return NextResponse.json(
        { error: 'backend config missing', detail: 'Set NEXT_PUBLIC_API_URLS or BACKEND_URLS in Vercel env.' },
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
        const res = await fetch(`${backend}/api/referral`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: 'no-store',
        })

        if (!res.ok) {
          lastStatus = res.status
          lastError = `backend responded ${res.status}`
          continue
        }

        const data = await res.json()
        return NextResponse.json(data)
      } catch (err) {
        lastError = String(err)
        continue
      } finally {
        clearTimeout(timeout)
      }
    }

    return NextResponse.json(
      { error: `Backend error: ${lastStatus}`, detail: lastError, tried: orderedBackends },
      { status: 502 }
    )
  } catch (err) {
    return NextResponse.json({ error: 'Failed to reach backend', detail: String(err) }, { status: 502 })
  }
}