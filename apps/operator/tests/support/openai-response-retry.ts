const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504])

export interface TransientRetryEvent {
  attempt: number
  maxAttempts: number
  status: number | null
  delayMs: number
}

export async function fetchWithTransientRetry(
  request: () => Promise<Response>,
  options: {
    maxAttempts?: number
    delay?: (milliseconds: number) => Promise<void>
    onRetry?: (event: TransientRetryEvent) => void
  } = {},
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 3
  const delay = options.delay ?? wait
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await request()
      if (await isTerminalQuotaResponse(response)) return response
      if (!TRANSIENT_STATUS.has(response.status) || attempt === maxAttempts) return response
      const delayMs = retryDelayMs(attempt, response.headers.get("retry-after"))
      options.onRetry?.({ attempt, maxAttempts, status: response.status, delayMs })
      await response.body?.cancel()
      await delay(delayMs)
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts) throw error
      const delayMs = retryDelayMs(attempt, null)
      options.onRetry?.({ attempt, maxAttempts, status: null, delayMs })
      await delay(delayMs)
    }
  }

  throw lastError ?? new Error("Transient model request retry exhausted")
}

async function isTerminalQuotaResponse(response: Response): Promise<boolean> {
  if (response.status !== 429) return false
  try {
    const body = (await response.clone().json()) as {
      error?: { type?: string; code?: string | null }
    }
    return [body.error?.type, body.error?.code].some(
      (value) => value === "insufficient_quota" || value === "billing_hard_limit_reached",
    )
  } catch {
    return false
  }
}

function retryDelayMs(attempt: number, retryAfter: string | null) {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(2_000, seconds * 1_000)
  return Math.min(2_000, 250 * 2 ** (attempt - 1))
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
