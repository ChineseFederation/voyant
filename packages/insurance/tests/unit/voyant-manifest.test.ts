import { assertPortConforms, isGraphRuntimeFactory } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"

import { createInsuranceVoyantRuntime } from "../../src/index.js"
import { insuranceProviderSourcePort } from "../../src/provider-ports.js"
import { insuranceAdminRoutes } from "../../src/routes.js"
import { INSURANCE_OPENAPI_API_IDS } from "../../src/routes-openapi.js"
import { insuranceCustomerPortalPort, insuranceRuntimePort } from "../../src/runtime-port.js"
import { insuranceVoyantModule } from "../../src/voyant.js"

function conformingProvider() {
  return {
    providerId: "acme",
    displayName: "Acme Insurance",
    quote: async () => [],
    apply: async () => ({}) as never,
    issue: async () => ({}) as never,
    document: async () => ({}) as never,
    cancel: async () => ({}) as never,
  }
}

describe("insurance deployment manifest", () => {
  it("provides the commerce ancillary seam and requires the insurer seam many-valued", () => {
    expect(insuranceVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/insurance",
      packageName: "@voyant-travel/insurance",
      provides: {
        ports: [
          { id: "commerce.ancillary-offer-source" },
          { id: "insurance.customer-portal-policies" },
        ],
      },
      // Deliberately no `requires.ports`. Cardinality is a property of a
      // runtime read, and the graph rejects it on a statically composed
      // requirement: "Port cardinality is supported only for statically
      // composed runtimePorts". Declaring the insurer seam in both places
      // fails graph resolution outright.
      runtimePorts: [
        { id: "insurance.runtime" },
        { id: "insurance.provider-source", optional: true, cardinality: "many" },
      ],
      api: [
        {
          id: "@voyant-travel/insurance#api.admin",
          surface: "admin",
          mount: "insurance",
          transactional: true,
          openapi: { document: "insurance" },
          runtime: { export: "createInsuranceVoyantRuntime" },
        },
      ],
      schema: [
        { id: "@voyant-travel/insurance#schema", source: "@voyant-travel/insurance/schema" },
      ],
      migrations: [{ id: "@voyant-travel/insurance#migrations", source: "./migrations" }],
      lifecycle: { uninstall: { default: "retain-data", purge: "not-supported" } },
    })
    expect(isGraphRuntimeFactory(createInsuranceVoyantRuntime)).toBe(true)
  })

  it("declares no public surface", () => {
    // Insurance is sold through checkout and read through the customer portal.
    // A public mount here would be a second place that decides who owns a
    // booking, which is how two such places come to disagree.
    expect(insuranceVoyantModule.api?.every(({ surface }) => surface === "admin")).toBe(true)
  })

  it("stamps every admin operation with the owning api id", () => {
    const ids = readApiIds(insuranceAdminRoutes as unknown as OpenApiDocumentSource)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids)).toEqual(new Set([INSURANCE_OPENAPI_API_IDS.admin]))
  })

  it("separates identity data from the ordinary insurance read", () => {
    const resources = insuranceVoyantModule.access?.resources ?? []
    expect(resources.map((resource) => resource.resource)).toEqual(["insurance", "insurance-pii"])

    const [insurance, pii] = resources
    expect(insurance?.actions).toEqual([
      expect.objectContaining({ action: "read" }),
      expect.objectContaining({ action: "write" }),
    ])
    // The whole point of the split: a wildcard grant on everything else must
    // not carry identity data with it.
    expect(pii).toMatchObject({ wildcard: "explicit-resource" })
    expect(pii?.actions).toEqual([
      expect.objectContaining({ action: "read", sensitive: true, wildcard: "explicit" }),
    ])
  })

  it("marks every toxic event field for redaction", () => {
    const redactable: Record<string, readonly string[]> = {
      "insurance.policy.issued": ["policyNumber"],
      "insurance.policy.issue-failed": ["failureMessage"],
      "insurance.policy.cancelled": ["reason"],
      "insurance.application.opened": [],
    }

    for (const event of insuranceVoyantModule.events ?? []) {
      const expected = redactable[event.eventType ?? ""]
      expect(expected, `unexpected event ${event.eventType}`).toBeDefined()
      const properties = (event.payloadSchema?.properties ?? {}) as Record<
        string,
        Record<string, unknown>
      >
      const marked = Object.entries(properties)
        .filter(([, schema]) => schema["x-voyant-redact"] === true)
        .map(([name]) => name)
      expect(marked.sort()).toEqual([...(expected ?? [])].sort())
    }
  })

  it("declares exact ledger and approval policy for every Tool action", () => {
    expect(insuranceVoyantModule.tools).toHaveLength(4)
    expect(insuranceVoyantModule.actions).toHaveLength(4)

    const toolIds = new Set((insuranceVoyantModule.tools ?? []).map(({ id }) => id))
    for (const action of insuranceVoyantModule.actions ?? []) {
      for (const boundTool of action.from?.tools ?? []) {
        expect(toolIds.has(boundTool)).toBe(true)
      }
    }

    for (const action of insuranceVoyantModule.actions ?? []) {
      if (action.kind !== "execute") continue
      expect(action).toMatchObject({
        ledger: "required",
        approval: "never",
        allowedActorTypes: ["staff"],
        // Both writes land at the insurer, not in this database.
        effectBoundary: "external",
        commandTargetField: "policyId",
      })
    }

    // Reinstating a cancelled policy is the insurer's decision, not ours.
    expect(
      insuranceVoyantModule.actions?.find(({ id }) =>
        id.endsWith("#action.cancel-insurance-policy"),
      ),
    ).toMatchObject({ reversible: false })
  })

  it("validates the insurer provider contract", async () => {
    await expect(
      assertPortConforms(insuranceProviderSourcePort, conformingProvider()),
    ).resolves.toBeUndefined()
    await expect(assertPortConforms(insuranceProviderSourcePort, {} as never)).rejects.toThrow(
      /providerId/,
    )
    await expect(
      assertPortConforms(insuranceProviderSourcePort, {
        ...conformingProvider(),
        issue: undefined,
      } as never),
    ).rejects.toThrow(/issue\(\)/)
  })

  it("validates the deployment runtime and customer-portal contracts", async () => {
    await expect(
      assertPortConforms(insuranceRuntimePort, {
        createPiiService: () => ({}) as never,
        bookingIntegration: () => ({}),
      }),
    ).resolves.toBeUndefined()
    await expect(assertPortConforms(insuranceRuntimePort, {} as never)).rejects.toThrow(
      /createPiiService/,
    )

    await expect(
      assertPortConforms(insuranceCustomerPortalPort, {
        listPoliciesForBooking: async () => [],
      }),
    ).resolves.toBeUndefined()
    await expect(assertPortConforms(insuranceCustomerPortalPort, {} as never)).rejects.toThrow(
      /listPoliciesForBooking/,
    )
  })
})

interface OpenApiDocumentSource {
  getOpenAPI31Document(input: { openapi: "3.1.0"; info: { title: string; version: string } }): {
    paths?: Record<string, Record<string, Record<string, unknown>>>
  }
}

function readApiIds(routes: OpenApiDocumentSource): unknown[] {
  const document = routes.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Insurance", version: "1" },
  })
  return Object.values(document.paths ?? {}).flatMap((path) =>
    Object.values(path).map((operation) => operation["x-voyant-api-id"]),
  )
}
