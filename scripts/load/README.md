# Load-test suite (k6)

Phase 3.5 of the [performance assessment](../../docs/architecture/performance-enterprise-scale-assessment.md)
(§4, item 3.5): a [k6](https://k6.io) scenario suite that turns the SLO budgets from §6 into a
regression test, run against a **staging tenant** per release.

These scripts run inside **k6's JS runtime, not Node.js** — no npm imports, only `k6/*` modules
and the relative helpers in `lib/`. `node --check` passes on them (they are plain ES modules),
but full validation requires k6 itself.

## Install k6

```sh
brew install k6        # macOS
# or see https://grafana.com/docs/k6/latest/set-up/install-k6/
```

## Scenarios

| Script | Traffic | Mutates? | Thresholds (run fails on breach) |
|---|---|---|---|
| `storefront-firehose.js` | ramping arrival rate 50→500 rps over 5m, sustained 2m, across catalog list / product detail / departures | No | `http_req_failed` rate < 1%; `http_req_duration` p(95) < 300ms; p(95) < 100ms for the `cached:yes` subset; `storefront_cache_hits` (X-Cache HIT ratio after 60s warmup) ≥ 70% |
| `mixed.js` | 85/15 read/quote at a constant `RATE` (default 50 rps) for `DURATION` (default 5m) | No | `http_req_failed` rate < 2%; p(95) < 300ms (`kind:read`), < 800ms (`kind:quote`) |

## Running locally

```sh
# Read-only firehose
k6 run -e TARGET_URL=https://staging-tenant.example.com scripts/load/storefront-firehose.js

# Mixed read/quote load
k6 run -e TARGET_URL=https://staging-tenant.example.com scripts/load/mixed.js

# Export the summary for archiving
k6 run --summary-export=k6-summary.json -e TARGET_URL=... scripts/load/mixed.js
```

## Environment variables

| Var | Required | Used by | Meaning |
|---|---|---|---|
| `TARGET_URL` | **yes** | all | Base URL of the tenant under test (no trailing slash needed) |
| `API_TOKEN` | no | all | Bearer token for authenticated surfaces; admin-side steps skip gracefully without it |
| `PRODUCT_IDS` | no | all | Comma-separated catalog product ids; skips discovery |
| `PRODUCT_SLUGS` | no | firehose, mixed | Comma-separated product slugs for slug-based detail reads |
| `DEPARTURE_ID` | no | mixed | Known departure id for quote payloads; skips discovery |
| `SLOT_ID` | no | mixed | Availability slot id; defaults to `DEPARTURE_ID` |
| `CURRENCY` | no | mixed | Sell currency for quote payloads (default `EUR`) |
| `WARMUP_MS` | no | firehose | Cache-hit-ratio warmup window (default 60000) |
| `RATE` / `DURATION` | no | mixed | Arrival rate (rps) and duration of the mixed scenario |

## Seed data

Scenarios need real ids on the target tenant:

- **storefront-firehose** — published catalog products reachable via
  `GET /v1/public/products`. If `PRODUCT_IDS` is unset, the script runs a *discovery mode* in
  `setup()`: it calls `GET /v1/public/products?limit=20` and uses the returned ids/slugs. The run
  aborts if discovery returns nothing — seed the tenant (any published product works) or pass
  `-e PRODUCT_IDS=...`.
- **mixed** — published products plus at least one departure for the quote
  slice. Use `DEPARTURE_ID` to skip departure discovery.

To collect ids manually from a seeded tenant:

```sh
curl -s "$TARGET_URL/v1/public/products?limit=20" | jq -r '.data[].id'
curl -s "$TARGET_URL/v1/public/products/<id>/departures?limit=10" | jq -r '.data[].id'
```

## Reading the results

- k6 prints a per-metric summary at the end; **any threshold breach makes k6 exit non-zero**
  (that is the CI gate — no extra assertion glue needed).
- `http_req_duration{cached:yes}` is the storefront cacheable subset (catalog list + product
  detail); the §6 target is < 50ms at the edge once the KV/Cache read models land, the current
  budget is 100ms.
- `storefront_cache_hits` is a custom Rate over the dispatcher's `X-Cache` header (`HIT` = 1).
  Samples are only recorded after the warmup window so cold-fill misses don't drag the ratio.
- `rate_limited` is a custom Rate of 429 responses (per-plan dispatch limits). These are
  *expected* under spike (`http.setResponseCallback` whitelists 429), so they never count toward
  `http_req_failed` — a spike run that sheds load via 429 while keeping p95 within budget passes.
- `checks` failures (non-2xx where 2xx was expected) show up in the summary even when below the
  failure-rate threshold — eyeball them.

## CI

`.github/workflows/load-test.yml` runs a chosen scenario via `workflow_dispatch` (manual or
release-triggered; no cron). Inputs: `target_url` (required), `scenario`, `allow_writes`
(default false). The job installs k6 via `grafana/setup-k6-action`, fails on threshold breach,
and uploads `k6-summary.json` as an artifact. Set the optional `LOAD_TEST_API_TOKEN` repo secret
to exercise authenticated surfaces.
