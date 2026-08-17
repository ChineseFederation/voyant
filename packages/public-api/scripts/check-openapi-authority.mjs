#!/usr/bin/env node
/**
 * The Public API package owns exactly three OpenAPI documents, and every
 * operation in each must be stamped with the graph bundle it came from.
 *
 * This checker sat unreachable from `verify:architecture` while three separate
 * changes moved the ground under it: the `storefront` document became
 * `public-api`, verification moved to `@voyant-travel/identity` (voyant#4627),
 * and payment-link moved to `@voyant-travel/finance`. It still claimed all
 * five bundles and failed on the first one — nobody saw it, because nothing
 * ran it. `verify:chain-reachability` now covers per-package checkers too, so
 * this one is executed by the chain rather than trusted to be correct.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"

const manifest = readFileSync("src/voyant.ts", "utf8")

/** Graph API bundle -> the OpenAPI document it declares. */
const claims = new Map([
  ["@voyant-travel/public-api#api.admin", "public-api"],
  ["@voyant-travel/public-api#api.public", "public-api"],
  ["@voyant-travel/public-api#customer-portal.api", "customer-portal"],
])

for (const [apiId, document] of claims) {
  const start = manifest.indexOf(`id: "${apiId}"`)
  assert.notEqual(start, -1, `missing Public API graph API bundle ${apiId}`)
  assert.match(
    manifest.slice(start, start + 360),
    new RegExp(`openapi: \\{ document: "${document}" \\}`),
    `${apiId} must own the ${document} document`,
  )
}

/**
 * Bundles that used to live here. Naming them keeps the move explicit: if one
 * reappears in this manifest the owning package has been forked, not moved.
 */
for (const [apiId, owner] of [
  ["@voyant-travel/public-api#verification.api", "@voyant-travel/identity"],
  ["@voyant-travel/finance#payment-link.api", "@voyant-travel/finance"],
]) {
  assert.equal(
    manifest.includes(`id: "${apiId}"`),
    false,
    `${apiId} moved to ${owner} and must not be declared here`,
  )
}

for (const [file, apiId] of [
  ["openapi/admin/public-api.json", "@voyant-travel/public-api#api.admin"],
  ["openapi/public-api/public-api.json", "@voyant-travel/public-api#api.public"],
  ["openapi/public-api/customer-portal.json", "@voyant-travel/public-api#customer-portal.api"],
]) {
  assert(existsSync(file), `${file} is missing`)
  const document = JSON.parse(readFileSync(file, "utf8"))
  const operations = Object.values(document.paths ?? {}).flatMap((pathItem) =>
    Object.values(pathItem ?? {}).filter(
      (operation) => operation && typeof operation === "object" && "responses" in operation,
    ),
  )
  assert(operations.length > 0, `${file} must contain operations`)
  assert(
    operations.every(
      (operation) =>
        operation["x-voyant-api-id"] === apiId &&
        operation["x-voyant-package-name"] === "@voyant-travel/public-api",
    ),
    `${file} must preserve exact Public API graph ownership`,
  )
}

/** A moved document must not be left behind as a stale copy. */
for (const file of [
  "openapi/public-api/payment-link.json",
  "openapi/public-api/public-api-verification.json",
]) {
  assert.equal(existsSync(file), false, `${file} moved out of this package and must not exist`)
}

console.log(`check-openapi-authority: OK (${claims.size} package-owned API bundles)`)
