import { describe, expect, it } from "vitest"
import {
  buildMcpClientConfigs,
  filterMcpTools,
  isMcpToolExposed,
  MCP_TOKEN_PLACEHOLDER,
  type McpManifestTool,
  resolveMcpEndpoint,
} from "./mcp-ui.js"

describe("mcp endpoint resolution", () => {
  it("joins a relative api prefix onto the browser origin", () => {
    expect(resolveMcpEndpoint("/api", "https://ops.example.com")).toBe(
      "https://ops.example.com/api/v1/admin/mcp",
    )
  })

  it("keeps an absolute api base and ignores the origin", () => {
    expect(resolveMcpEndpoint("https://api.example.com/", "https://ops.example.com")).toBe(
      "https://api.example.com/v1/admin/mcp",
    )
  })

  it("degrades to a path when no origin is available (server render)", () => {
    expect(resolveMcpEndpoint("/api")).toBe("/api/v1/admin/mcp")
  })
})

describe("mcp client configuration snippets", () => {
  const endpoint = "https://ops.example.com/api/v1/admin/mcp"
  const configs = buildMcpClientConfigs(endpoint)

  it("sends the token as a Bearer Authorization header in every client", () => {
    expect(configs).not.toHaveLength(0)
    for (const config of configs) {
      expect(config.snippet).toContain(endpoint)
      expect(config.snippet).toContain(`Bearer ${MCP_TOKEN_PLACEHOLDER}`)
    }
  })

  it("emits valid JSON for the file-based clients", () => {
    for (const config of configs.filter((entry) => entry.language === "json")) {
      expect(() => JSON.parse(config.snippet)).not.toThrow()
      expect(config.file).toBeTruthy()
    }
  })

  it("uses the VS Code `servers` key and the mcpServers key elsewhere", () => {
    const vscode = configs.find((config) => config.id === "vscode")
    const cursor = configs.find((config) => config.id === "cursor")

    expect(JSON.parse(vscode?.snippet ?? "{}")).toHaveProperty("servers.voyant.url", endpoint)
    expect(JSON.parse(cursor?.snippet ?? "{}")).toHaveProperty("mcpServers.voyant.url", endpoint)
  })

  it("advertises the streamable-http Accept header on the raw probe", () => {
    const curl = configs.find((config) => config.id === "curl")

    expect(curl?.snippet).toContain("application/json, text/event-stream")
    expect(curl?.snippet).toContain("tools/list")
  })
})

describe("mcp tool filtering", () => {
  const tools: McpManifestTool[] = [
    {
      capabilityId: "@voyant-travel/bookings#tool.list",
      owner: "@voyant-travel/bookings",
      name: "list_bookings",
      description: "List bookings",
      requiredScopes: ["bookings:read"],
      deploymentRisk: "low",
      annotations: { readOnlyHint: true },
      exposure: { enabled: true, sensitive: false, remoteSafe: true, reason: "enabled" },
    },
    {
      capabilityId: "@voyant-travel/operator-settings#tool.update",
      owner: "@voyant-travel/operator-settings",
      name: "update_operator_settings",
      description: "Update settings",
      requiredScopes: ["settings:write"],
      deploymentRisk: "high",
      annotations: { readOnlyHint: false },
      exposure: {
        enabled: false,
        sensitive: false,
        remoteSafe: false,
        reason: "writes-disabled",
      },
    },
  ]

  it("returns every tool for an empty query", () => {
    expect(filterMcpTools(tools, "  ")).toHaveLength(2)
  })

  it("matches name, owner, and required scopes case-insensitively", () => {
    expect(filterMcpTools(tools, "LIST_book").map((tool) => tool.name)).toEqual(["list_bookings"])
    expect(filterMcpTools(tools, "settings:write").map((tool) => tool.name)).toEqual([
      "update_operator_settings",
    ])
    expect(filterMcpTools(tools, "nothing")).toEqual([])
  })

  it("previews risk, write and per-tool policy decisions", () => {
    const base = {
      allowedRiskLevels: ["low" as const],
      allowWrites: false,
      allowSensitiveData: false,
      toolOverrides: {},
    }
    expect(isMcpToolExposed(tools[0]!, base)).toBe(true)
    expect(isMcpToolExposed(tools[1]!, base)).toBe(false)
    expect(
      isMcpToolExposed(tools[1]!, {
        ...base,
        allowWrites: true,
        toolOverrides: { "@voyant-travel/operator-settings#tool.update": "allow" },
      }),
    ).toBe(true)
  })
})
