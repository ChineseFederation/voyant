import { describe, expect, it } from "vitest"

import {
  type BootstrapCustomerPortalInput,
  type BootstrapCustomerPortalParsed,
  type CreateCustomerPortalCompanionInput,
  type CreateCustomerPortalCompanionParsed,
  createCustomerPortalCompanionSchema,
} from "./index.js"

/**
 * A request-body alias must describe what a CALLER sends. `role` and
 * `isPrimary` carry `.default()`, so they are optional on the way in and
 * present on the way out.
 *
 * These are compile-time assertions on purpose: exporting the aliases off
 * `z.infer` (the OUTPUT type) made defaulted fields read as required, and every
 * consumer re-derived its request types with `z.input` by hand. If the aliases
 * regress, `pnpm --filter @voyant-travel/public-api-contracts typecheck` fails
 * on these lines rather than in somebody else's repository.
 */

// Fails to compile if the alias is z.infer: "missing role, isPrimary".
const callerSendsMinimalCompanion: CreateCustomerPortalCompanionInput = { name: "Ana Popescu" }

// Fails to compile if the alias is z.infer: createCustomerIfMissing becomes required.
const callerSendsEmptyBootstrap: BootstrapCustomerPortalInput = {}

// The post-parse shapes must still guarantee the defaulted fields.
const parsedCompanionHasDefaults: Pick<CreateCustomerPortalCompanionParsed, "role" | "isPrimary"> =
  { role: "other", isPrimary: false }
const parsedBootstrapHasDefaults: Pick<BootstrapCustomerPortalParsed, "createCustomerIfMissing"> = {
  createCustomerIfMissing: true,
}

describe("request-body contracts", () => {
  it("accepts a caller payload that omits every defaulted field", () => {
    const parsed = createCustomerPortalCompanionSchema.parse(callerSendsMinimalCompanion)
    expect(parsed.role).toBe("other")
    expect(parsed.isPrimary).toBe(false)
  })

  it("keeps the compile-time shapes referenced so tsc checks them", () => {
    expect(callerSendsEmptyBootstrap).toEqual({})
    expect(parsedCompanionHasDefaults.role).toBe("other")
    expect(parsedBootstrapHasDefaults.createCustomerIfMissing).toBe(true)
  })
})
