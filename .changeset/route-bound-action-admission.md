---
"@voyant-travel/tools": minor
"@voyant-travel/action-ledger": patch
---

Admit handler-owned actions bound to a route as well as to a Tool.

An action policy can now declare `transport: "tool" | "route" | "both"`,
defaulting to `tool` so every existing action keeps its current MCP-only reach.
A route obtains an admission by asking the registry for one
(`registerRouteAction` / `admitRouteAction`); the minting function stays
package-private, so a route still cannot fabricate a
`ToolHandlerActionPolicyContext`. Admissions record the boundary that minted
them, and `admitHandlerActionPolicy` refuses one minted anywhere other than the
boundary the calling handler serves — a route-bound action is unreachable
through Tool dispatch, and a Tool-bound action is unreachable through a route.

The action ledger derives its `authorizationSource` from that boundary rather
than assuming MCP, so a route-admitted command records
`selected_graph_route_handler`.

The Tool registry's manifest-construction half moved to `registered-tool.ts`;
`createToolRegistry` and its dispatch behaviour are unchanged.
