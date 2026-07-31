# Agent Tool Library & MCP Server

Status: implemented foundation (voyant#2792).
Audience: anyone adding agent-callable capabilities to a Voyant domain, or wiring the
MCP server into a deployment.

Voyant exposes framework capabilities to agents through **one authored-once, headless,
scope-gated tool contract**. Exposure — the MCP server, remote agent clients, HTTP — is
a thin adapter over that contract. See [ADR-0011](../adr/0011-agent-tool-library-and-mcp.md)
for the decision record.

## Layers

```
@voyant-travel/tools      pure contract (zod only): defineTool, ToolContext,
        ▲                 ToolRegistry, stable identity, schemas, audience + risk
        │
   ┌────┴───────────────┐
domain packages           @voyant-travel/mcp        transport adapter:
(*/tools: tool arrays)    MCP SDK + @hono/mcp over the registry, scope-enforced
        ▲                        ▲
        └──────────┬─────────────┘
        selected graph runtime: loads package-declared tools and context contributors;
        the selected @voyant-travel/mcp module mounts /v1/admin/mcp
```

Dependency direction is strictly downward. `@voyant-travel/tools` imports nothing heavy
(no `hono`, no `catalog`, no domain package). A domain package depends on `tools`; the
MCP adapter depends on `tools`. No cycles.

## Authoring a domain tool

Add a `src/tools.ts` to the domain package and export it via a `./tools` subpath
(mirroring how the module exports its route bundle). A tool is a thin wrapper over the
**existing service layer** — no new domain logic:

```ts
export const listProductsTool = defineTool({
  name: "list_products",
  description: "List products with filters and pagination. Read-only.",
  inputSchema: productListQuerySchema,     // reuse the domain's zod schema
  outputSchema: listResponseSchema(productToolSchema), // structural and MCP-serializable
  requiredScopes: ["products:read"],        // resource:action, AND-enforced
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(query, ctx) {
    return requireService(ctx.inventory, "inventory").listProducts(query)
  },
})
export const inventoryTools = [listProductsTool, getProductTool] as const
```

Rules:

- **Return typed pure data**, validated by `outputSchema`. Never return MCP envelopes or
  presentation — the transport wraps data at its boundary.
- **Inject services by intersecting the context type** (`ToolContext & { inventory?: … }`)
  and resolve with `requireService`. The tool package never imports the domain's DB or
  service; the deployment binds services to the request `db`.
- **Declare risk as data** (`tier` + `riskPolicy`) so remote consumers can gate
  destructive tools (e.g. a `reserve`-style tool: `tier: "destructive"`,
  `riskPolicy.confirmationRequired`) without executing the handler.
- **Cross-module / composed tools** (spanning several domains) live in the package that
  already owns the real orchestration service. For example, Trips owns candidate
  composition while Finance owns booking creation across Bookings and Finance. A Tool
  must not create a second composition layer or persist directly into foreign tables.
- Keep `inputSchema` serialization-friendly (avoid top-level `.transform()`/`.refine()`)
  so `z.toJSONSchema` emits a faithful manifest.
- Treat the package Tool id as the stable capability identity. `name` is the canonical
  MCP invocation label and `aliases` are temporary compatibility labels. Graph-driven
  registration supplies `capabilityId` and `owner`; standalone registries should declare
  them on the Tool. Capability versions default to `v1` only for legacy compatibility.
- Graph-driven registration checks duplicated invocation name, required scopes, and
  deployment risk against the loaded runtime definition. Drift fails registration
  instead of producing a misleading manifest.
- Prefer serializable output schemas. Runtime-only/permissive schemas remain callable,
  but first-party manifest Tool runtimes must expose structural output schemas. The
  architecture checker rejects `z.custom()` and opaque top-level output schemas in
  canonical Tool runtime modules.

## Intent-level workflow tools

Some jobs an operator does are not one service call — they are a fixed sequence of
them. When that sequence leaks into a tool **description** as prose the model is
expected to follow ("find the client with `list_people`, resolve options with
`list_product_options`, allocate a reference with `generate_booking_number`,
then create"), that is the signal to build a **workflow tool**: one intent-driven
call that the platform orchestrates. See voyant#3921 / voyant#3933.

A workflow tool:

- is **one intent-level call** — `book_product`, not
  find-client → resolve-options → allocate-reference → create;
- **resolves server-side** every token the caller would otherwise carry across
  turns. `book_product` allocates the booking reference and derives the
  action-ledger idempotency key itself, so an identical retry replays the
  original booking instead of minting a second one. Carrying an opaque token
  across turns is one of the least reliable things to ask of a model, and the
  failure mode is a duplicate write;
- **validates before it writes** — an incomplete request returns actionable
  issues and creates nothing, exactly as `compose_product` does;
- **carries its own action policy.** It does not bypass the action-ledger gate:
  risk, confirmation, ledger binding, and approval are per-action and
  load-bearing. A workflow tool gets its own capability identity and action id
  even when it composes the same durable command as a lower-level tool, so the
  two admissions stay unconfusable.

**Where a workflow tool lives — the ownership rule.** A workflow tool lives in the
package that owns the **real orchestration service**, which is not always the
package the job is named after. Booking is the load-bearing example: a booking is
created by `book_product`, but that tool lives in **`@voyant-travel/finance`**, not
`@voyant-travel/bookings`. Finance already composes Bookings (the lease-gated
domain settlement), travel credits, payment schedules, and invoices inside one
durable command — it is the only package that can orchestrate all of them without
introducing a workspace dependency cycle — so the booking workflow tool belongs to
Finance. Do not add a booking tool to `@voyant-travel/bookings`; it would have to
reach back into Finance to do the real work. When a workflow's home is
non-obvious, it is because the orchestration service already lives somewhere the
job's name does not point to — follow the service, not the noun.

## Domain completeness notes

Inventory owns guarded core authoring and lifecycle Tools (`create_product`,
`update_product`, `publish_product`, `unpublish_product`, and `archive_product`) over
the real product service. Publication continues to use that service's readiness gate;
the Tool does not reproduce the rule. `get_product_content` composes owned and sourced
content through the selected Catalog content runtime, preserving provider authority.
`compose_product` accepts the structural `productGraphSpecSchema` and delegates to the
package-owned atomic composer. Created-target Tools return only immutable canonical
references (`productId`, `programId`, `envelopeId`, or `roomBlockId`); callers that need
the mutable resource graph must follow with the corresponding read Tool.
The runtime records the canonical ledger result plus `product.created` and
`product.content.changed` in the same database transaction through the durable outbox.

There is intentionally no monolithic `update_product_content` Tool. The unified
product-content service is a read resolver; authored options, itineraries, media,
translations, merchandising, and availability are separate aggregate services with
different invariants. A single record-shaped write wrapper would bypass those service
boundaries and expose shallow storage mechanics. Future content mutation Tools must be
workflow-shaped and delegate to the appropriate Inventory aggregate service.

Trips owns cross-module candidate composition. A guarded requirement-creation Tool is
the workflow entry point; requirement sourcing and re-shop Tools resolve the
deployment-selected provider-neutral availability fan-out, while candidate selection
delegates to the Trips invariant service that pins a draft component. Tool outputs
omit provider replay/economics payloads even though Trips retains them internally for
later reservation.

Booking creation is exposed only through Finance's admitted create command. Finance
owns the public command and its policy admission; Bookings owns the lease-gated domain
settlement that inserts the canonical row. Capacity holds remain separate pre-booking
operations and cannot create a booking. The intent-level entry point is
`book_product` (a Finance workflow tool, per the ownership rule above): it maps a
product/client/travelers/rooms request onto that same durable command, resolving the
booking reference and the idempotency key server-side. `create_booking` remains the
lower-level tool for a caller that already holds a fully resolved command; it too now
allocates the reference server-side. The old `generate_booking_number` tool — which
existed only to make the caller carry a reference across calls — is retired.

Graph actions distinguish existing targets from handler-generated targets explicitly.
Generic action preflight resolves targets through a deterministic server-owned ladder: a
package-owned `resolveActionTarget` handles genuinely complex cases; otherwise
`commandTargetField` selects the target from already validated domain input; and ledgered read
collections use an authenticated `${targetType}:${tenantId}` organization/operator anchor.
Migrated generic required-ledger executes advertise this resolution and reject client target ids
and fingerprints. While packages move in bounded releases, executes without an explicit resolver
or `commandTargetField` retain the prior discoverable invocation contract; Max cutover and global
fail-closed registration wait until that temporary branch reaches zero.

Handler-owned existing-target actions opt into
`existingTarget.durability: "handler-command-result-v1"`. That opt-in requires a stable
`commandTargetField`, required-ledger execute policy, non-conditional approval, and handler-owned
enforcement. The action-ledger transaction binds the selected action, target, organization,
principal, payload fingerprint, idempotency key, approval, and causation, then requires the domain
handler to persist its durable operation intent in that same transaction. Only after both claim
and intent commit may the handler cross an external boundary. An exact retry is routed to the
handler's replay/resume path instead of being rejected and is therefore guaranteed to find the
durable intent. Only frozen admitted command fields and the exact frozen domain payload cross the
transaction boundary; raw request context is not retained or injected into replay. Command payloads
must be acyclic JSON values made from primitives, arrays, and plain records; exotic objects,
accessors, sparse arrays, and non-finite numbers fail closed before fingerprinting. The sanitized
frozen value is the single authoritative snapshot for target extraction, fingerprinting, claim
construction, intent preparation, execution, and replay.
Created-target actions declare a stable pre-create command target, an immutable result-reference
type, and the `handler-command-claim-v1` durability strategy. The framework rejects a generic Tool
binding for that lifecycle because it cannot make an arbitrary package transaction atomic with a
transport wrapper. The declaration is a contract, not an after-dispatch hint: the handler must
claim before mutation, resolve exact replays, conflict on altered commands, and append the
generated canonical target in the same transaction (or use a durable outbox/state machine for
external effects).
Execute Tool actions may also declare an explicit graph `availability`. An action marked
`unavailable` remains in the resolved graph with a stable `reasonCode`, but its Tool and
runtime reference are omitted from lowering, so it cannot appear in MCP discovery or dispatch.
Lowering fails closed if an unavailable action's Tool is reintroduced. Actions explicitly marked
`available` must name an existing/created target lifecycle; external or multi-stage effects must
also name a transactional, outbox, or saga durability strategy and the test that proves it.
For actions carrying any availability, effect-boundary, or durability metadata, omitted
availability is validated with the same callable meaning used by runtime lowering. Removing only
an `unavailable` marker therefore cannot bypass lifecycle or tested-durability checks.
An unavailable action may opt into `enableWhen.selectedProviderPorts` with explicit `all` or
`any` semantics. This is the only supported conditional activation path. The authored
`status: unavailable` remains deliberately fail-closed for older framework versions. The current
resolver keeps it unavailable even when every required (or at least one alternative) one-valued
port is consumed by the action owner, closed by a graph provider declaration, and matched by the
deployment's explicit provider role/value selection. Its Tool metadata, selected id, and runtime
reference remain outside the enumerable graph runtime. Missing or unselected providers leave the
action hidden; malformed, unknown, or ambiguously selected ports invalidate the graph before
runtime generation. Host callbacks, environment inspection, package capability tokens, and
provider-owned free-form flags cannot activate an action. The selected provider factory is
instantiated during startup, and each activation runtime-port declaration carries an importable
reference to its owning typed `VoyantPort`. The framework loads that exact port and runs its
conformance kit against the exact selected provider instance before a module-private authority
creates a sanitized activated runtime view. Only that view promotes the action to ordinary
available metadata and exposes its Tool. Composition additionally rejects a host-substituted
provider instance. Framework lowering records every authentic raw and activated runtime in a
module-private identity registry; MCP verifies that identity through the narrow framework
attestation boundary before inspecting actions or loading Tools. It accepts no assertion callback,
structural available-action substitute, or conditional action shape. Provider
import, factory, or port-conformance failure therefore leaves the provisional graph unchanged and
cannot list the conditional Tool.
The legitimate `createVoyantGraphRuntime` mint path takes a detached, recursively frozen metadata
snapshot. Raw and activated runtime views therefore cannot be rewritten after minting: actions,
availability requirements, provider selections and declarations, Tool and reference loaders,
selected ids, catalogs, and nested binding arrays remain immutable while the selected provider
instance itself remains usable and is checked by exact identity.
`@voyant-travel/mcp` declares the matching framework line as a required peer, so the graph adapter
can import that narrow attestation subpath without introducing a direct runtime dependency cycle
through the standard operator distribution.
First-party actions that still cross an external or multi-stage boundary through event
publication, provider calls, document generation, delivery, ticketing, or booking orchestration
are declared unavailable with the `unsafe-nontransactional-effect` reason and the corresponding
effect boundary. Their graph metadata remains visible for diagnostics, but their Tools stay out
of runtime discovery until the package owns a tested transactional, outbox, or saga boundary.
Supplier-side cancellation is an external effect, and legal state transitions remain multi-stage
while lifecycle-event publication occurs after the state commit; both stay quarantined.
MCP passes stripped invocation controls and the selected action policy in a fresh
`ToolContext.handlerActionPolicy` only for handler-owned dispatch. Approval-required created
commands bind their approval request and execution to the same typed created-target fingerprint;
the handler-owned transaction locks the approval, validates live authorization before the first
claim/domain mutation, rejects cross-scope reuse, and derives approval causation from the ledger.
Exact linked replay checks immutable persisted approval/request/claim continuity without applying
expiry again. Approval requests bind the exact selected Tool capability (explicitly for multi-Tool
actions), and handlers use the context capability id as their ledger route identity. Conditional
created-target approval remains fail-closed.
Existing-target durable commands apply the same exact approval continuity. The first claim uses
live approval and authorization validation; linked replays validate immutable persisted
request/approval/claim identity without reapplying expiry. Altered targets, payloads, keys, policy,
principal, or capability identity conflict before domain dispatch.

When the generated target is a child row, `createdTarget.parentAnchor` names the stable existing
owner carried by the Tool input. A static parent uses `targetType` plus `targetIdField`; polymorphic
owners use `targetTypeField` plus `targetIdField`. `relatedTargetIdField` declares an additional
reference whose membership must be checked by the handler (for example, an option must belong to
the product that owns an extra). Parent validation, the command claim, the child insert, and the
canonical child reference must share the handler-owned transaction.

Finance owns two composed operator commands. `create_booking` delegates to the
booking-create service for product/slot conversion, travelers, room and item lines,
payment schedules, optional credits, groups, invoice documents, ledger entries, and
post-commit events. Its action policy is handler-owned because the canonical booking id
is generated during the booking transaction and that service records the authoritative
`booking.create` entry. The generic pre-dispatch gate must not invent a target or add a
second ledger timeline. The later invoice, payment, document, and event stages are not
part of the booking transaction, so callers must not treat the composed command as
exactly replayable until its durable command workflow lands.
`issue_invoice_from_booking` delegates to the reusable invoice composer extracted from
the HTTP route. Invoice/proforma issue requires an exact action approval: the command
fingerprint is stable across request and execution, successful execution carries the
approval/causation fields into the ledger, and a replay resolves the previously issued
invoice instead of creating another.

## Coverage posture

Every first-party `voyant.module.v1` module and `voyant.plugin.v1` plugin unit must make
its agent posture reviewable. A unit with one or more `tools` declarations satisfies
this rule automatically; the Tool IDs and owning unit are derived from the package
manifest and must not be copied into a second catalog.

A module without Tools declares one of these postures in its package-owned manifest
metadata:

```ts
meta: {
  ownership: "package",
  agentTools: {
    posture: "planned",
    rationale: "Availability reads and guarded mutations need module-owned Tools.",
    issue: "#3370",
  },
}
```

- `planned` means the module owns agent-relevant capabilities that are not exposed yet.
  It requires a non-empty rationale and tracking issue.
- `not-applicable` means exposing the module would create a shallow or unsafe agent
  interface. It requires a non-empty rationale identifying the deeper owning module or
  transport/adapter responsibility.

The MCP module has one narrow checker-owned exclusion: it is the transport adapter
that exposes selected package Tools and does not itself own domain capabilities. Other
schema-only, transport-only, or adapter modules still declare `not-applicable`
explicitly in their own manifests.

`pnpm report:agent-tool-coverage` prints the deterministic module/Tool inventory and
all no-Tool declarations. `pnpm verify:agent-tool-coverage` tests the policy and fails
when a first-party module or plugin lacks either a Tool surface or a valid posture.
Extensions that declare Tools are included in the inventory, but extensions without
Tools are not forced to add placeholders.

## Deployment wiring

Each package manifest declares its `tools` runtime references, required scopes, risk,
and context keys. Runtime lowering selects those declarations with the package graph;
`createGraphMcpApiRoutes` loads only those tools and their package-owned context
contributors. The `@voyant-travel/mcp` manifest owns the admin route and requires the
`mcp.runtime` port. A deployment binds that port to its request context and resources;
it does not maintain a tool list or an Operator-local MCP module.

The generated graph runtime is also the executable eligibility source for action
bindings and outbound webhook plans. Separate `tools.json`, `actions.json`, and
`webhooks.json` eligibility catalogs are not emitted.

## Authorization

- **Scope (D2):** the MCP adapter checks each tool's `requiredScopes` against the caller's
  granted scopes with **AND** semantics (`hasApiKeyPermission`). Unauthorized tools are
  neither listed nor registered, so they cannot be called.
- **Coarse guard:** `/v1/admin/mcp` is exempt from the `require-actor` method+path guard
  (like `_meta`) because authorization is per-tool.
- **Audience (D3):** carried on the API-key grant metadata (`API_KEY_GRANT_PRESETS` bundle
  a scope subset + audience), resolved into the catalog `ResolverScope`. PII-sensitive
  resources (`bookings-pii`) are never satisfied by the `*` wildcard.
  A Tool may additionally narrow its `audience.allowed` set; both discovery and
  invocation fail closed for other grant audiences.

## Transport

`@modelcontextprotocol/sdk` `McpServer` over `@hono/mcp` `StreamableHTTPTransport`,
**stateless** (fresh server + transport per request, `sessionIdGenerator: undefined`,
`enableJsonResponse: true`). It runs inside the tenant's Node application; no
separate MCP service or Durable Object is required. `GET /v1/admin/mcp/manifest`
serves a contract-versioned discovery manifest for remote agents.

Standard `tools/list` is also a complete discovery surface. It includes input and
structured-output schemas, derived standard MCP annotations, and exact framework
metadata under `_meta["voyant.travel/tool"]`. Aliases are registered as callable MCP
names with `aliasFor` metadata, while the canonical manifest contains one entry per
capability. Consumers resolve capabilities by `capabilityId` plus an exact supported
`capabilityVersion`; an unknown version is unsupported rather than silently coerced.
For migrated generic ledgered actions, discovery advertises the chosen server-owned target resolution:
`package-resolver`, `command-target-field`, or
`authenticated-organization-collection`. The external invocation envelope contains only explicit
confirmation, an opaque UUID request id, an optional server-issued approval id, and an optional
reason code. For those actions the MCP adapter never accepts client-authored target ids or
fingerprints. Approval preflight is server-owned and returns stable
structured error metadata; an approved retry is admitted only after the action ledger matches the
recomputed action, target, command, principal, organization, and request id.

## Migration status

The deterministic coverage report is the source of truth for current Tool and module
counts. Remaining coverage is tracked in voyant#3370 and is visible through
`pnpm report:agent-tool-coverage`. A `planned` declaration records an uncovered
surface; it is not a substitute for implementing the Tool.

The first server-owned action-target release audits 140 available generic required-ledger Tools:
57 use a package-declared command target (48 migrated in this release), 51 sensitive reads use the
authenticated collection anchor, and 32 executes remain on the temporary compatibility contract.
Those 32 are tracked as 13 resolver migrations, 16 created/upsert handler protocols, and 3
package-specific conditional evaluators. Global strict registration and Max cutover wait for all
three follow-up groups to reach zero.

## Reconciliation

This supersedes the sibling `@voyant-travel/catalog-mcp` package idea in
[catalog-rag-architecture.md](./catalog-rag-architecture.md): the MCP server is
framework-level and in-deployment, not a per-catalog package. It is the concrete tool +
agent surface referenced by [ai-travel-experience-composition.md](./ai-travel-experience-composition.md)
and the agent control surface posture in [ADR-0009](../adr/0009-federated-operating-mode.md).
