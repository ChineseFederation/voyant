/**
 * The guide layer (voyant#3931): server `instructions` and read-only guide Tools
 * give a connecting agent the product judgment the raw schemas cannot. These
 * tests assert the instructions are present and non-trivial, the guide Tools are
 * reachable and return doc-sourced content, and the guidance is scope-aware.
 */
import {
  createToolRegistry,
  defineTool,
  READ_ONLY_RISK,
  type ToolContext,
} from "@voyant-travel/tools"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createMcpApiRoutes } from "../src/index.js"

const accessCatalog = {
  resources: [
    {
      id: "catalog",
      unitId: "@voyant-travel/catalog",
      resource: "catalog",
      label: "Catalog",
      description: "Catalog",
      wildcard: "allow" as const,
      actions: [
        { action: "read", label: "Read", description: "Read" },
        { action: "write", label: "Write", description: "Write" },
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

async function readRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"))
    return JSON.parse(line?.slice("data:".length).trim() ?? "{}")
  }
  return JSON.parse(text)
}

function buildContext(): ToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "t1",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
  }
}

const readProductTool = defineTool({
  name: "get_product",
  description: "Read a product.",
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ id: z.string() }),
  requiredScopes: ["catalog:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id }) {
    return { id }
  },
})

const publishProductTool = defineTool({
  name: "publish_product",
  description: "Publish a product to the public catalog.",
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ id: z.string() }),
  requiredScopes: ["catalog:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    sideEffects: ["data-write"],
  },
  async handler({ id }) {
    return { id }
  },
})

function app(scopes: string[]): Hono {
  const registry = createToolRegistry()
  registry.register(readProductTool)
  registry.register(publishProductTool)
  const mcp = createMcpApiRoutes({ accessCatalog, registry, buildContext })
  const outer = new Hono()
  outer.use("*", async (c, next) => {
    c.set("scopes", scopes)
    await next()
  })
  outer.route("/", mcp)
  return outer
}

const INITIALIZE_PARAMS = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test-client", version: "0.0.0" },
}

async function guideText(a: Hono, topic?: string): Promise<string> {
  const called = await readRpc(
    await a.request(
      "/",
      rpc("tools/call", {
        name: "voyant_guide",
        arguments: topic ? { topic } : {},
      }),
    ),
  )
  const content = (called.result as { content?: Array<{ text: string }> } | undefined)?.content
  return content?.map((part) => part.text).join("\n") ?? ""
}

describe("MCP guide layer", () => {
  it("advertises non-trivial server instructions that name the product and discovery", async () => {
    const initialized = await readRpc(
      await app(["catalog:read"]).request("/", rpc("initialize", INITIALIZE_PARAMS)),
    )
    const instructions = (initialized.result as { instructions?: string } | undefined)?.instructions

    expect(typeof instructions).toBe("string")
    expect((instructions ?? "").length).toBeGreaterThan(200)
    expect(instructions).toMatch(/travel/i)
    expect(instructions).toMatch(/tools\/list/)
    expect(instructions).toContain("voyant_guide")
  })

  it("scopes the instructions to what the caller's key can do", async () => {
    const readInit = await readRpc(
      await app(["catalog:read"]).request("/", rpc("initialize", INITIALIZE_PARAMS)),
    )
    const readInstructions = (readInit.result as { instructions?: string }).instructions ?? ""
    expect(readInstructions).toMatch(/READ-ONLY/i)

    const writeInit = await readRpc(
      await app(["catalog:read", "catalog:write"]).request(
        "/",
        rpc("initialize", INITIALIZE_PARAMS),
      ),
    )
    const writeInstructions = (writeInit.result as { instructions?: string }).instructions ?? ""
    expect(writeInstructions).not.toMatch(/READ-ONLY/i)
  })

  it("tells a key that authorizes nothing that it is a permissions problem", async () => {
    // A key with no granted scopes reaches NO Tool — not even a read. Before this
    // it was told "READ-ONLY: it can list and read", which is worse than silence:
    // every `search_tools` query comes back empty and the agent, trusting the
    // orientation, blames its own queries instead of reporting a grant problem.
    const none = await readRpc(await app([]).request("/", rpc("initialize", INITIALIZE_PARAMS)))
    const instructions = (none.result as { instructions?: string }).instructions ?? ""

    expect(instructions).toMatch(/authorizes NO Tools/i)
    expect(instructions).toMatch(/permissions problem/i)
    // It must NOT claim reads work.
    expect(instructions).not.toMatch(/can list and read/i)
  })

  it("puts the guide Tools in the resident tier, not the lazy long tail", async () => {
    const listed = await readRpc(await app(["catalog:read"]).request("/", rpc("tools/list", {})))
    const names =
      (listed.result as { tools?: Array<{ name: string }> } | undefined)?.tools?.map(
        ({ name }) => name,
      ) ?? []

    // Progressive disclosure (#3927) leaves no eager DOMAIN surface, so the guide
    // is the only thing telling a connecting agent what this deployment is for.
    // It must therefore be resident — a guide reachable only by first guessing a
    // search query would be useless at exactly the moment it is needed.
    expect(names).toContain("voyant_guide")
    expect(names).toContain("voyant_glossary")
    expect(names).not.toContain("get_product")
  })

  it("makes the guide Tools reachable and returns doc-sourced content", async () => {
    const a = app(["catalog:read", "catalog:write"])

    const overview = await guideText(a)
    expect(overview).toMatch(/travel/i)

    const journey = await guideText(a, "booking-journey")
    expect(journey).toMatch(/dynamic/i)
    expect(journey).toMatch(/scheduled/i)
    // Commit is a separate admitted operation, not a side effect of proposal/hold.
    expect(journey).toMatch(/separate/i)

    const proposals = await guideText(a, "proposals")
    expect(proposals).toMatch(/accept/i)
    expect(proposals).toMatch(/not.*confirm|confirm.*not|different state/i)

    const products = await guideText(a, "products")
    expect(products).toMatch(/publish/i)
    expect(products).toMatch(/draft/i)

    const vocab = await guideText(a, "vocabulary")
    expect(vocab).toMatch(/number of rooms|rooms, not/i)

    const confirmation = await guideText(a, "confirmation")
    expect(confirmation).toContain("_voyant")
    expect(confirmation).toMatch(/confirmed/)
    expect(confirmation).toMatch(/approvalId/)
    expect(confirmation).toMatch(/call the domain Tool first/i)
    expect(confirmation).toMatch(/do NOT call request_action_approval first/i)
  })

  it("filters the glossary by term", async () => {
    const called = await readRpc(
      await app(["catalog:read"]).request(
        "/",
        rpc("tools/call", { name: "voyant_glossary", arguments: { term: "Proposal Version" } }),
      ),
    )
    const text =
      (called.result as { content?: Array<{ text: string }> } | undefined)?.content
        ?.map((p) => p.text)
        .join("\n") ?? ""
    expect(text).toMatch(/Proposal Version/)
    expect(text).toMatch(/immutable/i)
  })

  it("tells a read-only caller the write journeys are out of reach", async () => {
    const journey = await guideText(app(["catalog:read"]), "booking-journey")
    expect(journey).toMatch(/READ-ONLY/i)
  })
})
