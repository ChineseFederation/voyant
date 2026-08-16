import type { InsuranceProviderAdapter } from "@voyant-travel/insurance-contracts/provider"
import { assertInsuranceProviderAdapter } from "@voyant-travel/insurance-contracts/provider"
import { describe, expect, it } from "vitest"
import { insuranceProviderSourcePort } from "../../src/provider-ports.js"

/**
 * The port's `test` deliberately re-implements `assertInsuranceProviderAdapter`
 * instead of importing it, because the module manifest reaches
 * `provider-ports.ts` and a value import there would pull `insurance-contracts`
 * into every graph resolution (`verify:deployment-graph-import-cheap`).
 *
 * Duplication that is allowed to drift is worse than the import it avoided, so
 * this asserts the two agree on every provider — including the malformed ones.
 */

const VALID: InsuranceProviderAdapter = {
  providerId: "prov-a",
  displayName: "Provider A",
  quote: async () => [],
  apply: async () => ({}) as never,
  issue: async () => ({}) as never,
  document: async () => ({}) as never,
  cancel: async () => ({}) as never,
}

function rejects(check: (value: unknown) => void, value: unknown): string | null {
  try {
    check(value)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

describe("port check and contracts helper agree", () => {
  const cases: Array<[string, unknown]> = [
    ["a valid provider", VALID],
    ["null", null],
    ["a non-object", "provider"],
    ["a provider with no id", { ...VALID, providerId: "" }],
    ["a provider with no display name", { ...VALID, displayName: "" }],
    ["a provider missing quote", { ...VALID, quote: undefined }],
    ["a provider missing apply", { ...VALID, apply: undefined }],
    ["a provider missing issue", { ...VALID, issue: undefined }],
    ["a provider missing document", { ...VALID, document: undefined }],
    ["a provider missing cancel", { ...VALID, cancel: undefined }],
    ["a provider whose method is not callable", { ...VALID, issue: "yes" }],
  ]

  for (const [label, value] of cases) {
    it(`agrees on ${label}`, () => {
      // The cast is the point of the test, not a way around it: `definePort<T>`
      // types `test` as taking a `T`, and what the graph actually binds is
      // whatever a deployment wrote. Every case below is something that is not
      // an `InsuranceProviderAdapter`.
      const viaPort = rejects(
        (candidate) => insuranceProviderSourcePort.test?.(candidate as InsuranceProviderAdapter),
        value,
      )
      const viaContracts = rejects(assertInsuranceProviderAdapter, value)
      expect(viaPort === null).toBe(viaContracts === null)
      if (viaPort && viaContracts) {
        // Both must name the same offending member, not merely both fail.
        expect(viaPort).toBe(viaContracts)
      }
    })
  }
})
