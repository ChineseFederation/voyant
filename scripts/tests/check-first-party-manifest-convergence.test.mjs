import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { inspectFirstPartyManifestConvergence } from "../lib/first-party-manifest-convergence.mjs"

function fixture() {
  const module = {
    kind: "module",
    id: "@acme/loyalty",
    packageName: "@acme/loyalty",
    api: [
      {
        id: "@acme/loyalty#api.admin",
        surface: "admin",
        mount: "loyalty",
        runtime: { entry: "@acme/loyalty", export: "createLoyaltyRuntime" },
      },
    ],
    schema: [{ id: "@acme/loyalty#schema", source: "@acme/loyalty/schema" }],
    migrations: [{ id: "@acme/loyalty#migrations", source: "./migrations" }],
    access: {
      resources: [
        {
          id: "@acme/loyalty#access.loyalty",
          resource: "loyalty",
          label: "Loyalty",
          description: "Manage loyalty accounts.",
          actions: [
            { action: "read", label: "View loyalty", description: "View loyalty accounts." },
            {
              action: "delete",
              label: "Delete loyalty",
              description: "Delete loyalty records.",
              sensitive: true,
            },
          ],
        },
      ],
    },
    tools: [
      {
        id: "@acme/loyalty#tool.get-account",
        name: "get_loyalty_account",
        risk: "low",
        requiredScopes: ["loyalty:read"],
        runtime: { entry: "@acme/loyalty/tools", export: "getLoyaltyAccountTool" },
      },
    ],
    events: [
      {
        id: "@acme/loyalty#event.account.updated",
        eventType: "loyalty.account.updated",
        visibility: "external",
        payloadSchema: {
          type: "object",
          properties: { accountId: { type: "string" } },
          required: ["accountId"],
          additionalProperties: false,
        },
      },
    ],
    webhooks: [
      {
        id: "@acme/loyalty#webhook.account.updated",
        direction: "outbound",
        eventId: "@acme/loyalty#event.account.updated",
      },
    ],
    lifecycle: { uninstall: { default: "retain-data" } },
  }
  return {
    graph: {
      modules: [module],
      extensions: [],
      plugins: [],
      accessCatalog: {
        resources: [
          {
            resource: "loyalty",
            actions: [{ action: "read" }, { action: "delete" }],
          },
        ],
      },
    },
    selections: { modules: ["@acme/loyalty"], extensions: [] },
    workspacePackages: new Map([
      [
        "@acme/loyalty",
        {
          directory: "packages/loyalty",
          manifest: {
            exports: {
              ".": "./src/index.ts",
              "./schema": "./src/schema.ts",
              "./tools": "./src/tools.ts",
              "./voyant": "./src/voyant.ts",
            },
            voyant: {
              schemaVersion: "voyant.package.v1",
              kind: "module",
              manifest: "./voyant",
              schema: "./schema",
            },
          },
        },
      ],
    ]),
    sources: new Map([
      ["packages/loyalty/src/voyant.ts", 'export default defineModule({ id: "@acme/loyalty" })'],
      [
        "packages/loyalty/src/tools.ts",
        "export const getLoyaltyAccountTool = defineTool({ name: 'get_loyalty_account' })",
      ],
    ]),
    toolRuntimeDefinitions: new Map([
      [
        "@acme/loyalty/tools#getLoyaltyAccountTool",
        { name: "get_loyalty_account", requiredScopes: ["loyalty:read"], tier: "read" },
      ],
    ]),
  }
}

describe("first-party manifest convergence", () => {
  it("accepts one complete package-owned module", () => {
    assert.deepEqual(inspectFirstPartyManifestConvergence(fixture()), [])
  })

  it("rejects incomplete access metadata and unmarked privileged actions", () => {
    const input = fixture()
    input.graph.modules[0].access.resources[0].label = undefined
    input.graph.modules[0].access.resources[0].actions[1].sensitive = false
    const failures = inspectFirstPartyManifestConvergence(input).join("\n")
    assert.match(failures, /needs a label/)
    assert.match(failures, /sensitive: true/)
  })

  it("requires tool definitions and manifest declarations to match", () => {
    const input = fixture()
    input.graph.modules[0].tools = []
    assert.match(
      inspectFirstPartyManifestConvergence(input).join("\n"),
      /defineTool export is absent/,
    )
  })

  it("requires external events and webhook APIs to have declarations", () => {
    const input = fixture()
    input.graph.modules[0].webhooks = []
    input.graph.modules[0].api.push({
      id: "@acme/loyalty#api.webhook",
      surface: "webhook",
      runtime: { entry: "@acme/loyalty", export: "createLoyaltyRuntime" },
    })
    const failures = inspectFirstPartyManifestConvergence(input).join("\n")
    assert.match(failures, /external event must have exactly one outbound webhook/)
    assert.match(failures, /webhook API must have exactly one inbound webhook/)
  })

  it("requires protected APIs and tool scopes to resolve through access authority", () => {
    const input = fixture()
    input.graph.modules[0].api[0].mount = "missing"
    input.graph.modules[0].tools[0].requiredScopes = ["loyalty:write"]
    const failures = inspectFirstPartyManifestConvergence(input).join("\n")
    assert.match(failures, /protected API resource missing is absent/)
    assert.match(failures, /required scope loyalty:write is absent/)
  })

  it("requires explicit tool risk and action authority for every non-low-risk tool", () => {
    const input = fixture()
    input.graph.modules[0].tools[0].risk = "medium"
    assert.match(
      inspectFirstPartyManifestConvergence(input).join("\n"),
      /medium-risk tool must bind to a graph action/,
    )
  })

  it("requires graph risk to match the loaded Tool tier", () => {
    const input = fixture()
    input.toolRuntimeDefinitions.get("@acme/loyalty/tools#getLoyaltyAccountTool").tier = "sensitive"

    assert.match(
      inspectFirstPartyManifestConvergence(input).join("\n"),
      /graph risk low is incompatible with Tool tier sensitive/,
    )
  })

  it("requires loaded Tool identity metadata to match graph package authority", () => {
    const input = fixture()
    const definition = input.toolRuntimeDefinitions.get("@acme/loyalty/tools#getLoyaltyAccountTool")
    definition.owner = "@acme/other"
    definition.capabilityId = "@acme/other#tool.get-account"
    definition.requiredScopes = ["loyalty:write"]

    const failures = inspectFirstPartyManifestConvergence(input).join("\n")
    assert.match(failures, /graph unit owner @acme\/loyalty does not match Tool owner/)
    assert.match(failures, /graph capability id does not match Tool capability id/)
    assert.match(failures, /graph scopes.*do not match Tool scopes/)
  })

  it("requires the selected Tool runtime to contribute its declared context", () => {
    const input = fixture()
    input.graph.modules[0].tools[0].context = ["loyalty"]

    assert.match(
      inspectFirstPartyManifestConvergence(input).join("\n"),
      /selected Tool runtimes do not contribute required context \[loyalty\]/,
    )

    const definition = input.toolRuntimeDefinitions.get("@acme/loyalty/tools#getLoyaltyAccountTool")
    input.toolRuntimeDefinitions.set("@acme/loyalty/tools#getLoyaltyAccountTool", {
      definition,
      contextContribution: { context: ["loyalty"] },
    })
    assert.deepEqual(inspectFirstPartyManifestConvergence(input), [])
  })

  it("rejects raw created-target execution outside the action-ledger implementation", () => {
    const input = fixture()
    input.sources.set(
      "packages/loyalty/src/bypass.ts",
      "import { executeCreatedTargetCommand } from '@voyant-travel/action-ledger/created-command'",
    )

    assert.match(
      inspectFirstPartyManifestConvergence(input).join("\n"),
      /raw created-target executor bypasses selected Tool admission authority/,
    )
  })

  it("rejects provider declarations with no deployment selection", () => {
    const input = fixture()
    input.graph.modules[0].providers = [
      {
        id: "@acme/loyalty#provider.local",
        port: "loyalty.transport",
        runtime: { entry: "@acme/loyalty", export: "createLocalProvider" },
      },
    ]
    assert.match(
      inspectFirstPartyManifestConvergence(input).join("\n"),
      /provider must declare an explicit selection/,
    )
  })

  it("rejects opaque first-party event payloads", () => {
    const input = fixture()
    input.graph.modules[0].events[0].payloadSchema = {
      type: "object",
      additionalProperties: true,
    }
    assert.match(
      inspectFirstPartyManifestConvergence(input).join("\n"),
      /event must declare a concrete payload schema/,
    )
  })

  it("rejects relative executable runtime references", () => {
    const input = fixture()
    input.graph.modules[0].api[0].runtime.entry = "./runtime"
    assert.match(
      inspectFirstPartyManifestConvergence(input).join("\n"),
      /must use a published package specifier/,
    )
  })

  it("requires package runtime contributor outputs in provides.ports", () => {
    const input = fixture()
    const pkg = input.workspacePackages.get("@acme/loyalty")
    pkg.manifest.exports["./runtime-contributor"] = "./src/runtime-contributor.ts"
    pkg.manifest.voyant.runtime = {
      entry: "./runtime-contributor",
      export: "createLoyaltyRuntimeContribution",
    }
    input.sources.set(
      "packages/loyalty/src/runtime-contributor.ts",
      "return { [loyaltyRuntimePort.id]: runtime }",
    )

    assert.match(
      inspectFirstPartyManifestConvergence(input).join("\n"),
      /loyaltyRuntimePort\.id is absent from provides\.ports/,
    )

    input.sources.set(
      "packages/loyalty/src/voyant.ts",
      'export default defineModule({ id: "@acme/loyalty", provides: { ports: [providePort(loyaltyRuntimePort)] } })',
    )
    assert.deepEqual(inspectFirstPartyManifestConvergence(input), [])
  })
})
