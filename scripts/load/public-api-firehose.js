// Storefront firehose — pure read load against the public catalog surface.
//
// The #1686 scenario: ramping arrival rate 50 -> 500 rps over 5 minutes, then
// 500 rps sustained for 2 minutes, spread across catalog list, product detail,
// and departures reads. Read-only: safe to run anywhere, but point it at
// staging unless you mean it.
//
//   k6 run -e TARGET_URL=https://staging-tenant.example.com scripts/load/public-api-firehose.js
//
// SLO budgets asserted (docs/architecture/performance-enterprise-scale-assessment.md §6):
//   - http_req_failed rate < 1%
//   - http_req_duration p(95) < 300ms overall
//   - http_req_duration p(95) < 100ms for the cacheable subset (tag cached:yes)
//   - X-Cache HIT ratio >= 70% after a 60s warmup (the platform dispatcher
//     sets `X-Cache: HIT|MISS|BYPASS` on dispatched responses)

import { check, fail } from "k6"
import { Rate } from "k6/metrics"

import { isCacheHit, PRODUCT_IDS, PRODUCT_SLUGS, pick, WARMUP_MS } from "./lib/config.js"
import {
  discoverProducts,
  getProduct,
  getProductBySlug,
  listDepartures,
  listProducts,
} from "./lib/requests.js"

const cacheHits = new Rate("storefront_cache_hits")

export const options = {
  scenarios: {
    firehose: {
      executor: "ramping-arrival-rate",
      startRate: 50,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 600,
      stages: [
        { duration: "5m", target: 500 },
        { duration: "2m", target: 500 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<300"],
    "http_req_duration{cached:yes}": ["p(95)<100"],
    storefront_cache_hits: ["rate>=0.70"],
  },
}

export function setup() {
  let ids = PRODUCT_IDS
  let slugs = PRODUCT_SLUGS
  if (ids.length === 0) {
    const discovered = discoverProducts()
    ids = discovered.ids
    if (slugs.length === 0) slugs = discovered.slugs
  }
  if (ids.length === 0) {
    fail(
      "No product ids available. Seed the staging tenant with published catalog products, " +
        "or pass -e PRODUCT_IDS=prod_a,prod_b",
    )
  }
  return { ids, slugs, startedAt: Date.now() }
}

export default function (data) {
  const warm = Date.now() - data.startedAt > WARMUP_MS
  const roll = Math.random()

  if (roll < 0.4) {
    // 40% — catalog list (cacheable)
    const res = listProducts({ cached: "yes", endpoint: "products_list" })
    check(res, { "list 200": (r) => r.status === 200 })
    if (warm) cacheHits.add(isCacheHit(res))
  } else if (roll < 0.8) {
    // 40% — product detail by id or slug (cacheable)
    let res
    if (data.slugs.length > 0 && Math.random() < 0.3) {
      res = getProductBySlug(pick(data.slugs), { cached: "yes", endpoint: "product_detail" })
    } else {
      res = getProduct(pick(data.ids), { cached: "yes", endpoint: "product_detail" })
    }
    check(res, { "detail 200": (r) => r.status === 200 })
    if (warm) cacheHits.add(isCacheHit(res))
  } else {
    // 20% — departures (availability-coupled, excluded from the cached budget
    // and the HIT-ratio metric)
    const res = listDepartures(pick(data.ids), { endpoint: "departures" })
    check(res, { "departures 200": (r) => r.status === 200 })
  }
}
