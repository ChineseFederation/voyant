import { readFileSync } from "node:fs"
import { commerceLegalRuntimePort } from "@voyant-travel/commerce/runtime-port"
import { describe, expect, it } from "vitest"
import * as contractDocumentJob from "../../src/contract-document-job.js"
import { legalVoyantModule } from "../../src/voyant.js"

describe("legal deployment manifest", () => {
  it("publishes only the fixed no-payload recovery job surface", () => {
    expect(Object.keys(contractDocumentJob).sort()).toEqual([
      "legalContractDocumentJobRuntimePort",
      "runDueLegalContractDocumentOperationsJob",
    ])
    expect(contractDocumentJob.runDueLegalContractDocumentOperationsJob).toHaveLength(1)
  })

  it("owns the selected legal package surfaces", () => {
    expect(legalVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/legal",
      packageName: "@voyant-travel/legal",
      provides: {
        ports: [
          { id: commerceLegalRuntimePort.id },
          { id: "legal.runtime" },
          { id: "legal.contract-document.runtime" },
          { id: "legal.document-artifact-provider" },
          { id: "legal.contract-document.job-runtime" },
        ],
      },
      api: [
        {
          id: "@voyant-travel/legal#api.admin",
          surface: "admin",
          mount: "legal",
          openapi: { document: "legal" },
          transactional: true,
          runtime: {
            entry: "@voyant-travel/legal",
            export: "createLegalVoyantRuntime",
          },
        },
        {
          id: "@voyant-travel/legal#api.contract-document",
          surface: "admin",
          resource: "legal",
          openapi: { document: "contract-document" },
          runtime: {
            entry: "@voyant-travel/legal/contract-document-routes",
            export: "createContractDocumentApiModule",
          },
        },
        {
          id: "@voyant-travel/legal#api.public",
          surface: "public",
          mount: "legal",
          openapi: { document: "legal" },
          anonymous: true,
          transactional: true,
          runtime: {
            entry: "@voyant-travel/legal",
            export: "createLegalVoyantRuntime",
          },
        },
      ],
      schema: [{ id: "@voyant-travel/legal#schema" }],
      migrations: [{ id: "@voyant-travel/legal#migrations" }],
      runtimePorts: [
        { id: "legal.runtime" },
        { id: "legal.contract-document.runtime" },
        { id: "legal.document-artifact-provider" },
        { id: "legal.contract-document.job-runtime" },
      ],
    })
    expect(legalVoyantModule.links?.map((link) => link.id)).toEqual([
      "@voyant-travel/legal#linkable.contract",
      "@voyant-travel/legal#linkable.contractTemplate",
      "@voyant-travel/legal#linkable.policy",
      "@voyant-travel/legal#linkable.policyVersion",
      "@voyant-travel/legal#linkable.policyAcceptance",
      "@voyant-travel/legal#linkable.term",
      "@voyant-travel/legal#link.contract-booking",
      "@voyant-travel/legal#link.contract-organization",
      "@voyant-travel/legal#link.contract-person",
      "@voyant-travel/legal#link.contract-supplier",
      "@voyant-travel/legal#link.policy-acceptance-booking",
      "@voyant-travel/legal#link.policy-product",
    ])
    expect(legalVoyantModule.links?.slice(0, 6).map((link) => link.export)).toEqual([
      "contractLinkable",
      "contractTemplateLinkable",
      "policyLinkable",
      "policyVersionLinkable",
      "policyAcceptanceLinkable",
      "legalTermLinkable",
    ])
    expect(legalVoyantModule.events?.map(({ eventType }) => eventType)).toEqual([
      "contract.issued",
      "contract.sent",
      "contract.signed",
      "contract.executed",
      "contract.voided",
      "contract.document.generated",
    ])
    expect(legalVoyantModule.tools).toHaveLength(24)
    expect(legalVoyantModule.actions?.flatMap((action) => action.from?.tools ?? [])).toEqual(
      expect.arrayContaining(legalVoyantModule.tools?.map((tool) => tool.id) ?? []),
    )
    expect(
      legalVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/legal#action.generate-booking-contract-document",
      ),
    ).toMatchObject({
      targetType: "booking",
      commandTargetField: "bookingId",
      targetLifecycle: "existing",
    })
    expect(legalVoyantModule.meta?.agentTools).toBeUndefined()
  })

  it("declares concrete payloads for every emitted legal event", () => {
    const events = new Map(
      legalVoyantModule.events?.map(({ eventType, payloadSchema }) => [eventType, payloadSchema]),
    )

    for (const eventType of [
      "contract.issued",
      "contract.sent",
      "contract.signed",
      "contract.executed",
      "contract.voided",
    ]) {
      expect(events.get(eventType)).toMatchObject({
        type: "object",
        required: expect.arrayContaining([
          "contractId",
          "scope",
          "previousStage",
          "stage",
          "transition",
          "occurredAt",
          "targetKind",
        ]),
        additionalProperties: false,
      })
    }
    expect(events.get("contract.issued")).toMatchObject({
      properties: {
        previousStage: { enum: ["draft"] },
        stage: { const: "issued" },
        transition: { const: "issued" },
      },
    })
    expect(events.get("contract.document.generated")).toMatchObject({
      required: [
        "contractId",
        "contractStatus",
        "attachmentId",
        "attachmentKind",
        "attachmentName",
        "renderedBodyFormat",
        "regenerated",
      ],
      additionalProperties: false,
    })
  })

  it("owns the contract-document actions in the selected Legal graph unit", () => {
    expect(legalVoyantModule.tools).toHaveLength(24)
    expect(
      legalVoyantModule.tools
        ?.filter((tool) => tool.context?.includes("legalContractDocument"))
        .every((tool) => tool.runtime.entry === "@voyant-travel/legal/tools"),
    ).toBe(true)
    expect(
      legalVoyantModule.tools
        ?.filter((tool) => tool.context?.includes("legalContractDocument"))
        .map(({ id }) => id),
    ).toEqual([
      "@voyant-travel/legal#tool.generate-booking-contract-document",
      "@voyant-travel/legal#tool.regenerate-booking-contract-document",
      "@voyant-travel/legal#tool.resolve-contract-document-delivery",
    ])
    expect(
      legalVoyantModule.tools?.find(
        ({ id }) => id === "@voyant-travel/legal#tool.resolve-contract-document-delivery",
      ),
    ).toMatchObject({ requiredScopes: ["legal:read"] })
    expect(
      legalVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/legal#action.resolve-contract-document-delivery",
      ),
    ).toMatchObject({ requiredScopes: ["legal:read"] })
    expect(legalVoyantModule.meta?.agentTools).toBeUndefined()
    for (const actionId of [
      "@voyant-travel/legal#action.generate-booking-contract-document",
      "@voyant-travel/legal#action.regenerate-booking-contract-document",
    ]) {
      expect(legalVoyantModule.actions?.find(({ id }) => id === actionId)).toMatchObject({
        availability: {
          status: "unavailable",
          reasonCode: "provider-not-conformant",
          enableWhen: {
            selectedProviderPorts: {
              mode: "all",
              ports: ["legal.document-artifact-provider"],
            },
          },
        },
        effectBoundary: "multistage",
        existingTarget: { durability: "handler-command-result-v1" },
        durability: {
          strategy: "outbox",
          testReference: "packages/legal/tests/integration/document-operation.test.ts",
        },
      })
    }
    expect(legalVoyantModule.providers).toEqual([
      expect.objectContaining({
        port: "legal.document-artifact-provider",
        selection: { role: "legalDocumentArtifact", value: "standard" },
      }),
    ])
    expect(legalVoyantModule.jobs).toEqual([
      expect.objectContaining({
        id: "legal.contract-document-operations",
        wakeup: true,
        runtime: {
          entry: "@voyant-travel/legal/contract-document-job",
          export: "runDueLegalContractDocumentOperationsJob",
        },
      }),
    ])
    for (const actionId of [
      "@voyant-travel/legal#action.issue-contract",
      "@voyant-travel/legal#action.send-contract",
      "@voyant-travel/legal#action.execute-contract",
    ]) {
      expect(legalVoyantModule.actions?.find(({ id }) => id === actionId)).toMatchObject({
        availability: { status: "available" },
        effectBoundary: "multistage",
        commandTargetField: "contractId",
        targetLifecycle: "existing",
        existingTarget: { durability: "handler-command-result-v1" },
        durability: {
          strategy: "outbox",
          testReference: "packages/legal/tests/integration/contract-lifecycle-command.test.ts",
        },
        policy: "legal.contract-lifecycle.v1",
      })
    }
  })

  it("marks every public OpenAPI operation with its graph API id", () => {
    const document = JSON.parse(
      readFileSync(new URL("../../openapi/storefront/legal.json", import.meta.url), "utf8"),
    )

    expect(publicOperationApiIds(document)).not.toHaveLength(0)
    expect(new Set(publicOperationApiIds(document))).toEqual(
      new Set(["@voyant-travel/legal#api.public"]),
    )
  })

  it("declares every route in the packaged legal admin extension", () => {
    expect(legalVoyantModule.admin?.routes?.map(({ id, path }) => [id, path])).toEqual([
      ["@voyant-travel/legal#admin.route.index", "/legal"],
      ["@voyant-travel/legal#admin.route.contracts-index", "/legal/contracts"],
      ["@voyant-travel/legal#admin.route.contracts-detail", "/legal/contracts/$id"],
      ["@voyant-travel/legal#admin.route.templates-index", "/legal/templates"],
      ["@voyant-travel/legal#admin.route.templates-detail", "/legal/templates/$id"],
      ["@voyant-travel/legal#admin.route.policies-index", "/legal/policies"],
      ["@voyant-travel/legal#admin.route.policies-detail", "/legal/policies/$id"],
      ["@voyant-travel/legal#admin.route.number-series", "/legal/number-series"],
    ])
    expect(
      legalVoyantModule.admin?.routes?.every(
        ({ runtime }) =>
          runtime.entry === "@voyant-travel/legal-react/admin" &&
          runtime.export === "createLegalAdminExtension",
      ),
    ).toBe(true)
    expect(
      legalVoyantModule.admin?.routes?.every(({ requiredScopes }) =>
        requiredScopes?.includes("legal:read"),
      ),
    ).toBe(true)
    expect(legalVoyantModule.admin?.nav).toEqual([
      {
        id: "@voyant-travel/legal#admin.nav.contracts",
        routeId: "@voyant-travel/legal#admin.route.contracts-index",
        label: { namespace: "legal.admin", key: "contractsPage.title" },
      },
      {
        id: "@voyant-travel/legal#admin.nav.templates",
        routeId: "@voyant-travel/legal#admin.route.templates-index",
        label: { namespace: "legal.admin", key: "templatesPage.title" },
      },
      {
        id: "@voyant-travel/legal#admin.nav.policies",
        routeId: "@voyant-travel/legal#admin.route.policies-index",
        label: { namespace: "legal.admin", key: "policiesPage.title" },
      },
      {
        id: "@voyant-travel/legal#admin.nav.number-series",
        routeId: "@voyant-travel/legal#admin.route.number-series",
        label: { namespace: "legal.admin", key: "numberSeriesPage.title" },
      },
    ])
  })
})

function publicOperationApiIds(document: unknown): unknown[] {
  const paths = (document as { paths?: Record<string, Record<string, unknown>> } | undefined)?.paths
  return Object.values(paths ?? {}).flatMap((path) =>
    Object.values(path).map(
      (operation) => (operation as Record<string, unknown>)["x-voyant-api-id"],
    ),
  )
}
