import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const sql = readFileSync(
  new URL(
    "../../migrations/20260801173000_storefront_channel_binding_cutover.sql",
    import.meta.url,
  ),
  "utf8",
)

describe("storefront channel binding cutover", () => {
  it("owns only link DDL and storefront-local validation", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "auth_storefront_distribution_channel"')
    expect(sql).toContain('FROM "storefronts" s')
    expect(sql).not.toContain('FROM "channels"')
    expect(sql).not.toContain('INSERT INTO "channels"')
    expect(sql).not.toContain('INSERT INTO "auth_storefront_distribution_channel"')
  })

  it("uses single-label wildcard overlap semantics", () => {
    expect(sql).toContain("strpos(")
    expect(sql).toContain("substring(left_origin.origin from 11)")
    expect(sql).toContain("substring(right_origin.origin from 11)")
  })
})
