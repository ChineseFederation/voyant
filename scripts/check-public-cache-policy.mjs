/**
 * Enforces the public-route cache policy from
 * docs/architecture/public-route-cache-policy.md.
 *
 * The public response cache is opt-in by route header, so the guardrail keeps
 * the known route groups, policy doc, and Cloudflare KV bindings in sync.
 */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

const violations = []

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf-8")
}

function addViolation(message) {
  violations.push(message)
}

function requireContains(relativePath, phrase, reason) {
  const content = read(relativePath)
  if (!content.includes(phrase)) {
    addViolation(`${relativePath}: missing ${JSON.stringify(phrase)} (${reason})`)
  }
}

function requireNotContains(relativePath, phrase, reason) {
  const content = read(relativePath)
  if (content.includes(phrase)) {
    addViolation(`${relativePath}: must not contain ${JSON.stringify(phrase)} (${reason})`)
  }
}

function requireNotMatches(relativePath, pattern, reason) {
  const content = read(relativePath)
  if (pattern.test(content)) {
    addViolation(`${relativePath}: matched forbidden pattern ${pattern} (${reason})`)
  }
}

function countLiteral(content, literal) {
  let count = 0
  let index = content.indexOf(literal)
  while (index !== -1) {
    count += 1
    index = content.indexOf(literal, index + literal.length)
  }
  return count
}

function requireCallCount(relativePath, literal, minimum, reason) {
  const content = read(relativePath)
  const count = countLiteral(content, literal)
  if (count < minimum) {
    addViolation(
      `${relativePath}: expected at least ${minimum} occurrences of ${JSON.stringify(
        literal,
      )}, found ${count} (${reason})`,
    )
  }
}

function checkPolicyDoc() {
  const relativePath = "docs/architecture/public-route-cache-policy.md"
  if (!existsSync(join(ROOT, relativePath))) {
    addViolation(`${relativePath}: missing public route cache policy document`)
    return
  }

  const requiredPhrases = [
    "Inventory public product browse/detail",
    "Storefront departure browse/detail",
    "Catalog sourced content for products, cruises, and accommodations",
    "Accept-Language",
    "Cruise public browse/detail/sailing/ship GETs",
    "Charter public browse/detail/voyage/yacht GETs",
    "Commerce public pricing and availability snapshots",
    "Booking transport requirements",
    "Legal policies, terms, and default contract template",
    "Operator public profile, public operator settings, payment-link config",
    "Catalog POST search",
  ]

  for (const phrase of requiredPhrases) {
    requireContains(relativePath, phrase, "route matrix entry")
  }
}

function checkKvCacheBindings() {
  // The operator is Node-only (voyant#2966): public-cache/rate-limit stores
  // are concrete Node providers in `src/server.ts`, while consumers type
  // against the KVStore-compatible CACHE member and RateLimitStore.
  requireContains(
    "packages/operator-standard/src/index.ts",
    'cache: "postgres"',
    "standard Node product cache backend",
  )
  requireNotContains(
    "apps/operator/voyant.config.ts",
    "cache:",
    "the standard cache backend must not be repeated in authored project config",
  )
  requireContains(
    "packages/framework/src/node-runtime.ts",
    "VoyantNodeRuntimeEnv extends VoyantBindings",
    "generated operator binding preset",
  )
  requireContains("packages/hono/src/types.ts", "CACHE?: KVStore", "operator CACHE binding type")
  requireContains(
    "packages/hono/src/types.ts",
    "RATE_LIMIT_STORE?:",
    "operator RateLimitStore binding type",
  )
}

function checkSourceMarkers() {
  requireContains(
    "packages/hono/src/app.ts",
    "publicResponseCache(config.publicCache ?? {})",
    "public response cache middleware must stay mounted by default",
  )
  requireContains(
    "packages/hono/src/middleware/public-cache.ts",
    'const DEFAULT_PREFIXES = ["/v1/public/"]',
    "public response cache must remain scoped to public API by default",
  )
  requireContains(
    "packages/hono/src/middleware/public-cache.ts",
    "c.env.CACHE",
    "public response cache must keep the KV fallback",
  )

  const sharedCacheMarkers = [
    {
      file: "packages/inventory/src/routes-public.ts",
      call: "setPublicCacheHeaders(c)",
      minimum: 7,
      reason: "inventory public read routes",
    },
    {
      file: "packages/storefront/src/routes-public.ts",
      call: "setPublicCacheHeaders(c)",
      minimum: 7,
      reason: "storefront public read routes",
    },
    {
      file: "packages/cruises/src/routes-public.ts",
      call: "cachePublicRead(c)",
      minimum: 7,
      reason: "cruise public read routes",
    },
    {
      file: "packages/charters/src/routes-public.ts",
      call: "cachePublicRead(c)",
      minimum: 9,
      reason: "charter public read routes",
    },
    {
      file: "packages/commerce/src/pricing/routes-public.ts",
      call: "cachePublicRead(c)",
      minimum: 2,
      reason: "public pricing and availability snapshots",
    },
    {
      file: "packages/bookings/src/requirements/routes-public.ts",
      call: "cachePublicRead(c)",
      minimum: 1,
      reason: "public booking transport requirements",
    },
    {
      file: "packages/legal/src/policies/routes.ts",
      call: "cachePublicLegalRead(c)",
      minimum: 1,
      reason: "public legal policy reads",
    },
    {
      file: "packages/legal/src/terms/routes.ts",
      call: "cachePublicLegalRead(c)",
      minimum: 2,
      reason: "public legal terms reads",
    },
    {
      file: "packages/legal/src/contracts/routes.ts",
      call: "cachePublicLegalRead(c)",
      minimum: 1,
      reason: "public default contract template read",
    },
    {
      file: "packages/operator-settings/src/routes.ts",
      call: "cachePublicOperatorSettings(c)",
      minimum: 2,
      reason: "public operator settings/profile reads",
    },
    {
      file: "packages/storefront/src/payment-link/routes.ts",
      call: "cachePublicPaymentLinkConfig(c)",
      minimum: 1,
      reason: "public payment-link config read",
    },
  ]

  for (const marker of sharedCacheMarkers) {
    requireCallCount(marker.file, marker.call, marker.minimum, marker.reason)
  }

  requireCallCount(
    "packages/legal/src/contracts/routes.ts",
    "preventSharedCache(c)",
    2,
    "public contract instance and signing routes must stay private/no-store",
  )

  requireNotMatches(
    "packages/storefront/src/routes-public.ts",
    /\.get\("\/settings",[\s\S]*?setPublicCacheHeaders\(c\)[\s\S]*?\n\s*\.post\("\/leads"/,
    "storefront settings can vary by request headers and must not use URL-only shared cache",
  )

  for (const file of [
    "packages/inventory/src/routes-content.ts",
    "packages/cruises/src/routes-content.ts",
    "packages/accommodations/src/routes-content.ts",
  ]) {
    requireNotContains(
      file,
      "cacheControl?: string | false",
      "content routes can vary by Accept-Language when locale is absent from the URL",
    )
    requireNotContains(
      file,
      "options.cacheControl",
      "content routes must not apply shared cache headers from route options",
    )
  }
}

checkPolicyDoc()
checkKvCacheBindings()
checkSourceMarkers()

if (violations.length > 0) {
  console.error("Public cache policy violation.")
  console.error("See docs/architecture/public-route-cache-policy.md.\n")
  for (const violation of violations) {
    console.error(`  - ${violation}`)
  }
  process.exit(1)
}

console.log("check-public-cache-policy: OK")
