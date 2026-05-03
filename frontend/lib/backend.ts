const DEFAULT_BACKEND = 'http://127.0.0.1:8000'
const PRODUCTION_FALLBACK_BACKEND = 'https://asha-production-7e1d.up.railway.app'
const HEALTH_PATH = '/health'
const HEALTH_TIMEOUT_MS = 7000

type WinnerCache = {
  backend: string
  expiresAt: number
}

let winnerCache: WinnerCache | null = null

function normalizeBackend(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function splitBackends(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[,\n; ]+/)
    .map((value) => normalizeBackend(value))
    .filter(Boolean)
}

export function getBackendBases(): string[] {
  const fromPrivateList = splitBackends(process.env.BACKEND_URLS)
  const fromPublicList = splitBackends(process.env.NEXT_PUBLIC_API_URLS)
  const fromPrivateSingle = splitBackends(process.env.API_URL)
  const fromPublicSingle = splitBackends(process.env.NEXT_PUBLIC_API_URL)

  const merged = [
    ...fromPrivateList,
    ...fromPublicList,
    ...fromPrivateSingle,
    ...fromPublicSingle,
  ]

  const deduped = Array.from(new Set(merged)).filter((url) => /^https?:\/\//i.test(url))
  if (deduped.length) return deduped

  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
  return isProduction ? [PRODUCTION_FALLBACK_BACKEND] : [DEFAULT_BACKEND]
}

async function probeBackend(base: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}${HEALTH_PATH}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`health check failed: ${res.status}`)
    }
    return base
  } finally {
    clearTimeout(timeout)
  }
}

export async function pickFastestHealthyBackend(backends: string[]): Promise<string> {
  if (!backends.length) return DEFAULT_BACKEND
  if (backends.length === 1) return backends[0]

  const now = Date.now()
  if (winnerCache && winnerCache.expiresAt > now && backends.includes(winnerCache.backend)) {
    return winnerCache.backend
  }

  try {
    const winner = await Promise.any(backends.map((base) => probeBackend(base)))
    winnerCache = {
      backend: winner,
      expiresAt: now + 60_000,
    }
    return winner
  } catch {
    return backends[0]
  }
}

export function orderBackendsByWinner(backends: string[], winner: string): string[] {
  return [winner, ...backends.filter((base) => base !== winner)]
}
