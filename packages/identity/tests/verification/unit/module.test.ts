import { readFileSync } from "node:fs"
import { createContainer, createEventBus } from "@voyant-travel/core"
import { getTableName } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"

import {
  createCustomerVerificationApiModule,
  customerVerificationChallenges,
  PUBLIC_API_VERIFICATION_SENDERS_CONTAINER_KEY,
} from "../../../src/verification/index.js"

describe("createCustomerVerificationApiModule.bootstrap", () => {
  it("registers the resolved sender bundle once", async () => {
    const resolveProviders = vi.fn(() => [
      {
        name: "email-provider",
        channels: ["email"],
        send: vi.fn(async () => ({ id: "ntf_123", provider: "email-provider" })),
      },
      {
        name: "sms-provider",
        channels: ["sms"],
        send: vi.fn(async () => ({ id: "ntf_456", provider: "sms-provider" })),
      },
    ])

    const module = createCustomerVerificationApiModule({
      resolveProviders,
    })
    const container = createContainer()

    await module.module.bootstrap?.({
      bindings: {},
      container,
      eventBus: createEventBus(),
    })

    const senders = container.resolve<{
      sendEmailChallenge?: (input: {
        email: string
        code: string
        purpose: string
        expiresAt: Date
      }) => Promise<unknown>
      sendSmsChallenge?: (input: {
        phone: string
        code: string
        purpose: string
        expiresAt: Date
      }) => Promise<unknown>
    }>(PUBLIC_API_VERIFICATION_SENDERS_CONTAINER_KEY)

    expect(resolveProviders).toHaveBeenCalledOnce()
    expect(senders.sendEmailChallenge).toBeTypeOf("function")
    expect(senders.sendSmsChallenge).toBeTypeOf("function")
  })

  it("publishes the schema entrypoint required by explicit Drizzle schema arrays", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as {
      exports: Record<string, string>
      publishConfig: { exports: Record<string, unknown> }
      voyant: {
        schemaVersion: string
        kind: string
        compatibleWith: { framework: string; targets: string[]; modes: string[] }
        schema: string
        requiresSchemas: string[]
      }
    }

    expect(getTableName(customerVerificationChallenges)).toBe("customer_verification_challenges")
    expect(packageJson.exports["./verification/schema"]).toBe("./src/verification/schema.ts")
    expect(packageJson.publishConfig.exports["./verification/schema"]).toMatchObject({
      import: "./dist/verification/schema.js",
      types: "./dist/verification/schema.d.ts",
    })
    expect(packageJson.voyant.schemaVersion).toBe("voyant.package.v1")
    expect(packageJson.voyant.kind).toBe("module")
    expect(packageJson.voyant.compatibleWith.framework).toBe(">=0.26.0")
    expect(packageJson.voyant.compatibleWith.targets).toEqual(["node"])
    expect(packageJson.voyant.compatibleWith.modes).toEqual([
      "local",
      "managed-cloud",
      "self-hosted",
    ])
    // In public-api this package's ENTIRE schema was verification, so the
    // declared entrypoint was "./verification/schema" itself. Identity has its
    // own tables too, so the declaration stays "./schema" and that barrel
    // re-exports verification — which is what keeps the challenges table
    // reachable for an explicit Drizzle schema array (voyant#4627).
    expect(packageJson.voyant.schema).toBe("./schema")
    expect(readFileSync(new URL("../../../src/schema.ts", import.meta.url), "utf8")).toContain(
      'export * from "./verification/schema.js"',
    )
    expect(packageJson.voyant.requiresSchemas).toEqual(["@voyant-travel/db"])
  })
})
