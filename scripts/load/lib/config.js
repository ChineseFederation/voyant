// Shared configuration for the k6 load-test suite.
//
// IMPORTANT: this file runs inside k6's JS runtime (Sobek), NOT Node.js.
// Only k6 modules ("k6/http", "k6/metrics", ...) and relative imports are
// available — no npm packages, no node: builtins.
//
// Required env (passed with `k6 run -e KEY=value`):
//   TARGET_URL          base URL of the tenant under test, e.g. https://staging-tenant.example.com
//
// Optional env:
//   API_TOKEN           bearer token for /v1/admin/* scenarios; admin steps skip gracefully without it
//   PRODUCT_IDS         comma-separated catalog product ids (skips discovery)
//   PRODUCT_SLUGS       comma-separated catalog product slugs
//   DEPARTURE_ID        a known departure id for quote scenarios (skips discovery)
//   SLOT_ID             availability slot id (defaults to DEPARTURE_ID — storefront departure
//                       ids ARE availability slot ids, see packages/public-api service-departures)
//   CURRENCY            sell currency for quote payloads (default EUR)
//   WARMUP_MS           cache-hit-ratio warmup window for public-api-firehose (default 60000)

function requireEnv(name) {
  const value = __ENV[name]
  if (!value || String(value).trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Run with: k6 run -e ${name}=https://staging-tenant.example.com <script>`,
    )
  }
  return String(value).trim()
}

function csv(name) {
  const raw = __ENV[name]
  if (!raw) return []
  return String(raw)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

const BASE_URL = requireEnv("TARGET_URL").replace(/\/+$/, "")
export const PUBLIC_BASE = `${BASE_URL}/v1/public`

const API_TOKEN = __ENV.API_TOKEN ? String(__ENV.API_TOKEN).trim() : null
export const PRODUCT_IDS = csv("PRODUCT_IDS")
export const PRODUCT_SLUGS = csv("PRODUCT_SLUGS")
export const DEPARTURE_ID = __ENV.DEPARTURE_ID ? String(__ENV.DEPARTURE_ID).trim() : null
export const SLOT_ID = __ENV.SLOT_ID ? String(__ENV.SLOT_ID).trim() : DEPARTURE_ID
export const CURRENCY = __ENV.CURRENCY ? String(__ENV.CURRENCY).trim().toUpperCase() : "EUR"
export const WARMUP_MS = __ENV.WARMUP_MS ? Number.parseInt(String(__ENV.WARMUP_MS), 10) : 60_000

/** Pick a random element from a non-empty array. */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Common JSON headers; merges the bearer token when API_TOKEN is set. */
export function jsonHeaders(extra) {
  const headers = { "Content-Type": "application/json", ...(extra || {}) }
  if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`
  return headers
}

/**
 * The platform dispatcher sets `X-Cache: HIT|MISS|BYPASS` on dispatched
 * responses. k6 canonicalizes header names, but check both casings to be safe.
 */
export function isCacheHit(res) {
  const value = res.headers["X-Cache"] || res.headers["x-cache"]
  return value === "HIT"
}
