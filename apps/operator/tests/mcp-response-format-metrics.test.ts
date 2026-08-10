import { describe, expect, it } from "vitest"

import { measureResponseFormats } from "./support/mcp-response-format-metrics.js"

describe("MCP response format metrics", () => {
  it("measures explicit formats and an immediate detailed refetch", () => {
    const result = measureResponseFormats([
      { name: "search_tools", args: { query: "bookings" }, responseBytes: 120 },
      {
        name: "call_tool",
        args: { name: "bookings_query", arguments: { resource: "bookings", limit: 10 } },
        responseBytes: 400,
      },
      {
        name: "call_tool",
        args: {
          name: "bookings_query",
          arguments: { resource: "bookings", limit: 10, response_format: "detailed" },
        },
        responseBytes: 900,
      },
      { name: "describe_tool", args: { name: "bookings_query" }, responseBytes: 800 },
    ])

    expect(result).toEqual({
      queryCalls: 2,
      explicitConcise: 0,
      explicitDetailed: 1,
      defaultConcise: 1,
      immediateDetailedRefetches: 1,
      searchToolsMaxBytes: 120,
      describeToolMaxBytes: 800,
    })
  })

  it("does not call a non-adjacent detailed query a refetch", () => {
    const result = measureResponseFormats([
      { name: "inventory_query", args: { resource: "products" }, responseBytes: 100 },
      { name: "search_tools", args: { query: "products" }, responseBytes: 100 },
      {
        name: "inventory_query",
        args: { resource: "products", response_format: "detailed" },
        responseBytes: 200,
      },
    ])
    expect(result.immediateDetailedRefetches).toBe(0)
  })
})
