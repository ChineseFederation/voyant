import { compileAppManifest } from "@voyant-travel/app-manifest/compiler"
import { isExternalWebhookPayloadSchema } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"
import { validManifest } from "./test-fixtures.js"

/**
 * `@voyant-travel/app-manifest` restates the external-payload rule so a
 * publisher can compile a manifest without the framework. `@voyant-travel/core`
 * remains the host-side authority. Nothing in the type system keeps the two in
 * step, so this asserts they agree.
 *
 * If this fails, the copy in `app-manifest/src/compiler.ts` is stale — fix it
 * there, do not relax this test.
 */
const cases: readonly { label: string; schema: unknown }[] = [
  { label: "object schema with properties", schema: { type: "object", properties: {} } },
  {
    label: "object schema with a declared property",
    schema: { type: "object", properties: { bookingId: { type: "string" } } },
  },
  { label: "object schema without properties", schema: { type: "object" } },
  { label: "object schema with null properties", schema: { type: "object", properties: null } },
  {
    label: "object schema with array properties",
    schema: { type: "object", properties: [] },
  },
  { label: "array schema", schema: { type: "array", items: { type: "string" } } },
  { label: "string schema", schema: { type: "string" } },
  { label: "bare array", schema: [] },
  { label: "null", schema: null },
  { label: "undefined", schema: undefined },
  { label: "number", schema: 3 },
]

/**
 * Reaches the app-manifest copy through its only observable behaviour: a
 * subscription is admitted exactly when the catalog entry is external *and*
 * its payload schema passes the restated rule.
 */
function appManifestAcceptsPayloadSchema(schema: unknown): boolean {
  const subscription = validManifest.webhooks[0]
  if (!subscription) throw new Error("fixture must declare a webhook subscription")
  try {
    compileAppManifest(validManifest, {
      eventCatalog: {
        events: [
          {
            eventType: subscription.eventType,
            version: subscription.eventVersion,
            visibility: "external",
            payloadSchema: schema,
          },
        ],
      },
    })
    return true
  } catch {
    return false
  }
}

describe("external webhook payload rule parity", () => {
  for (const { label, schema } of cases) {
    it(`agrees with @voyant-travel/core for ${label}`, () => {
      expect(appManifestAcceptsPayloadSchema(schema)).toBe(isExternalWebhookPayloadSchema(schema))
    })
  }
})
