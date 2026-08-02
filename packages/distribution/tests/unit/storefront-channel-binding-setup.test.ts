import { describe, expect, it, vi } from "vitest"

import {
  runStorefrontChannelBindingSetupMigration,
  storefrontChannelBindingCutoverSql,
} from "../../src/storefront-channel-binding-setup.js"

describe("storefront channel binding setup migration", () => {
  it("fails closed on missing prerequisites and deterministically backfills an active direct channel", () => {
    expect(storefrontChannelBindingCutoverSql).toContain(
      "storefront channel binding cutover requires the binding table",
    )
    expect(storefrontChannelBindingCutoverSql).toContain(
      "storefront channel binding cutover requires the channels table",
    )
    expect(storefrontChannelBindingCutoverSql).toContain('ORDER BY "created_at", "id"')
    expect(storefrontChannelBindingCutoverSql).toContain("ON CONFLICT DO NOTHING")
    expect(storefrontChannelBindingCutoverSql).toContain(
      "storefront channel binding cutover left unbound or inactive storefronts",
    )
    expect(storefrontChannelBindingCutoverSql).toContain(
      "storefront channel binding cutover found multiple active bindings",
    )
  })

  it("executes the admitted cutover through the migration runner client", async () => {
    const query = vi.fn(async () => ({ rows: [] }))

    await runStorefrontChannelBindingSetupMigration({
      client: { query } as never,
      dryRun: false,
    })

    expect(query).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith(storefrontChannelBindingCutoverSql)
  })
})
