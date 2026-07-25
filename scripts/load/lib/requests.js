// Shared request builders for the k6 load-test suite (k6 runtime, not Node).
//
// All scenarios go through these helpers so endpoint paths, tags, and payload
// shapes live in one place. Endpoints map to the /v1/public surface:
//   GET  /v1/public/products                      (catalog list — Inventory public product routes)
//   GET  /v1/public/products/:id                  (catalog detail)
//   GET  /v1/public/products/slug/:slug           (catalog detail by slug)
//   GET  /v1/public/products/:id/departures       (storefront departures)
//   POST /v1/public/departures/:id/price          (price preview — read-only despite POST)

import http from "k6/http"

import { CURRENCY, jsonHeaders, PUBLIC_BASE } from "./config.js"

function params(tags, extraHeaders) {
  return { headers: jsonHeaders(extraHeaders), tags: tags || {} }
}

// ---------------------------------------------------------------------------
// Reads (cacheable public surface)
// ---------------------------------------------------------------------------

export function listProducts(tags, limit) {
  return http.get(`${PUBLIC_BASE}/products?limit=${limit || 20}`, params(tags))
}

export function getProduct(productId, tags) {
  return http.get(`${PUBLIC_BASE}/products/${productId}`, params(tags))
}

export function getProductBySlug(slug, tags) {
  return http.get(`${PUBLIC_BASE}/products/slug/${slug}`, params(tags))
}

export function listDepartures(productId, tags, limit) {
  return http.get(
    `${PUBLIC_BASE}/products/${productId}/departures?limit=${limit || 25}`,
    params(tags),
  )
}

// ---------------------------------------------------------------------------
// Quote (price preview — POST but does not mutate)
// ---------------------------------------------------------------------------

export function priceDeparture(departureId, tags, pax) {
  const body = JSON.stringify({
    pax: pax || { adults: 2, children: 0, infants: 0 },
    currencyCode: CURRENCY,
  })
  return http.post(`${PUBLIC_BASE}/departures/${departureId}/price`, body, params(tags))
}

// ---------------------------------------------------------------------------
// Discovery (used from setup() when PRODUCT_IDS / DEPARTURE_ID are not given)
// ---------------------------------------------------------------------------

/**
 * Discovery mode: fetch up to 20 catalog products and return their ids/slugs.
 * Call from setup() only — setup traffic still counts toward metrics, so keep
 * it to a handful of requests.
 */
export function discoverProducts() {
  const res = http.get(`${PUBLIC_BASE}/products?limit=20`, params({ phase: "setup" }))
  if (res.status !== 200) {
    throw new Error(`Product discovery failed: GET /v1/public/products -> ${res.status}`)
  }
  const parsed = res.json()
  const rows = parsed && Array.isArray(parsed.data) ? parsed.data : []
  return {
    ids: rows.map((row) => row.id).filter(Boolean),
    slugs: rows.map((row) => row.slug).filter(Boolean),
  }
}

/**
 * Find a bookable departure across the given product ids. Storefront
 * departure ids double as availability slot ids, so the result can be used
 * directly as { departureId, slotId } in the bootstrap payload.
 */
export function discoverDeparture(productIds) {
  for (const productId of productIds) {
    const res = listDepartures(productId, { phase: "setup" }, 25)
    if (res.status !== 200) continue
    const parsed = res.json()
    const rows = parsed && Array.isArray(parsed.data) ? parsed.data : []
    const open = rows.find((row) => row.remaining === null || row.remaining > 0) || rows[0]
    if (open) {
      return { productId, departureId: open.id, slotId: open.id }
    }
  }
  return null
}
