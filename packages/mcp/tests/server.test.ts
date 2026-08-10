// agent-quality: file-size exception -- owner: mcp; end-to-end transport coverage (#3927).
import { readFile } from "node:fs/promises"
import type { VoyantGraphActionDeclaration } from "@voyant-travel/core/project"
import {
  createVoyantGraphRuntime,
  resolveVoyantGraphRuntimeProviders,
  type VoyantGraphRuntime,
  type VoyantGraphRuntimeToolDefinition,
} from "@voyant-travel/framework"
import { requireAuth } from "@voyant-travel/hono/middleware/auth"
import {
  createToolRegistry,
  defineTool,
  READ_ONLY_RISK,
  type ToolContext,
} from "@voyant-travel/tools"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { createGraphMcpApiRoutes, createMcpApiRoutes } from "../src/index.js"
import { createMcpVoyantRuntime } from "../src/runtime.js"
import { mcpVoyantModule } from "../src/voyant.js"

const accessCatalog = {
  resources: [
    {
      id: "catalog",
      unitId: "@voyant-travel/catalog",
      resource: "catalog",
      label: "Catalog",
      description: "Catalog",
      wildcard: "allow" as const,
      actions: [{ action: "read", label: "Read", description: "Read" }],
    },
    {
      id: "notifications",
      unitId: "@voyant-travel/notifications",
      resource: "notifications",
      label: "Notifications",
      description: "Notifications",
      wildcard: "allow" as const,
      actions: [
        {
          action: "send",
          label: "Send",
          description: "Send",
          wildcard: "explicit" as const,
        },
      ],
    },
    {
      id: "records",
      unitId: "@voyant-travel/test",
      resource: "records",
      label: "Records",
      description: "Test records",
      wildcard: "allow" as const,
      actions: [
        { action: "read", label: "Read", description: "Read records" },
        { action: "write", label: "Write", description: "Write records" },
      ],
    },
    {
      id: "secrets",
      unitId: "@voyant-travel/test",
      resource: "secrets",
      label: "Secrets",
      description: "Sensitive test records",
      wildcard: "explicit-resource" as const,
      actions: [
        {
          action: "read",
          label: "Read",
          description: "Read sensitive records",
          sensitive: true,
        },
      ],
    },
  ],
  presets: [],
}

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
}

function rpc(method: string, params: unknown, id: number | string = 1) {
  return {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  }
}

function testExecutionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
  }
}

async function readRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"))
    return JSON.parse(line?.slice("data:".length).trim() ?? "{}")
  }
  return JSON.parse(text)
}

/**
 * Progressive disclosure (voyant#3927): `tools/list` now carries only the tier-0
 * meta-tools. A domain tool's full descriptor is fetched through `describe_tool`
 * — the same descriptor it used to be advertised with — and it is discovered
 * through `search_tools`. These helpers exercise both indirection paths.
 */
async function listedNames(app: Hono): Promise<string[]> {
  const listed = await readRpc(await app.request("/", rpc("tools/list", {})))
  const tools = (listed.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? []
  return tools.map(({ name }) => name)
}

async function describeTool(
  app: Hono,
  name: string,
  resource?: string,
): Promise<{ result?: Record<string, unknown>; structuredContent?: Record<string, unknown> }> {
  const res = await readRpc(
    await app.request(
      "/",
      rpc("tools/call", {
        name: "describe_tool",
        arguments: resource === undefined ? { name } : { name, resource },
      }),
    ),
  )
  const result = res.result as { structuredContent?: Record<string, unknown> } | undefined
  return { result, structuredContent: result?.structuredContent }
}

async function searchToolNames(
  app: Hono,
  args: { query?: string; domain?: string } = {},
): Promise<string[]> {
  const res = await readRpc(
    await app.request("/", rpc("tools/call", { name: "search_tools", arguments: args })),
  )
  const structured = (res.result as { structuredContent?: { tools?: Array<{ name: string }> } })
    ?.structuredContent
  return (structured?.tools ?? []).map(({ name }) => name)
}

/** True when `describe_tool` reports the tool as unavailable (unknown OR unauthorized). */
async function describeIsUnavailable(app: Hono, name: string): Promise<boolean> {
  const res = await readRpc(
    await app.request("/", rpc("tools/call", { name: "describe_tool", arguments: { name } })),
  )
  return (res.result as { isError?: boolean } | undefined)?.isError === true
}

const echoTool = defineTool({
  capabilityId: "@voyant-travel/test#tool.echo",
  owner: "@voyant-travel/test",
  capabilityVersion: "v2",
  name: "echo",
  description: "Echo the text back.",
  aliases: ["echo_text"],
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ text: z.string() }),
  requiredScopes: ["catalog:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { idempotentHint: true },
  async handler({ text }) {
    return { text: `echo: ${text}` }
  },
})

/**
 * A SECOND read in the same domain as {@link echoTool} but behind a different
 * scope, so `test_query` has two resources. Without it every query group in this
 * suite is degenerate (one resource), and "an unauthorized resource is pruned
 * from a group that still exists" cannot be observed at all.
 */
const listEchoesTool = defineTool({
  capabilityId: "@voyant-travel/test#tool.list-echoes",
  owner: "@voyant-travel/test",
  capabilityVersion: "v1",
  name: "list_echoes",
  description: "List prior echoes.",
  inputSchema: z.object({ limit: z.number().int().optional() }),
  outputSchema: z.object({ data: z.array(z.string()), total: z.number() }),
  requiredScopes: ["products:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { idempotentHint: true },
  async handler() {
    return { data: ["echo: a"], total: 1 }
  },
})

const updateRecordTool = defineTool({
  name: "update_record",
  description: "Update a record through a composed input contract.",
  inputSchema: z
    .object({ id: z.string().min(1) })
    .and(z.object({ name: z.string().min(1) }))
    .optional()
    .transform((input) => input),
  outputSchema: z.object({ id: z.string(), name: z.string() }).nullable(),
  requiredScopes: ["records:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    sideEffects: ["data-write"],
  },
  async handler(input) {
    return !input || input.name === "missing" ? null : input
  },
})

const getSensitiveRecordTool = defineTool({
  capabilityId: "@voyant-travel/test#tool.get-sensitive-record",
  owner: "@voyant-travel/test",
  capabilityVersion: "v1",
  name: "get_sensitive_record",
  description: "Read a sensitive record.",
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: z.object({ id: z.string(), classification: z.literal("sensitive") }),
  requiredScopes: ["secrets:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id }) {
    return { id, classification: "sensitive" as const }
  },
})

function buildContext(audience: ToolContext["audience"] = "staff"): ToolContext {
  return {
    db: {},
    actor: "staff",
    audience,
    tenantId: "t1",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
  }
}

interface TestGraphTool extends VoyantGraphRuntimeToolDefinition {
  load<T = unknown>(): Promise<T>
}

interface TestGraphReference {
  id: string
  importEntry: string
  loadModule<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<T>
}

function frameworkRuntime(input: {
  accessCatalog: VoyantGraphRuntime["accessCatalog"]
  tools: readonly TestGraphTool[]
  actions?: readonly VoyantGraphActionDeclaration[]
  references: readonly TestGraphReference[]
}): VoyantGraphRuntime {
  const toolById = new Map(input.tools.map((tool) => [tool.id, tool]))
  const exportByReferenceId = new Map(
    input.tools.map((tool, index) => [tool.referenceId, `testTool${index}`]),
  )
  const referencesById = new Map(input.references.map((reference) => [reference.id, reference]))
  const entries = Object.fromEntries(
    [...new Set(input.references.map(({ importEntry }) => importEntry))].map((importEntry) => [
      importEntry,
      async () => {
        const reference = input.references.find(
          (candidate) => candidate.importEntry === importEntry,
        )
        const namespace = reference ? await reference.loadModule() : {}
        for (const tool of input.tools) {
          const owner = referencesById.get(tool.referenceId)
          if (owner?.importEntry !== importEntry) continue
          namespace[exportByReferenceId.get(tool.referenceId)!] = await tool.load()
        }
        return namespace
      },
    ]),
  )
  const unitIds = [...new Set(input.tools.map(({ unitId }) => unitId))]
  const accessScopes = input.accessCatalog.resources.flatMap((resource) =>
    resource.actions.map((action) => `${resource.resource}:${action.action}`),
  )
  return createVoyantGraphRuntime({
    graphHash: "sha256:mcp-test",
    accessCatalog: input.accessCatalog,
    entries,
    modules: unitIds.map((unitId, order) => {
      const tools = input.tools.filter((tool) => tool.unitId === unitId)
      const referenceIds = new Set(tools.map(({ referenceId }) => referenceId))
      const actions = (input.actions ?? [])
        .filter((action) =>
          (action.from?.tools ?? []).some((toolId) => toolById.get(toolId)?.unitId === unitId),
        )
        .map((action) => ({
          ...action,
          unitId,
          requiredScopes: action.requiredScopes ?? [],
          from: {
            routes: action.from?.routes ?? [],
            tools: action.from?.tools ?? [],
            events: action.from?.events ?? [],
            webhooks: action.from?.webhooks ?? [],
          },
        }))
      return {
        id: unitId,
        kind: "module" as const,
        packageName: unitId,
        order,
        accessScopes: order === 0 ? accessScopes : [],
        references: input.references
          .filter(({ id }) => referenceIds.has(id))
          .map((reference) => ({
            id: reference.id,
            unitId,
            facet: "tools.runtime" as const,
            entityId: tools.find(({ referenceId }) => referenceId === reference.id)!.id,
            runtime: {
              entry: reference.importEntry,
              export: exportByReferenceId.get(reference.id)!,
            },
            importEntry: reference.importEntry,
          })),
        tools,
        actions,
        selectedIds: {
          routes: [],
          tools: tools.map(({ id }) => id),
          events: [],
          webhooks: [],
        },
        routes: [],
      }
    }),
    plugins: [],
  })
}

function conditionalFrameworkRuntime(options: { providerSelected?: boolean } = {}) {
  const providerSelected = options.providerSelected ?? true
  const unitId = "@voyant-travel/test"
  const portId = "catalog.durable-echo"
  const toolId = "@voyant-travel/test#tool.echo"
  const loadTool = vi.fn(async () => ({ echoTool }))
  const provider = { echo: vi.fn() }
  const testProvider = vi.fn()
  const runtime = createVoyantGraphRuntime({
    graphHash: "sha256:mcp-conditional-test",
    providerSelections: providerSelected ? { catalog: "durable" } : {},
    accessCatalog,
    entries: {
      "@voyant-travel/catalog/provider": async () => ({
        createProvider: () => provider,
      }),
      "@voyant-travel/catalog/port": async () => ({
        durableEchoPort: { id: portId, test: testProvider },
      }),
      "@voyant-travel/catalog/tools": loadTool,
    },
    modules: [
      {
        id: unitId,
        kind: "module",
        packageName: unitId,
        order: 0,
        references: [
          {
            id: "catalog-provider",
            unitId,
            facet: "providers.runtime",
            entityId: "@voyant-travel/test#provider.durable",
            runtime: { entry: "./provider", export: "createProvider" },
            importEntry: "@voyant-travel/catalog/provider",
          },
          {
            id: "catalog-port-conformance",
            unitId,
            facet: "runtimePorts.conformance",
            entityId: portId,
            runtime: { entry: "./port", export: "durableEchoPort" },
            importEntry: "@voyant-travel/catalog/port",
          },
        ],
        providers: [
          {
            unitId,
            declaration: {
              id: "@voyant-travel/test#provider.durable",
              port: portId,
              selection: { role: "catalog", value: "durable" },
              runtime: { entry: "./provider", export: "createProvider" },
            },
            referenceId: "catalog-provider",
          },
        ],
        provisionalReferences: providerSelected
          ? [
              {
                id: "catalog-echo-runtime",
                unitId,
                facet: "tools.runtime",
                entityId: toolId,
                runtime: { entry: "./tools", export: "echoTool" },
                importEntry: "@voyant-travel/catalog/tools",
              },
            ]
          : [],
        provisionalTools: providerSelected
          ? [
              {
                id: toolId,
                unitId,
                name: "echo",
                referenceId: "catalog-echo-runtime",
                requiredScopes: ["catalog:read"],
                risk: "low",
              },
            ]
          : [],
        requiredPorts: [portId],
        runtimePorts: [portId],
        runtimePortConformance: [{ portId, referenceId: "catalog-port-conformance" }],
        accessScopes: accessCatalog.resources.flatMap((resource) =>
          resource.actions.map((action) => `${resource.resource}:${action.action}`),
        ),
        actions: [
          {
            id: "@voyant-travel/test#action.echo",
            unitId,
            version: "v1",
            kind: "read",
            targetType: "echo",
            availability: {
              status: "unavailable",
              reasonCode: "provider-not-durable",
              enableWhen: {
                selectedProviderPorts: { mode: "all", ports: [portId] },
              },
            },
            risk: "low",
            ledger: "optional",
            requiredScopes: ["catalog:read"],
            from: { routes: [], tools: [toolId], events: [], webhooks: [] },
          },
        ],
        selectedIds: { routes: [], tools: [], events: [], webhooks: [] },
        routes: [],
      },
    ],
    plugins: [],
  })
  return { loadTool, portId, provider, runtime, testProvider }
}

/** Mount the MCP app behind a middleware that seeds the caller's granted scopes. */
function appWithScopes(scopes: string[], audience: ToolContext["audience"] = "staff"): Hono {
  const registry = createToolRegistry()
  registry.register(echoTool)
  registry.register(listEchoesTool)
  registry.register(updateRecordTool)
  registry.register(getSensitiveRecordTool)
  const mcp = createMcpApiRoutes({
    accessCatalog,
    registry,
    buildContext: () => buildContext(audience),
  })

  const outer = new Hono()
  outer.use("*", async (c, next) => {
    c.set("scopes", scopes)
    await next()
  })
  outer.route("/", mcp)
  return outer
}

async function selectedRuntimeRoutes() {
  const runtimeTool = {
    id: "@voyant-travel/test#tool.echo",
    unitId: "@voyant-travel/test",
    name: "echo",
    requiredScopes: ["catalog:read"],
    risk: "low" as const,
    referenceId: "test-tools",
    async load<T>() {
      return echoTool as T
    },
  }
  const module = await createMcpVoyantRuntime({
    graph: frameworkRuntime({
      accessCatalog,
      tools: [runtimeTool],
      references: [
        {
          id: "test-tools",
          importEntry: "@voyant-travel/test/tools",
          async loadModule<T extends Record<string, unknown>>() {
            return {} as T
          },
        },
      ],
    }),
    runtimePorts: {},
  } as never)
  const routes = await module.lazyAdminRoutes?.()
  if (!routes) throw new Error("MCP selected runtime did not expose admin routes")
  return routes
}

describe("createMcpApiRoutes", () => {
  it("owns its concrete HTTP operations and OpenAPI document", async () => {
    expect(mcpVoyantModule.api).toEqual([
      expect.objectContaining({
        id: "@voyant-travel/mcp#api.admin",
        surface: "admin",
        mount: "mcp",
        methods: ["GET", "POST"],
        openapi: { document: "mcp" },
      }),
    ])

    const document = JSON.parse(
      await readFile(new URL("../openapi/admin/mcp.json", import.meta.url), "utf8"),
    ) as { paths: Record<string, Record<string, Record<string, unknown>>> }
    const claims = operationClaims(document.paths)
    const app = createMcpApiRoutes({ accessCatalog, registry: createToolRegistry(), buildContext })
    const liveDocument = app.getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "test", version: "1.0.0" },
    })
    const livePaths = Object.fromEntries(
      Object.entries(liveDocument.paths ?? {}).map(([path, item]) => [
        `/v1/admin/mcp${path === "/" ? "" : path}`,
        item,
      ]),
    ) as Record<string, Record<string, Record<string, unknown>>>

    expect(operationClaims(livePaths)).toEqual(claims)
    expect(claims).toEqual([
      ["GET", "/v1/admin/mcp/manifest", "@voyant-travel/mcp#api.admin"],
      ["POST", "/v1/admin/mcp", "@voyant-travel/mcp#api.admin"],
    ])
  })

  function operationClaims(paths: Record<string, Record<string, Record<string, unknown>>>) {
    return Object.entries(paths)
      .flatMap(([path, pathItem]) =>
        Object.entries(pathItem).map(([method, operation]) => [
          method.toUpperCase(),
          path,
          operation["x-voyant-api-id"],
        ]),
      )
      .sort((left, right) => left.join(":").localeCompare(right.join(":")))
  }

  it("advertises only tier-0 meta-tools and describes an authorized tool on demand", async () => {
    const app = appWithScopes(["catalog:read"])

    // tools/list is now just tier 0 — the meta-tools of #3927 plus the guide
    // layer of #3931, which has to be resident because there is no eager domain
    // surface left to hint at what this deployment does.
    expect((await listedNames(app)).sort()).toEqual([
      "call_tool",
      "describe_tool",
      "search_tools",
      "voyant_glossary",
      "voyant_guide",
    ])

    // The lazy tool is discoverable through search_tools and its full descriptor
    // — output schema, annotations, discovery metadata — comes from describe_tool.
    expect(await searchToolNames(app, { query: "echo" })).toContain("echo")
    // Domain is an optional ranking hint, not an authority boundary. Agents use
    // familiar labels such as "crm", "billing", or "all" that need not match
    // package-owned domain ids; a wrong guess must not turn a valid query into a
    // dead end that requires another discovery round-trip.
    expect(await searchToolNames(app, { query: "echo", domain: "crm" })).toContain("echo")
    expect(
      await searchToolNames(app, {
        query: "echo text with status access details for the roster",
      }),
    ).toContain("echo")
    expect((await describeTool(app, "echo")).structuredContent).toMatchObject({
      name: "echo",
      outputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        "voyant.travel/tool": {
          capabilityId: "@voyant-travel/test#tool.echo",
          owner: "@voyant-travel/test",
          capabilityVersion: "v2",
          requiredScopes: ["catalog:read"],
          audience: { source: "grant", allowed: ["staff"] },
          tier: "read",
          riskPolicy: READ_ONLY_RISK,
        },
      },
    })
    expect((await describeTool(app, "echo_text")).structuredContent).toMatchObject({
      name: "echo_text",
      _meta: { "voyant.travel/tool": { aliasFor: "echo" } },
    })

    const called = await readRpc(
      await app.request("/", rpc("tools/call", { name: "echo", arguments: { text: "hi" } })),
    )
    const content = (called.result as { content?: Array<{ text: string }> } | undefined)?.content
    expect(content?.[0]?.text).toContain("echo: hi")
    const structured = (called.result as { structuredContent?: { text?: string } } | undefined)
      ?.structuredContent
    expect(structured?.text).toBe("echo: hi")

    const aliasCalled = await readRpc(
      await app.request("/", rpc("tools/call", { name: "echo_text", arguments: { text: "hi" } })),
    )
    expect(
      (aliasCalled.result as { structuredContent?: { text?: string } })?.structuredContent?.text,
    ).toBe("echo: hi")
  })

  it("binds stable graph identity and rejects graph/runtime metadata drift", async () => {
    const graphEchoTool = { ...echoTool, capabilityId: undefined, owner: undefined }
    const runtimeTool = {
      id: "@voyant-travel/catalog#tool.echo",
      unitId: "@voyant-travel/catalog",
      name: "echo",
      requiredScopes: ["catalog:read"],
      risk: "low" as const,
      referenceId: "catalog-echo-runtime",
      async load<T>() {
        return graphEchoTool as T
      },
    }
    const references = [
      {
        id: "catalog-echo-runtime",
        importEntry: "@voyant-travel/catalog/tools",
        async loadModule<T extends Record<string, unknown>>() {
          return {} as T
        },
      },
    ]
    const actions = [
      {
        id: "@voyant-travel/catalog#action.echo",
        version: "v1",
        kind: "read" as const,
        targetType: "echo",
        risk: "low" as const,
        ledger: "optional" as const,
        approval: "never" as const,
        from: { tools: ["@voyant-travel/catalog#tool.echo"] },
      },
    ]
    const graphApp = await createGraphMcpApiRoutes({
      runtime: frameworkRuntime({
        accessCatalog,
        tools: [runtimeTool],
        actions,
        references,
      }),
      buildContext: () => buildContext(),
      providedContext: ["toolActionPolicy"],
    })
    const outer = new Hono()
    outer.use("*", async (c, next) => {
      c.set("scopes", ["catalog:read"])
      await next()
    })
    outer.route("/", graphApp)
    const manifest = (await (await outer.request("/manifest")).json()) as {
      tools: Array<{ capabilityId: string; owner: string; deploymentRisk: string }>
    }
    expect(manifest.tools[0]).toMatchObject({
      capabilityId: "@voyant-travel/catalog#tool.echo",
      owner: "@voyant-travel/catalog",
      deploymentRisk: "low",
    })

    await expect(
      createGraphMcpApiRoutes({
        runtime: frameworkRuntime({ accessCatalog, tools: [runtimeTool], actions, references }),
        buildContext: () => buildContext(),
      }),
    ).rejects.toThrow(/toolActionPolicy/)

    await expect(
      createGraphMcpApiRoutes({
        runtime: frameworkRuntime({
          accessCatalog,
          tools: [{ ...runtimeTool, name: "drifted_echo" }],
          actions: [
            {
              id: "@voyant-travel/catalog#action.echo",
              version: "v1",
              kind: "read",
              targetType: "echo",
              risk: "low",
              ledger: "optional",
              from: { tools: ["@voyant-travel/catalog#tool.echo"] },
            },
          ],
          references,
        }),
        buildContext: () => buildContext(),
      }),
    ).rejects.toThrow(/must declare name "drifted_echo"/)

    await expect(
      createGraphMcpApiRoutes({
        runtime: frameworkRuntime({
          accessCatalog,
          tools: [{ ...runtimeTool, risk: "high" }],
          actions: [],
          references,
        }),
        buildContext: () => buildContext(),
      }),
    ).rejects.toThrow(/no selected graph action policy/)

    const unavailableToolLoad = vi.fn(runtimeTool.load)
    expect(() =>
      frameworkRuntime({
        accessCatalog,
        tools: [{ ...runtimeTool, load: unavailableToolLoad }],
        actions: [
          {
            ...actions[0],
            availability: {
              status: "unavailable" as const,
              reasonCode: "unsafe-nontransactional-effect",
            },
          },
        ],
        references,
      }),
    ).toThrow(/unavailable action .* exposes Tool/)
    expect(unavailableToolLoad).not.toHaveBeenCalled()

    const provisionalToolLoad = vi.fn(runtimeTool.load)
    const provisionalRuntime = {
      accessCatalog,
      tools: [{ ...runtimeTool, load: provisionalToolLoad }],
      actions: [
        {
          ...actions[0],
          availability: {
            status: "unavailable" as const,
            reasonCode: "provider-not-durable",
            enableWhen: {
              selectedProviderPorts: {
                mode: "all" as const,
                ports: ["notifications.durable-send"],
              },
            },
          },
        },
      ],
      references,
    }
    await expect(
      createGraphMcpApiRoutes({
        runtime: provisionalRuntime as never,
        buildContext: () => buildContext(),
        providedContext: ["toolActionPolicy"],
      }),
    ).rejects.toThrow(/NOT_FRAMEWORK_OWNED/)
    expect(provisionalToolLoad).not.toHaveBeenCalled()

    const activatedToolLoad = vi.fn(runtimeTool.load)
    await expect(
      createGraphMcpApiRoutes({
        runtime: {
          ...provisionalRuntime,
          tools: [{ ...runtimeTool, load: activatedToolLoad }],
          actions: [
            {
              ...actions[0],
              availability: { status: "available" as const },
            },
          ],
        } as never,
        buildContext: () => buildContext(),
        providedContext: ["toolActionPolicy"],
      }),
    ).rejects.toThrow(/NOT_FRAMEWORK_OWNED/)
    expect(activatedToolLoad).not.toHaveBeenCalled()
  })

  it("exposes a conditional Tool only from the provider-preflighted framework view", async () => {
    const { loadTool, portId, provider, runtime, testProvider } = conditionalFrameworkRuntime()

    expect(Reflect.set(runtime.actions[0]!.availability!, "status", "available")).toBe(false)
    expect(
      Reflect.deleteProperty(
        runtime.actions[0]!.availability!.enableWhen!.selectedProviderPorts,
        "ports",
      ),
    ).toBe(false)
    expect(Reflect.set(runtime.references[0]!, "load", vi.fn())).toBe(false)
    await expect(
      createGraphMcpApiRoutes({
        runtime,
        buildContext: () => buildContext(),
      }),
    ).rejects.toThrow(/NOT_ACTIVATED/)
    expect(loadTool).not.toHaveBeenCalled()

    const providers = await resolveVoyantGraphRuntimeProviders(runtime, { ports: [portId] })
    const activated = await providers.activateRuntime()
    expect(testProvider).toHaveBeenCalledWith(provider)
    expect(Reflect.set(activated.actions[0]!.availability!, "status", "unavailable")).toBe(false)
    expect(Reflect.set(activated.tools[0]!, "load", vi.fn())).toBe(false)

    const routes = await createGraphMcpApiRoutes({
      runtime: activated,
      buildContext: () => buildContext(),
      providedContext: ["toolActionPolicy"],
    })
    const app = new Hono()
    app.use("*", async (c, next) => {
      c.set("scopes", ["catalog:read"])
      await next()
    })
    app.route("/", routes)
    const manifest = (await (await app.request("/manifest")).json()) as {
      tools: Array<{ name: string }>
    }
    expect(manifest.tools.map(({ name }) => name)).toEqual(["echo"])
    expect(loadTool).toHaveBeenCalledOnce()
  })

  it("keeps a conditional Tool hidden when its optional provider is absent", async () => {
    const { loadTool, runtime } = conditionalFrameworkRuntime({ providerSelected: false })

    const routes = await createGraphMcpApiRoutes({
      runtime,
      buildContext: () => buildContext(),
      providedContext: ["toolActionPolicy"],
    })
    const app = new Hono()
    app.route("/", routes)
    const manifest = (await (await app.request("/manifest")).json()) as {
      tools: Array<{ name: string }>
    }
    expect(manifest.tools).toEqual([])
    expect(loadTool).not.toHaveBeenCalled()
  })

  it("propagates created-target handler policy without advertising caller-owned target identity", async () => {
    let handlerCalls = 0
    const createNotificationTool = defineTool({
      name: "create_notification",
      description: "Create a notification",
      inputSchema: z.object({ message: z.string() }),
      outputSchema: z.object({ notificationId: z.string() }),
      requiredScopes: ["notifications:send"],
      tier: "write",
      riskPolicy: {
        destructive: false,
        reversible: true,
        dryRunSupported: false,
        sideEffects: ["data-write"],
      },
      actionPolicyEnforcement: "handler",
      async handler() {
        handlerCalls += 1
        return { notificationId: "notification_1" }
      },
    })
    const toolId = "@voyant-travel/notifications#tool.create-notification"
    const graphApp = await createGraphMcpApiRoutes({
      runtime: frameworkRuntime({
        accessCatalog,
        tools: [
          {
            id: toolId,
            unitId: "@voyant-travel/notifications",
            name: "create_notification",
            requiredScopes: ["notifications:send"],
            risk: "medium",
            referenceId: "notifications-create-runtime",
            async load<T>() {
              return createNotificationTool as T
            },
          },
        ],
        actions: [
          {
            id: "@voyant-travel/notifications#action.create-notification",
            version: "v1",
            kind: "execute",
            targetType: "notification",
            targetLifecycle: "created",
            createdTarget: {
              commandTargetType: "notification-command",
              resultReferenceType: "notification",
              durability: "handler-command-claim-v1",
            },
            risk: "medium",
            ledger: "required",
            approval: "never",
            from: { tools: [toolId] },
          },
        ],
        references: [
          {
            id: "notifications-create-runtime",
            importEntry: "@voyant-travel/notifications/tools",
            async loadModule<T extends Record<string, unknown>>() {
              return {} as T
            },
          },
        ],
      }),
      buildContext: () => buildContext(),
    })
    const outer = new Hono()
    outer.use("*", async (c, next) => {
      c.set("scopes", ["notifications:send"])
      await next()
    })
    outer.route("/", graphApp)

    const listedTool = (await describeTool(outer, "create_notification")).structuredContent as
      | {
          name: string
          inputSchema: {
            properties?: {
              _voyant?: { properties?: Record<string, unknown>; required?: string[] }
            }
          }
          _meta: Record<string, unknown>
        }
      | undefined
    const invocationSchema = listedTool?.inputSchema.properties?._voyant
    expect(invocationSchema?.properties).toHaveProperty("reasonCode")
    expect(invocationSchema?.properties).toHaveProperty("confirmed")
    expect(invocationSchema?.required ?? []).not.toContain("confirmed")
    expect(invocationSchema?.properties).not.toHaveProperty("targetId")
    expect(invocationSchema?.required ?? []).not.toContain("targetId")
    expect(listedTool?._meta).toMatchObject({
      "voyant.travel/tool": {
        actionPolicy: {
          targetLifecycle: "created",
          createdTarget: {
            commandTargetType: "notification-command",
            resultReferenceType: "notification",
            durability: "handler-command-claim-v1",
          },
          enforcement: "handler",
          invocation: { requiredFields: ["idempotencyKey"] },
        },
      },
    })

    const manifest = (await (await outer.request("/manifest")).json()) as {
      tools: Array<{
        name: string
        actionPolicy?: {
          targetLifecycle?: string
          createdTarget?: Record<string, unknown>
          invocation: { requiredFields: string[] }
        }
      }>
    }
    expect(manifest.tools.find(({ name }) => name === "create_notification")?.actionPolicy).toEqual(
      expect.objectContaining({
        targetLifecycle: "created",
        createdTarget: {
          commandTargetType: "notification-command",
          resultReferenceType: "notification",
          durability: "handler-command-claim-v1",
        },
        invocation: expect.objectContaining({ requiredFields: ["idempotencyKey"] }),
      }),
    )

    const called = await readRpc(
      await outer.request(
        "/",
        rpc("tools/call", {
          name: "create_notification",
          arguments: {
            message: "hello",
            _voyant: {
              idempotencyKey: "notification-command-1",
              reasonCode: "operator-request",
            },
          },
        }),
      ),
    )
    expect((called.result as { structuredContent?: unknown }).structuredContent).toEqual({
      notificationId: "notification_1",
    })
    expect(handlerCalls).toBe(1)
  })

  it("rejects a domain input field reserved for action invocation metadata", async () => {
    const conflictingTool = defineTool({
      name: "conflicting_control",
      description: "Invalid Tool that collides with framework action controls",
      inputSchema: z.object({ _voyant: z.string() }),
      outputSchema: z.object({ ok: z.boolean() }),
      requiredScopes: ["catalog:read"],
      tier: "read",
      riskPolicy: READ_ONLY_RISK,
      actionPolicyEnforcement: "handler",
      async handler() {
        return { ok: true }
      },
    })
    const toolId = "@voyant-travel/catalog#tool.conflicting-control"

    const routes = await createGraphMcpApiRoutes({
      runtime: frameworkRuntime({
        accessCatalog,
        tools: [
          {
            id: toolId,
            unitId: "@voyant-travel/catalog",
            name: "conflicting_control",
            requiredScopes: ["catalog:read"],
            risk: "low",
            referenceId: "conflicting-control-runtime",
            async load<T>() {
              return conflictingTool as T
            },
          },
        ],
        actions: [
          {
            id: "@voyant-travel/catalog#action.conflicting-control",
            version: "v1",
            kind: "read",
            targetType: "catalog",
            risk: "low",
            ledger: "optional",
            from: { tools: [toolId] },
          },
        ],
        references: [
          {
            id: "conflicting-control-runtime",
            importEntry: "@voyant-travel/catalog/tools",
            async loadModule<T extends Record<string, unknown>>() {
              return {} as T
            },
          },
        ],
      }),
      buildContext: () => buildContext(),
    })
    const outer = new Hono()
    let caught: Error | undefined
    outer.onError((error, c) => {
      caught = error
      return c.text("invalid Tool schema", 500)
    })
    outer.use("*", async (c, next) => {
      c.set("scopes", ["catalog:read"])
      await next()
    })
    outer.route("/", routes)

    // The reserved-field conflict is raised when the tool's schema is projected.
    // A flat-name tools/call registers the lazy tool on demand, which projects it
    // and surfaces the same rejection as eager registration used to.
    const response = await outer.request(
      "/",
      rpc("tools/call", { name: "conflicting_control", arguments: {} }),
    )

    expect(response.status).toBe(500)
    expect(caught?.message).toMatch(/input conflicts with reserved action metadata field "_voyant"/)
  })

  it("hides a tool from grant audiences outside its declared audience policy", async () => {
    const app = appWithScopes(["catalog:read"], "customer")
    const listed = await readRpc(await app.request("/", rpc("tools/list", {})))
    const tools = (listed.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? []
    expect(tools.map((tool) => tool.name)).not.toContain("echo")

    const manifest = (await (await app.request("/manifest")).json()) as {
      tools: Array<{ name: string }>
    }
    expect(manifest.tools.map((tool) => tool.name)).not.toContain("echo")
  })

  it("hides and refuses a tool when the caller lacks its scopes", async () => {
    const app = appWithScopes(["products:read"])

    const listed = await readRpc(await app.request("/", rpc("tools/list", {})))
    const tools = (listed.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? []
    expect(tools.map((t) => t.name)).not.toContain("echo")

    const called = await readRpc(
      await app.request("/", rpc("tools/call", { name: "echo", arguments: { text: "hi" } })),
    )
    // Unauthorized tool is unregistered → the call does not succeed with the echo payload.
    const content = (called.result as { content?: Array<{ text: string }> } | undefined)?.content
    const echoed = content?.some((part) => part.text?.includes("echo: hi")) ?? false
    expect(echoed).toBe(false)
    expect(called.error ?? (called.result as { isError?: boolean })?.isError).toBeTruthy()
  })

  it("serves the contract-versioned manifest filtered by authorization", async () => {
    const authorized = await appWithScopes(["catalog:read"]).request("/manifest")
    const body = (await authorized.json()) as {
      version: string
      tools: Array<{
        name: string
        capabilityId: string
        outputSchema: Record<string, unknown>
        requiredScopes: string[]
      }>
    }
    expect(body.version).toBeTruthy()
    expect(body.tools.map((t) => t.name)).toContain("echo")
    expect(body.tools.find((t) => t.name === "echo")).toMatchObject({
      capabilityId: "@voyant-travel/test#tool.echo",
      outputSchema: { type: "object" },
    })

    const denied = await appWithScopes([]).request("/manifest")
    const deniedBody = (await denied.json()) as { tools: Array<{ name: string }> }
    expect(deniedBody.tools.map((t) => t.name)).not.toContain("echo")
  })

  it("does not expose the removed raw notification mutation through MCP", async () => {
    for (const scopes of [["*"], ["notifications:*"], ["*:send"], ["notifications:send"]]) {
      const listed = await readRpc(await appWithScopes(scopes).request("/", rpc("tools/list", {})))
      const tools = (listed.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? []
      expect(tools.map((t) => t.name)).not.toContain("send_notification")
      const called = await readRpc(
        await appWithScopes(scopes).request(
          "/",
          rpc("tools/call", {
            name: "send_notification",
            arguments: { templateSlug: "booking-confirmed", to: "customer@example.test" },
          }),
        ),
      )
      expect(called.error ?? (called.result as { isError?: boolean })?.isError).toBeTruthy()
    }
  })

  it("preserves composed object inputs and applies the same nullable output envelope to schema and data", async () => {
    const app = appWithScopes(["records:write"])
    const tool = (await describeTool(app, "update_record")).structuredContent as
      | {
          name: string
          inputSchema?: Record<string, unknown>
          outputSchema?: Record<string, unknown>
          _meta?: Record<string, unknown>
        }
      | undefined

    expect(tool?._meta).toMatchObject({ "voyant.travel/tool": { tier: "write" } })
    const serializedInput = JSON.stringify(tool?.inputSchema)
    expect(serializedInput).toContain('"id"')
    expect(serializedInput).toContain('"name"')
    expect(serializedInput).toContain('"required"')
    expect(tool?.outputSchema).toMatchObject({
      type: "object",
      properties: { result: {} },
      required: ["result"],
    })

    const updated = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "update_record",
          arguments: { id: "record_1", name: "Updated" },
        }),
      ),
    )
    expect(updated.result).toMatchObject({
      structuredContent: { result: { id: "record_1", name: "Updated" } },
    })

    const missing = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "update_record",
          arguments: { id: "record_404", name: "missing" },
        }),
      ),
    )
    expect(missing.result).toMatchObject({ structuredContent: { result: null } })
  })

  it("prunes an unauthorized resource from a query group that still exists", async () => {
    // The other pruning tests cover the DEGENERATE case: a group whose only read
    // is unauthorized disappears entirely. That does not demonstrate the property
    // the projection actually claims — that a group survives with a SUBSET of its
    // resources when the caller holds some of their scopes but not others.
    //
    // `test_query` groups `list_echoes` (products:read) and `get_sensitive_record`
    // (secrets:read), so holding one scope must expose one resource and hide the
    // other — in discovery AND at dispatch.
    const partial = appWithScopes(["products:read"])

    expect(await searchToolNames(partial, { query: "echoes" })).toContain("test_query")

    const described = (await describeTool(partial, "test_query")).structuredContent as {
      _meta?: { "voyant.travel/tool"?: { resources?: Array<{ resource: string }> } }
    }
    const exposed = (described._meta?.["voyant.travel/tool"]?.resources ?? []).map(
      ({ resource }) => resource,
    )
    expect(exposed).toContain("echoes")
    expect(exposed).not.toContain("sensitive_record")

    // Discovery pruning is not enough on its own — an unauthorized resource must
    // also be uncallable, or the group becomes a scope-bypass.
    const denied = await readRpc(
      await partial.request(
        "/",
        rpc("tools/call", {
          name: "test_query",
          arguments: { resource: "sensitive_record" },
        }),
      ),
    )
    expect(JSON.stringify(denied.result)).not.toContain("classified")

    // With both grants, both resources are present.
    const full = appWithScopes(["products:read", "secrets:read"])
    const bothDescribed = (await describeTool(full, "test_query")).structuredContent as {
      _meta?: { "voyant.travel/tool"?: { resources?: Array<{ resource: string }> } }
    }
    const bothExposed = (bothDescribed._meta?.["voyant.travel/tool"]?.resources ?? []).map(
      ({ resource }) => resource,
    )
    expect(bothExposed).toContain("echoes")
    expect(bothExposed).toContain("sensitive_record")
  })

  it("accepts a client-namespaced tool name without costing a round trip", async () => {
    // Models routinely emit `functions.<tool>` — an artifact of their own
    // tool-calling layer, not of this surface. Measured against the real graph it
    // cost a wasted call in nearly every write journey: dispatch failed, the agent
    // read the "call it as X" hint, and repeated itself. Unambiguous to accept,
    // because no tool name here contains a dot.
    const app = appWithScopes(["products:read", "secrets:read"])
    const res = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "call_tool",
          arguments: { name: "functions.test_query", arguments: { resource: "echoes" } },
        }),
      ),
    )
    expect((res.result as { isError?: boolean })?.isError).not.toBe(true)
  })

  it("still reports the name the caller actually sent when it cannot resolve", async () => {
    // The hint is only useful if it echoes what was typed; resolving internally
    // must not rewrite the error into a name the caller never used.
    const app = appWithScopes(["products:read"])
    const res = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", { name: "call_tool", arguments: { name: "functions.nope_at_all" } }),
      ),
    )
    expect(JSON.stringify(res.result)).toContain("functions.nope_at_all")
  })

  it("narrows a query descriptor to one resource when describe_tool is given one", () => {
    // Collapsing the reads (voyant#3932) moved the discovery bill rather than
    // removing it: a query descriptor is the union of every member's input schema,
    // so an agent that wants ONE resource still pays for all of them. Measured on
    // the selected operator graph, `bookings_query` cost 20,573 bytes across 22
    // branches; narrowed it costs 1,811 — a 91% cut, and 74% across all 24 query
    // tools. This is the tier-0 argument of voyant#3927 applied one layer down.
    return (async () => {
      const app = appWithScopes(["products:read", "secrets:read"])
      const full = (await describeTool(app, "test_query")).structuredContent as {
        inputSchema?: { oneOf?: unknown[] }
        _meta?: { "voyant.travel/tool"?: { resources?: Array<{ resource: string }> } }
      }
      // Both resources are present, and the union carries a branch per resource.
      expect(full.inputSchema?.oneOf).toHaveLength(2)

      const narrowed = (await describeTool(app, "test_query", "echoes")).structuredContent as {
        inputSchema?: { oneOf?: unknown[]; properties?: Record<string, unknown> }
        _meta?: { "voyant.travel/tool"?: { resources?: Array<{ resource: string }> } }
      }
      // A single branch collapses out of the union into a plain object schema.
      expect(narrowed.inputSchema?.oneOf).toBeUndefined()
      expect(narrowed.inputSchema?.properties).toHaveProperty("resource")
      // The scope metadata narrows with it — leaving all N tuples in place would
      // put most of the saving straight back.
      const exposed = (narrowed._meta?.["voyant.travel/tool"]?.resources ?? []).map(
        ({ resource }) => resource,
      )
      expect(exposed).toEqual(["echoes"])

      expect(JSON.stringify(narrowed).length).toBeLessThan(JSON.stringify(full).length)
    })()
  })

  it("rejects an unknown describe_tool resource with the valid names", async () => {
    // Failing closed matters more here than usual: an unknown resource used to
    // fall through to a branchless `{ resource: string }` schema, which reads as a
    // valid answer and tells the agent nothing. Return the candidates so the retry
    // is one step rather than a re-discovery.
    const app = appWithScopes(["products:read", "secrets:read"])
    const res = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "describe_tool",
          arguments: { name: "test_query", resource: "echos" },
        }),
      ),
    )
    expect((res.result as { isError?: boolean })?.isError).toBe(true)
    const body = JSON.stringify(res.result)
    expect(body).toContain("echoes")
    expect(body).toContain("NOT_FOUND")
  })

  it("still describes an unnarrowed query tool for a client that sends no resource", async () => {
    // `resource` is additive. A client written against the pre-narrowing contract
    // must keep getting the full union rather than an error or an empty schema.
    const app = appWithScopes(["products:read", "secrets:read"])
    const described = (await describeTool(app, "test_query")).structuredContent as {
      inputSchema?: { oneOf?: unknown[] }
      description?: string
    }
    expect(described.inputSchema?.oneOf).toHaveLength(2)
    // And the description tells the agent the cheaper path exists.
    expect(described.description).toContain("resource")
  })

  it("treats a blank optional describe_tool resource as omitted", async () => {
    const app = appWithScopes(["products:read", "secrets:read"])
    const described = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "describe_tool",
          arguments: { name: "test_query", resource: " " },
        }),
      ),
    )

    expect((described.result as { isError?: boolean })?.isError).not.toBe(true)
    expect(
      (
        described.result as {
          structuredContent?: { inputSchema?: { oneOf?: unknown[] } }
        }
      ).structuredContent?.inputSchema?.oneOf,
    ).toHaveLength(2)
  })

  it("discovers and invokes a sensitive Tool only with its explicit grant", async () => {
    // The sensitive read is projected into its domain's `test_query` tool
    // (voyant#3932). Without the sensitive grant the read is not an authorized
    // resource, so its group carries no read at all and never surfaces — the flat
    // read name is also gone outright.
    const withoutGrant = appWithScopes(["catalog:read"])
    expect(await searchToolNames(withoutGrant)).not.toContain("test_query")
    expect(await searchToolNames(withoutGrant)).not.toContain("get_sensitive_record")
    expect(await describeIsUnavailable(withoutGrant, "get_sensitive_record")).toBe(true)
    expect(await describeIsUnavailable(withoutGrant, "test_query")).toBe(true)

    const app = appWithScopes(["secrets:read"])
    // The group is discoverable by the sensitive resource's keyword...
    expect(await searchToolNames(app, { query: "sensitive" })).toContain("test_query")
    // ...and the flat read name is not resurrected anywhere.
    expect(await searchToolNames(app, { query: "sensitive" })).not.toContain("get_sensitive_record")
    const descriptor = (await describeTool(app, "test_query")).structuredContent as
      | { _meta?: { "voyant.travel/tool"?: { resources?: Array<{ resource: string }> } } }
      | undefined
    const resources = descriptor?._meta?.["voyant.travel/tool"]?.resources ?? []
    expect(resources.map((entry) => entry.resource)).toContain("sensitive_record")

    const called = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "test_query",
          arguments: { resource: "sensitive_record", id: "secret_1" },
        }),
      ),
    )
    expect(called.result).toMatchObject({
      structuredContent: { id: "secret_1", classification: "sensitive" },
    })
  })

  it("describes the eager call_tool meta-tool without reporting it missing", async () => {
    const app = appWithScopes(["catalog:read"])
    const described = await describeTool(app, "call_tool")

    expect(described.result?.isError).not.toBe(true)
    expect(described.structuredContent).toMatchObject({
      name: "call_tool",
      inputSchema: {
        type: "object",
        required: ["name"],
      },
    })
  })

  it("tells callers to invoke eager guide tools directly instead of nesting them", async () => {
    const app = appWithScopes(["catalog:read"])
    const response = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "call_tool",
          arguments: { name: "voyant_guide", arguments: { topic: "overview" } },
        }),
      ),
    )
    const serialized = JSON.stringify(response.result)

    expect(serialized).toContain("Invoke voyant_guide directly")
    expect(serialized).not.toContain("does not exist")
  })

  it("ranks useful partial matches for verbose operator searches", async () => {
    const app = appWithScopes(["records:write"])

    expect(
      await searchToolNames(app, {
        query: "update record lifecycle deactivate",
        domain: "records",
      }),
    ).toContain("update_record")
  })

  it("serves tools/list and tools/call through the selected graph runtime", async () => {
    const routes = await selectedRuntimeRoutes()
    const app = new Hono()
    app.use("*", async (c, next) => {
      c.set("scopes", ["catalog:read"])
      c.set("actor", "staff")
      c.set("audience", "staff")
      await next()
    })
    app.route("/", routes)

    // tools/list is tier 0 — meta-tools plus the resident guide layer; the domain
    // tool is found via search.
    expect((await listedNames(app)).sort()).toEqual([
      "call_tool",
      "describe_tool",
      "search_tools",
      "voyant_glossary",
      "voyant_guide",
    ])
    expect(await searchToolNames(app)).toContain("echo")

    const called = await readRpc(
      await app.request("/", rpc("tools/call", { name: "echo", arguments: { text: "graph" } })),
    )
    expect(called.result).toMatchObject({ structuredContent: { text: "echo: graph" } })
  })

  it("propagates authenticated granted scopes into selected graph Tool contexts", async () => {
    const reviewAccessCatalog = {
      resources: [
        ...accessCatalog.resources,
        {
          id: "legal",
          unitId: "@voyant-travel/legal",
          resource: "legal",
          label: "Legal",
          description: "Legal",
          wildcard: "allow" as const,
          actions: [{ action: "read", label: "Read", description: "Read legal records" }],
        },
        {
          id: "bookings-pii",
          unitId: "@voyant-travel/bookings",
          resource: "bookings-pii",
          label: "Booking PII",
          description: "Booking PII",
          wildcard: "allow" as const,
          actions: [{ action: "read", label: "Read", description: "Read booking PII" }],
        },
      ],
      presets: [],
    }
    const reviewTool = defineTool({
      capabilityId: "@voyant-travel/legal#tool.get-booking-contract-review",
      owner: "@voyant-travel/legal",
      capabilityVersion: "v1",
      name: "get_booking_contract_review",
      description: "Read a booking contract review.",
      inputSchema: z.object({ contractId: z.string() }),
      outputSchema: z.object({ scopes: z.array(z.string()) }),
      requiredScopes: ["legal:read", "bookings-pii:read"],
      audience: { source: "grant", allowed: ["staff"] },
      tier: "read",
      riskPolicy: READ_ONLY_RISK,
      async handler(_input, ctx) {
        return { scopes: [...(ctx.scopes ?? [])] }
      },
    })
    const runtimeTool = {
      id: "@voyant-travel/legal#tool.get-booking-contract-review",
      unitId: "@voyant-travel/legal",
      name: "get_booking_contract_review",
      requiredScopes: ["legal:read", "bookings-pii:read"],
      risk: "low" as const,
      referenceId: "legal-tools",
      async load<T>() {
        return reviewTool as T
      },
    }
    const module = await createMcpVoyantRuntime({
      graph: frameworkRuntime({
        accessCatalog: reviewAccessCatalog,
        tools: [runtimeTool],
        references: [
          {
            id: "legal-tools",
            importEntry: "@voyant-travel/legal/tools",
            async loadModule<T extends Record<string, unknown>>() {
              return {} as T
            },
          },
        ],
      }),
      runtimePorts: {},
    } as never)
    const routes = await module.lazyAdminRoutes?.()
    if (!routes) throw new Error("MCP selected runtime did not expose admin routes")

    function app(scopes: string[]) {
      const outer = new Hono()
      outer.use("*", async (c, next) => {
        c.set("scopes", scopes)
        c.set("actor", "staff")
        c.set("audience", "staff")
        await next()
      })
      outer.route("/", routes)
      return outer
    }

    // The read is projected into `legal_query`; the caller selects the resource.
    const allowed = app(["legal:read", "bookings-pii:read"])
    const called = await readRpc(
      await allowed.request(
        "/",
        rpc("tools/call", {
          name: "legal_query",
          arguments: { resource: "booking_contract_review", contractId: "contract_1" },
        }),
      ),
    )
    expect(called.result).toMatchObject({
      structuredContent: { scopes: ["legal:read", "bookings-pii:read"] },
    })

    // A grant missing one required scope leaves the read out of its group, so the
    // group carries no authorized read and the query tool never appears — and the
    // removed flat read name is uncallable either way.
    const denied = app(["legal:read"])
    const listed = await readRpc(await denied.request("/", rpc("tools/list", {})))
    const listedNames =
      (listed.result as { tools?: Array<{ name: string }> } | undefined)?.tools?.map(
        ({ name }) => name,
      ) ?? []
    expect(listedNames).not.toContain("legal_query")
    expect(listedNames).not.toContain("get_booking_contract_review")
    const deniedCall = await readRpc(
      await denied.request(
        "/",
        rpc("tools/call", {
          name: "legal_query",
          arguments: { resource: "booking_contract_review", contractId: "contract_1" },
        }),
      ),
    )
    expect(
      deniedCall.error ?? (deniedCall.result as { isError?: boolean } | undefined)?.isError,
    ).toBeTruthy()
  })

  it.each([
    ["missing actor and audience", {}],
    ["missing audience", { actor: "staff" }],
    ["missing actor", { audience: "staff" }],
    ["invalid actor", { actor: "unknown", audience: "staff" }],
    ["invalid audience", { actor: "staff", audience: "unknown" }],
  ])("fails closed for %s claims in the selected graph runtime", async (_case, claims) => {
    const routes = await selectedRuntimeRoutes()
    const app = new Hono()
    app.use("*", async (c, next) => {
      c.set("scopes", ["catalog:read"])
      for (const [claim, value] of Object.entries(claims)) c.set(claim as never, value as never)
      await next()
    })
    app.route("/", routes)

    expect((await app.request("/manifest")).status).toBe(500)
  })

  it("lets an internal API key reach selected MCP routes with actor-derived audience", async () => {
    const routes = await selectedRuntimeRoutes()
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never),
    )
    app.route("/", routes)

    const response = await app.fetch(
      new Request("http://example.test/manifest", {
        headers: { Authorization: "Bearer internal-test-key" },
      }),
      {
        DATABASE_URL: "postgres://test",
        INTERNAL_API_KEY: "internal-test-key",
        INTERNAL_API_KEY_SCOPES: "catalog:read",
      },
      testExecutionContext(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      tools: [expect.objectContaining({ name: "echo" })],
    })
  })

  it("exposes selected action invocation metadata and gates before domain dispatch", async () => {
    const registry = createToolRegistry()
    let handlerCalls = 0
    registry.register(
      defineTool({
        name: "guarded_send",
        description: "Guarded write",
        inputSchema: z.object({ message: z.string() }),
        outputSchema: z.object({ ok: z.boolean() }),
        requiredScopes: ["notifications:send"],
        tier: "destructive",
        riskPolicy: {
          destructive: true,
          reversible: false,
          dryRunSupported: false,
          confirmationRequired: true,
          sideEffects: ["email"],
        },
        resolveActionTarget({ message }) {
          return `notification:${message}`
        },
        async handler() {
          handlerCalls += 1
          return { ok: true }
        },
      }),
      {
        capabilityId: "@voyant-travel/notifications#tool.guarded-send",
        owner: "@voyant-travel/notifications",
        capabilityVersion: "v1",
        deploymentRisk: "critical",
        actionPolicy: {
          id: "@voyant-travel/notifications#action.guarded-send",
          capabilityId: "@voyant-travel/notifications#action.guarded-send",
          version: "v1",
          kind: "execute",
          targetType: "notification",
          risk: "critical",
          ledger: "required",
          approval: "never",
        },
      },
    )
    const gateCalls: unknown[] = []
    const mcp = createMcpApiRoutes({
      accessCatalog,
      registry,
      requireActionPolicies: true,
      buildContext: () => ({
        ...buildContext(),
        toolActionPolicy: {
          async execute(input, dispatch) {
            gateCalls.push(input)
            return dispatch()
          },
        },
      }),
    })
    const outer = new Hono()
    outer.use("*", async (c, next) => {
      c.set("scopes", ["notifications:send"])
      await next()
    })
    outer.route("/", mcp)

    const listedTool = (await describeTool(outer, "guarded_send")).structuredContent as
      | {
          name: string
          inputSchema: Record<string, unknown>
          _meta: Record<string, unknown>
        }
      | undefined
    expect(listedTool).toMatchObject({
      inputSchema: { properties: { _voyant: { type: "object" } } },
      _meta: {
        "voyant.travel/tool": {
          actionPolicy: {
            id: "@voyant-travel/notifications#action.guarded-send",
            enforcement: "generic",
            invocation: {
              controlField: "_voyant",
              requiredFields: ["confirmed"],
              optionalFields: ["reasonCode"],
              targetResolution: "package-resolver",
            },
          },
        },
      },
    })

    const called = await readRpc(
      await outer.request(
        "/",
        rpc("tools/call", {
          name: "guarded_send",
          arguments: {
            message: "hello",
            _voyant: {
              confirmed: true,
            },
          },
        }),
      ),
    )
    expect((called.result as { structuredContent: unknown }).structuredContent).toEqual({
      ok: true,
    })
    expect(handlerCalls).toBe(1)
    expect(gateCalls).toEqual([
      expect.objectContaining({
        commandInput: { message: "hello" },
        resolvedTargetId: "notification:hello",
        invocation: {
          confirmed: true,
        },
      }),
    ])

    const hostile = await readRpc(
      await outer.request(
        "/",
        rpc("tools/call", {
          name: "guarded_send",
          arguments: {
            message: "hello",
            _voyant: {
              confirmed: true,
              requestId: "6c0f3fb4-2c96-4c3a-a520-28166167fb18",
              approvalId: "approval_1",
              targetId: "attacker-controlled",
              idempotencyFingerprint: "attacker-controlled",
            },
          },
        }),
      ),
    )
    expect(hostile.error ?? (hostile.result as { isError?: boolean })?.isError).toBeTruthy()
    expect(JSON.stringify(hostile)).toContain("targetId")
    expect(handlerCalls).toBe(1)
  })

  it("returns structured stable metadata when a declared command target is invalid", async () => {
    const registry = createToolRegistry()
    registry.register(
      defineTool({
        name: "unsafe_write",
        description: "A ledgered write with a declared command target",
        inputSchema: z.object({ recordId: z.string() }),
        outputSchema: z.object({ ok: z.boolean() }),
        requiredScopes: ["catalog:write"],
        tier: "write",
        riskPolicy: {
          destructive: false,
          reversible: true,
          dryRunSupported: false,
          confirmationRequired: true,
          sideEffects: ["data-write"],
        },
        async handler() {
          return { ok: true }
        },
      }),
      {
        capabilityId: "@voyant-travel/catalog#tool.unsafe-write",
        owner: "@voyant-travel/catalog",
        capabilityVersion: "v1",
        deploymentRisk: "medium",
        actionPolicy: {
          id: "@voyant-travel/catalog#action.unsafe-write",
          capabilityId: "@voyant-travel/catalog#action.unsafe-write",
          version: "v1",
          kind: "execute",
          targetType: "record",
          commandTargetField: "recordId",
          risk: "medium",
          ledger: "required",
          approval: "never",
        },
      },
    )
    const mcp = createMcpApiRoutes({
      accessCatalog,
      registry,
      buildContext: () => ({
        ...buildContext(),
        toolActionPolicy: { execute: async (_input, dispatch) => dispatch() },
      }),
    })
    const outer = new Hono()
    outer.use("*", async (c, next) => {
      c.set("scopes", ["catalog:write"])
      await next()
    })
    outer.route("/", mcp)

    const called = await readRpc(
      await outer.request(
        "/",
        rpc("tools/call", {
          name: "unsafe_write",
          arguments: {
            recordId: " ",
            _voyant: {
              confirmed: true,
            },
          },
        }),
      ),
    )

    expect(called.result).toMatchObject({
      isError: true,
      _meta: {
        "voyant.travel/error": {
          contractVersion: "2026-07-25",
          code: "ACTION_POLICY_REQUIRED",
          meta: {
            capabilityId: "@voyant-travel/catalog#tool.unsafe-write",
            targetResolution: "command-target-field",
            commandTargetField: "recordId",
          },
        },
      },
    })
  })

  it("keeps the existing invocation contract for an unmigrated generic execute", async () => {
    const registry = createToolRegistry()
    const gateCalls: unknown[] = []
    registry.register(
      defineTool({
        name: "legacy_write",
        description: "An execute awaiting package target migration",
        inputSchema: z.object({ recordId: z.string() }),
        outputSchema: z.object({ ok: z.boolean() }),
        requiredScopes: ["catalog:write"],
        tier: "write",
        riskPolicy: {
          destructive: false,
          reversible: true,
          dryRunSupported: false,
          confirmationRequired: true,
          sideEffects: ["data-write"],
        },
        async handler() {
          return { ok: true }
        },
      }),
      {
        capabilityId: "@voyant-travel/catalog#tool.legacy-write",
        owner: "@voyant-travel/catalog",
        capabilityVersion: "v1",
        deploymentRisk: "medium",
        actionPolicy: {
          id: "@voyant-travel/catalog#action.legacy-write",
          capabilityId: "@voyant-travel/catalog#action.legacy-write",
          version: "v1",
          kind: "execute",
          targetType: "record",
          risk: "medium",
          ledger: "required",
          approval: "never",
        },
      },
    )
    const mcp = createMcpApiRoutes({
      accessCatalog,
      registry,
      buildContext: () => ({
        ...buildContext(),
        toolActionPolicy: {
          async execute(input, dispatch) {
            gateCalls.push(input)
            return dispatch()
          },
        },
      }),
    })
    const outer = new Hono()
    outer.use("*", async (c, next) => {
      c.set("scopes", ["catalog:write"])
      await next()
    })
    outer.route("/", mcp)

    const called = await readRpc(
      await outer.request(
        "/",
        rpc("tools/call", {
          name: "legacy_write",
          arguments: {
            recordId: "record_1",
            _voyant: {
              confirmed: true,
              targetId: "record_1",
              idempotencyKey: "legacy-key",
            },
          },
        }),
      ),
    )

    expect((called.result as { structuredContent: unknown }).structuredContent).toEqual({
      ok: true,
    })
    expect(gateCalls).toEqual([
      expect.objectContaining({
        commandInput: { recordId: "record_1" },
        invocation: {
          confirmed: true,
          targetId: "record_1",
          idempotencyKey: "legacy-key",
        },
      }),
    ])
  })

  it("fails closed when a graph-bound generic Tool has no action-policy gate", async () => {
    const registry = createToolRegistry()
    let dispatched = false
    registry.register(
      defineTool({
        name: "guarded_read",
        description: "Guarded read",
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        requiredScopes: ["catalog:read"],
        tier: "read",
        riskPolicy: READ_ONLY_RISK,
        async handler() {
          dispatched = true
          return { ok: true }
        },
      }),
      {
        capabilityId: "@voyant-travel/catalog#tool.guarded-read",
        owner: "@voyant-travel/catalog",
        capabilityVersion: "v1",
        actionPolicy: {
          id: "@voyant-travel/catalog#action.guarded-read",
          capabilityId: "@voyant-travel/catalog#action.guarded-read",
          version: "v1",
          kind: "read",
          targetType: "catalog",
          risk: "low",
          ledger: "optional",
          approval: "never",
        },
      },
    )
    const mcp = createMcpApiRoutes({
      accessCatalog,
      registry,
      requireActionPolicies: true,
      buildContext,
    })
    const outer = new Hono()
    outer.use("*", async (c, next) => {
      c.set("scopes", ["catalog:read"])
      await next()
    })
    outer.route("/", mcp)
    const called = await readRpc(
      await outer.request("/", rpc("tools/call", { name: "guarded_read", arguments: {} })),
    )
    expect((called.result as { isError?: boolean }).isError).toBe(true)
    expect(JSON.stringify(called)).toContain("ACTION_POLICY_REQUIRED")
    expect(dispatched).toBe(false)
  })
})

/**
 * Progressive disclosure moves the domain surface behind meta-tools (voyant#3927).
 * The security property that used to hold because unauthorized tools were never
 * registered must now hold at the indirection layer: an unauthorized tool must be
 * neither discoverable (search_tools / describe_tool) NOR callable (call_tool or a
 * flat-name tools/call). These tests pin that down.
 */
describe("progressive disclosure authorization", () => {
  it("keeps an unauthorized tool out of search_tools and describe_tool", async () => {
    // catalog:read authorizes `echo` only; update_record + get_sensitive_record are not.
    const app = appWithScopes(["catalog:read"])

    const found = await searchToolNames(app)
    expect(found).toContain("echo")
    expect(found).not.toContain("update_record")
    expect(found).not.toContain("get_sensitive_record")

    // A domain filter cannot surface a tool the caller is not authorized for.
    expect(await searchToolNames(app, { domain: "test" })).not.toContain("update_record")

    expect(await describeIsUnavailable(app, "update_record")).toBe(true)
    expect(await describeIsUnavailable(app, "get_sensitive_record")).toBe(true)
    // Authorized tools are describable.
    expect((await describeTool(app, "echo")).structuredContent).toMatchObject({ name: "echo" })
  })

  it("refuses call_tool for an unauthorized tool and never dispatches it", async () => {
    const app = appWithScopes(["catalog:read"])

    const called = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "call_tool",
          arguments: { name: "update_record", arguments: { id: "r1", name: "Mallory" } },
        }),
      ),
    )
    const result = called.result as { isError?: boolean; structuredContent?: unknown }
    expect(result.isError).toBe(true)
    // The write never ran: no update_record payload came back.
    expect(result.structuredContent).toBeUndefined()
    expect(JSON.stringify(called)).toContain("NOT_FOUND")
    expect(JSON.stringify(called)).not.toContain("Mallory")
  })

  it("dispatches an authorized tool through call_tool", async () => {
    const app = appWithScopes(["catalog:read"])

    const called = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "call_tool",
          arguments: { name: "echo", arguments: { text: "via meta" } },
        }),
      ),
    )
    expect((called.result as { structuredContent?: { text?: string } }).structuredContent).toEqual({
      text: "echo: via meta",
    })
  })

  it("dispatches an authorized lazy write through call_tool and its flat name", async () => {
    const app = appWithScopes(["records:write"])

    const viaMeta = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "call_tool",
          arguments: { name: "update_record", arguments: { id: "r1", name: "Updated" } },
        }),
      ),
    )
    expect((viaMeta.result as { structuredContent?: unknown }).structuredContent).toMatchObject({
      result: { id: "r1", name: "Updated" },
    })

    // The flat name still works unchanged — this is the manual-booking client path.
    const viaFlat = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", { name: "update_record", arguments: { id: "r2", name: "Flat" } }),
      ),
    )
    expect((viaFlat.result as { structuredContent?: unknown }).structuredContent).toMatchObject({
      result: { id: "r2", name: "Flat" },
    })
  })

  it("refuses a flat-name tools/call for an unauthorized tool", async () => {
    const app = appWithScopes(["catalog:read"])
    const called = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", { name: "update_record", arguments: { id: "r1", name: "Mallory" } }),
      ),
    )
    // Unauthorized name is never registered → the SDK cannot dispatch it.
    expect(called.error ?? (called.result as { isError?: boolean })?.isError).toBeTruthy()
    expect(JSON.stringify(called)).not.toContain('"id":"r1","name":"Mallory"')
  })
})
