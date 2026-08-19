#!/usr/bin/env node
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const manifests = [
  "packages/bookings/src/voyant.ts",
  "packages/catalog/src/voyant.ts",
  "packages/commerce/src/voyant.ts",
  "packages/finance/src/voyant.ts",
  "packages/inventory/src/voyant.ts",
  "packages/legal/src/voyant.ts",
  "packages/proposals/src/voyant.ts",
].map((file) => [file, readFileSync(file, "utf8")])

const claims = new Map([
  ["@voyant-travel/catalog#api.admin", "catalog"],
  ["@voyant-travel/catalog#api.public", "catalog"],
  ["@voyant-travel/catalog#booking-engine.api.admin", "catalog-booking"],
  ["@voyant-travel/catalog#booking-engine.api.public", "catalog-booking"],
  ["@voyant-travel/catalog#offers-extension.api", "catalog"],
  ["@voyant-travel/commerce#api.pricing.admin", "pricing"],
  ["@voyant-travel/commerce#api.pricing.public", "pricing"],
  ["@voyant-travel/commerce#api.markets.admin", "markets"],
  ["@voyant-travel/commerce#api.markets.public", "markets"],
  ["@voyant-travel/commerce#api.sellability.admin", "sellability"],
  ["@voyant-travel/commerce#api.promotions.admin", "promotions"],
  ["@voyant-travel/commerce#catalog-checkout-extension.api", "catalog"],
  ["@voyant-travel/commerce#booking-maintenance-extension.api", "bookings"],
  ["@voyant-travel/inventory#api.admin", "products"],
  ["@voyant-travel/inventory#api.public", "products"],
  ["@voyant-travel/inventory#extras.api", "extras"],
  ["@voyant-travel/inventory#content-extension.api.admin", "products"],
  ["@voyant-travel/inventory#content-extension.api.public", "products"],
  ["@voyant-travel/inventory#brochure-extension.api.admin", "products"],
  ["@voyant-travel/bookings#requirements.api", "booking-requirements"],
  ["@voyant-travel/bookings#requirements.api.public", "booking-requirements"],
  ["@voyant-travel/bookings#booking-supplier-extension.api", "bookings"],
  ["@voyant-travel/finance#booking-schedule-extension.api.admin", "bookings"],
  ["@voyant-travel/legal#api.contract-document", "contract-document"],
  ["@voyant-travel/proposals#api", "proposals"],
  ["@voyant-travel/proposals#presentation-extension.api.admin", "proposals"],
])

for (const [apiId, document] of claims) {
  const source = manifests.find(([, content]) => content.includes(`id: "${apiId}"`))
  assert(source, `missing retail graph API bundle ${apiId}`)
  const start = source[1].indexOf(`id: "${apiId}"`)
  const declaration = source[1].slice(start, start + 420)
  assert.match(
    declaration,
    new RegExp(`openapi: \\{ document: "${document}" \\}`),
    `${apiId} must own the ${document} document`,
  )
}

for (const file of [
  "packages/catalog/src/graph-runtime.ts",
  "packages/catalog/src/booking-engine/operator-routes.ts",
  "packages/inventory/src/graph-runtime.ts",
  "packages/commerce/src/checkout/routes.ts",
]) {
  assert.match(
    readFileSync(file, "utf8"),
    /stampOpenApiRegistryApiId/,
    `${file} must preserve exact operation ownership at overlapping mounts`,
  )
}

const exactOperationOwners = new Map([
  [
    "packages/bookings/src/routes-admin.ts",
    ["@voyant-travel/bookings#booking-supplier-extension.api", 3],
  ],
  [
    "packages/finance/src/payment-schedule/routes.ts",
    ["@voyant-travel/finance#booking-schedule-extension.api.admin", 1],
  ],
  [
    "packages/proposals/src/routes/proposal-versions.ts",
    ["@voyant-travel/proposals#presentation-extension.api.admin", 1],
  ],
])

for (const [file, [apiId, expectedCount]] of exactOperationOwners) {
  const source = readFileSync(file, "utf8")
  const marker = `"x-voyant-api-id": "${apiId}"`
  assert.equal(
    source.split(marker).length - 1,
    expectedCount,
    `${file} must preserve ${expectedCount} exact operation ownership markers for ${apiId}`,
  )
}

// The package-owned bundle ratchet, held from a second file so lowering it
// takes two edits and cannot ride along in a diff about something else.
//
// This read the checker's source text and matched the literal `= 72`, which
// went red when the value ROSE — the one direction that is always safe — and
// stayed green if the assignment were reformatted or the guard deleted. It
// measured the spelling, not the rule.
const ratchet = JSON.parse(
  readFileSync("scripts/checks/openapi/graph-coverage-ratchet.json", "utf8"),
)
assert.ok(
  ratchet.minimum >= ratchet.floor,
  `graph-coverage-ratchet.json lowers the package-owned bundle minimum to ${ratchet.minimum}, below the floor of ${ratchet.floor}`,
)

console.log(`check-retail-openapi-authority: OK (${claims.size} package-owned API bundles)`)
