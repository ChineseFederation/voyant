# ADR-0011: Transport-neutral agent tool library + in-deployment MCP server

- **Status:** Accepted (2026-07-02)
- **Relates to:** [#2792](https://github.com/voyant-travel/voyant/issues/2792),
  [ADR-0007](./0007-module-subsetting-and-capability-ports.md) (module subsetting +
  capability ports),
  [ADR-0009](./0009-federated-operating-mode.md) (Voyant as agent control surface),
  [agent tool library](../architecture/agent-tool-library.md),
  [AI travel experience composition](../architecture/ai-travel-experience-composition.md),
  [catalog semantic search + agent access](../architecture/catalog-rag-architecture.md)
- **Implemented by:** #2792 and its sub-PRs.

## Context

The only agent-facing tool seam lived inside `packages/trips` (`mcp-*.ts`): bespoke,
trips-only, returning MCP transport envelopes from the core, dispatched over an ad-hoc
`POST /tools/:tool` (not real MCP), with no `requiredScopes` or risk metadata. We want
framework capabilities — catalog, products, availability, pricing, bookings, finance,
notifications, proposals, trips — usable by any agent through one authored-once contract,
without leaking transport concerns into the domain packages.

Two consumption topologies must both work: an **in-process** MCP mounted in the
operator app (dispatching to services with the request's DB lease), and a **remote**
agent client over a versioned protocol.

## Decision

**Capabilities are authored once, headless, and scope-gated; exposure (MCP, remote
agents, HTTP) is a thin adapter over them.**

1. **`@voyant-travel/tools`** — a transport-neutral, dependency-minimal (zod-only)
   contract. `defineTool` declares `name`, `description`, zod `inputSchema` +
   `outputSchema`, `requiredScopes`, a risk `tier`, and a declarative `riskPolicy`, plus
   a `handler(args, ctx)` returning **typed pure data** — no transport envelopes, no
   presentation. `createToolRegistry` validates input and output on dispatch and emits a
   discovery manifest with real JSON Schema (`z.toJSONSchema`). A selected graph binds
   the stable package capability id and owner to the runtime definition; standalone
   tools may declare the same identity directly. Invocation names and aliases are
   compatibility labels, not capability identity. Authorization is **not** done here.

2. **Each module owns its tools and context contribution.** A domain package exports its
   tools via a `./tools` subpath (mirroring how it exports route bundles). When selected
   tools declare context keys, the same admitted runtime entry exports
   `voyantToolContextContribution`; the generic MCP host discovers and merges that
   package-owned contribution. The Operator supplies deployment resources only and does
   not maintain a product tool/service catalog. Genuinely **cross-module / composed tools
   live in the composing package** (e.g. `trips`), never pushed into leaf packages.

3. **`@voyant-travel/mcp`** — the MCP server is a **Hono route group inside the operator
   deployment**, mounted at `/v1/admin/mcp` via the `operator/mcp` composition entry. It
   uses `@modelcontextprotocol/sdk`'s `McpServer` over `@hono/mcp`'s web-standard
   Streamable-HTTP transport, **stateless** (fresh server + transport per request, no
   session store, no Durable Object). No separate app/worker is deployed.

4. **Authorization binds at the tool layer (D2):** each tool's `requiredScopes`
   (`resource:action`, from `@voyant-travel/types`) are checked with **AND** semantics
   via `hasApiKeyPermission`. Unauthorized tools are neither listed nor registered on the
   per-request server. The coarse `require-actor` method+path guard exempts the `mcp`
   surface (like `_meta`), so any authenticated caller reaches it and sees a
   scope-filtered tool list.

5. **Audience is a grant attribute (D3),** carried on the API-key grant metadata and
   resolved into the catalog `ResolverScope` at request time — not inferred from scopes.

6. **We ship primitives + a ready-to-use MCP, not an agent.** External clients
   authenticate with a Bearer scoped `voy_` key. There is no Voyant-hosted agent or
   runner; the reserved `apps/agent-runner` stubs stay unbuilt.

## Consequences

- Domain packages gain an agent surface with one thin `tools.ts` over their existing
  service layer; no new domain logic, no transport coupling.
- The MCP endpoint requires no new deployment binding — it rides the operator's existing
  auth pipeline, DB lease, and lazy-route `c.var` hydration.
- Risk/confirmation is declarative data on the manifest, so remote consumers can gate
  destructive tools (e.g. `reserve_trip`) without executing tool code.
- Standard MCP `tools/list` carries the typed output schema, MCP annotations, and
  namespaced Voyant metadata (capability identity/version, owner, aliases, scopes,
  audience, and exact risk policy); clients do not need the custom manifest endpoint
  to make compatibility or approval decisions.
- Supersedes the sibling `@voyant-travel/catalog-mcp` idea in
  [catalog-rag-architecture.md](../architecture/catalog-rag-architecture.md): the MCP is
  framework-level and in-deployment, not a per-catalog package.

## Alternatives considered

- **Keep the bespoke trips `POST /tools/:tool`.** Rejected: not real MCP, no scopes/risk,
  not reusable across domains.
- **A separate MCP service (such as a Durable-Object `McpAgent`).** Rejected for
  the operator: it adds a deployment boundary and splits tenancy; the stateless
  in-deployment route group fits the one-application-per-tenant model.
- **`@modelcontextprotocol/sdk`'s Node-`http`
  `StreamableHTTPServerTransport`.** Rejected because it bypasses the
  deployment's existing Hono routing and middleware; `@hono/mcp` preserves that
  web-standard transport boundary.
- **Full-SDK per-request statefulness.** Deferred: stateless JSON responses cover the
  request/response tool surface; SSE streaming can be added later if needed.
