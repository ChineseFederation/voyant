#!/usr/bin/env node
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const manifest = readFileSync("src/voyant.ts", "utf8")
const claims = new Map([
  ["@voyant-travel/public-api#api.admin", "storefront"],
  ["@voyant-travel/public-api#api.public", "storefront"],
  ["@voyant-travel/public-api#customer-portal.api", "customer-portal"],
  ["@voyant-travel/public-api#verification.api", "storefront-verification"],
  ["@voyant-travel/finance#payment-link.api", "payment-link"],
])

for (const [apiId, document] of claims) {
  const start = manifest.indexOf(`id: "${apiId}"`)
  assert.notEqual(start, -1, `missing Storefront graph API bundle ${apiId}`)
  assert.match(
    manifest.slice(start, start + 360),
    new RegExp(`openapi: \\{ document: "${document}" \\}`),
    `${apiId} must own the ${document} document`,
  )
}

for (const [file, apiId] of [
  ["openapi/admin/public-api.json", "@voyant-travel/public-api#api.admin"],
  ["openapi/public-api/public-api.json", "@voyant-travel/public-api#api.public"],
  ["openapi/public-api/customer-portal.json", "@voyant-travel/public-api#customer-portal.api"],
  ["openapi/public-api/payment-link.json", "@voyant-travel/finance#payment-link.api"],
  ["openapi/public-api/public-api-verification.json", "@voyant-travel/public-api#verification.api"],
]) {
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
    `${file} must preserve exact Storefront graph ownership`,
  )
}

console.log(`check-storefront-openapi-authority: OK (${claims.size} package-owned API bundles)`)
