# @voyant-travel/mcp

The in-deployment MCP server for the Voyant framework (voyant#2792). It exposes
the framework tool registry as a real [Model Context Protocol](https://modelcontextprotocol.io)
server, mounted as a Hono route group inside the operator deployment at
`/v1/admin/mcp` — **not** a separate app/worker, and **no Durable Object**.

External MCP clients (Claude, ChatGPT, …) connect to that endpoint over the wire.

## API

`createMcpApiRoutes({ registry, buildContext, serverInfo? })` → a Hono sub-app. Mount it
at `/v1/admin/mcp` (the `"operator/mcp"` composition entry):

- `POST /` — MCP JSON-RPC (`initialize` / `tools/list` / `tools/call`).
- `GET /manifest` — the contract-versioned tool discovery manifest for remote agents.

`buildContext(c)` maps the request's `c.var` (db lease / actor / audience / scope) into
a `@voyant-travel/tools` `ToolContext`.

Graph-driven hosts use
`createGraphMcpApiRoutes({ runtime, buildContext, buildResources? })`. It registers only
tools admitted by the resolved graph and discovers the conventional
`voyantToolContextContribution` export from those same runtime entries. Package
contributions own service injection for their declared `tools[].context` keys;
`buildResources` supplies only deployment-specific infrastructure adapters.

## Authentication (external MCP clients)

External MCP clients (Claude Desktop, ChatGPT, …) authenticate with a **Bearer
scoped API key** — the operator's existing `voy_` key pipeline — sent as
`Authorization: Bearer <key>`. No separate OAuth/runner is introduced (voyant#2801): the
request auth middleware resolves the key into `scopes` + `audience` on `c.var`, and
this server gates every tool by its `requiredScopes`.

Because authorization is per-tool, the `/v1/admin/mcp` surface is exempt from the
coarse method+path permission guard (`require-actor`, like `_meta`): any
authenticated key reaches the endpoint, and a key with no relevant scopes simply
sees an empty `tools/list`. Mint keys with a grant preset (e.g. `agent-customer`)
to bundle a scope subset with an `audience`.

The reserved `apps/agent-runner` / `apps/agent-control-plane` stubs are intentionally
**not** built out — Voyant ships the tool primitives + this ready-to-use MCP, not an
agent.

## How it works

- **Transport:** `@hono/mcp`'s `StreamableHTTPTransport` (web-standard `Request`/
  `Response`) connected to `@modelcontextprotocol/sdk`'s `McpServer`. The SDK's own
  Node-`http` transport is **not** used.
- **Stateless, per request:** a fresh `McpServer` + transport per request with
  `{ sessionIdGenerator: undefined, enableJsonResponse: true }`, then
  `server.connect(transport)` → `transport.handleRequest(c)`. No session store, no
  Durable Object — fits the operator's single-worker `nodejs_compat` runtime and
  survives the lazy-route `c.var` re-hydration. Clients must send
  `Accept: application/json, text/event-stream`.
- **Authorization (D2):** each tool's `requiredScopes` are checked against the caller's
  granted scopes with **AND** semantics (`hasApiKeyPermission`). Unauthorized tools are
  neither listed nor registered on the per-request server, so they cannot be called.
- **Selected action gate:** every graph Tool resolves to exactly one selected graph action.
  Graph composition and generic dispatch fail closed unless the action-ledger contribution is
  selected. The gate checks
  actor, explicit confirmation, the package-resolved target, server-computed exact command
  fingerprint, and any approved principal-bound request before the domain handler runs.
  For migrated actions, generic clients provide an opaque UUID `_voyant.requestId`; they never
  provide target ids or fingerprints. The registry resolves complex targets through an explicit Tool resolver,
  existing targets through the graph action's `commandTargetField`, and read collections through
  an authenticated organization/operator anchor. Migrated actions advertise that resolution and
  reject client-authored targets, fingerprints, and idempotency keys. During the package rollout,
  an execute without either package contract retains its previous discoverable invocation
  contract; Max does not cut over until that temporary branch is removed. Approval-required
  migrated calls create or replay the pending request without
  dispatch and return the server-issued approval and requested-action ids in structured
  `_meta["voyant.travel/error"]`. After approval, the client retries the exact input with that
  `approvalId`. Required-ledger writes record a preflight before dispatch and a terminal
  success/failure entry afterward.
  Created-target actions are never sent through this generic wrapper: graph discovery identifies
  their stable pre-create command target and canonical result-reference contract, registration
  requires handler-owned durable claim/replay, and `_voyant.targetId` is not exposed as a required
  invocation field. This prevents a caller-supplied placeholder from becoming the audit identity.
- **Audience (D3):** the authenticated grant remains the source of audience. A Tool may
  narrow its allowed grant audiences; disallowed Tools are neither listed nor callable.
- **Headless boundary:** the registry returns typed pure data; this adapter wraps it in
  the MCP `CallToolResult` envelope only at the transport edge.
- **Complete standard discovery:** `tools/list` includes structured output schemas,
  standard MCP annotations, and `_meta["voyant.travel/tool"]` with stable capability
  identity/version, owner, aliases/deprecation, scopes, audience, and exact risk policy.
  Compatibility aliases remain callable and identify their canonical name in metadata.
  Selected action metadata also advertises the reserved `_voyant` invocation control field and
  its required confirmation/request/approval fields and package target-resolution contract.
  Package-owned two-phase handlers
  advertise `enforcement: "handler"`; MCP still requires their explicit confirmation control but
  does not wrap their domain approval or ledger workflow a second time.
- **Graph-owned context:** selected tool runtime entries contribute only context keys
  declared in package manifests. Missing or undeclared contributions fail closed.
