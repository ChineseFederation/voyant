# @voyant-travel/tools

## 0.10.3

### Patch Changes

- f9ff2da: Specify the format of `ToolActionPolicyBinding.id` and normalize the six graph action ids that diverged from it.

  `id` is an opaque key of the selected graph action, matched by exact equality against that action's own `id`. It is not an owner-scoped identity: a manifest consumer must not parse it, require a package prefix on it, or infer an owner from it. No field of the action policy is an ownership claim: the owning module names the Tool capabilities permitted to select an action in its `from.tools`, and the gate enforces that binding — nothing is string-matched against `owner`. It is not an audit identity either — the ledger records `capabilityId ?? id` as its `action_name`, so for any action declaring a capability the key never reaches a persisted row.

  Six of 277 first-party graph actions were not qualified by their own package, which is what invited a client to read the prefix as meaningful and reject `cancel_booking`. They now are: bookings' `booking.status.{cancel,start,complete,override}` and `booking.pii.read` become `@voyant-travel/bookings#action.{cancel,start,complete}-booking`, `#action.override-booking-status` and `#action.read-booking-pii`; `relationships.person_document.reveal` becomes `@voyant-travel/relationships#action.reveal-person-document`. `cancel_booking`'s `actionPolicy.id` and the `bookings.cancel` admin operation's `capabilityKey` move in lockstep.

  No persisted identity moves. Each renamed action either declares a `capabilityId` — which is what the gate records as `action_name` — or is recorded by a package-local route path under its own constant. The `booking.status.*` literals in bookings' admin routes and status service, and `PERSON_DOCUMENT_REVEAL_ACTION_NAME` in relationships, are ledger identity and are unchanged.

## 0.10.2

### Patch Changes

- 007ac90: Reject approval-required generic Tool execution at registration because arbitrary dispatch cannot be durably fenced, stop advertising approval continuations for actions whose policy never requires approval, and tolerate explicit confirmation on execute commands where approval already supplies the required authorization.

## 0.10.1

### Patch Changes

- 4c218bc: Keep approval command fingerprints server-owned for handler-managed tools while preserving exact-command validation against the approved ledger request.

## 0.10.0

### Minor Changes

- 4fe6f79: Add `book_product`, an intent-level booking workflow tool, and retire
  `generate_booking_number` (voyant#3933).

  `book_product` books a product for a client in a single call — product and
  option, the billing party (`personId` or `organizationId`), travelers, and
  rooms. It replaces the multi-call sequence the old `create_booking` description
  scripted in prose (find the client with `list_people`/`list_organizations`,
  resolve options with `list_product_options`/`list_option_units`, allocate a
  reference with `generate_booking_number`, then create). The platform now
  orchestrates all of it: the booking reference **and** the action-ledger
  idempotency key are resolved server-side, so the model never carries a token
  across turns — the failure mode that produced duplicate bookings. Like
  `compose_product`, an incomplete request returns actionable issues and writes
  nothing. It carries its own action policy and does not bypass the action-ledger
  gate.

  **Breaking change.** `generate_booking_number` is removed — no alias, no
  deprecation window (the product is in beta). `book_product` subsumes it, and
  `create_booking` now allocates the reference server-side too, so
  `booking.bookingNumber` is optional and callers no longer pre-allocate. The
  orchestration prose is deleted from `create_booking`'s description.

  First-party migration in the same change: `@voyant-travel/bookings-react`'s
  manual-booking MCP client and dialog no longer call `generate_booking_number`
  (`REQUIRED_TOOLS` is now `["create_booking"]`); they submit `create_booking`
  without a client-invented reference and keep the stable client idempotency key
  that makes a retry replay the original booking.

  `@voyant-travel/tools` gains `withServerResolvedIdempotencyKey`, the sanctioned
  way for a handler-owned workflow tool to seat a server-derived idempotency key
  on an already-authentic admission — the created-target analogue of the
  server-owned `requestId` a generic server-owned-target action already uses.

- 276d44d: Three fixes found by driving the MCP surface as a real client rather than a
  scripted one.

  `ToolDefinition` gains `resolvesIdempotencyKeyServerSide`. A handler-enforced
  ledgered `execute` previously advertised `idempotencyKey` as caller-required
  unconditionally, so `book_product` — whose purpose is that no token crosses
  calls — told agents to supply the very thing it resolves for them.

  A `<domain>_query` result now applies the concise projection to
  `structuredContent`, not only the text block. Query tools advertise a permissive
  output schema, so trimming cannot fail validation; a client reading structured
  content previously saw none of the concise saving. Measured 52% smaller.

  Server instructions distinguish a key that authorizes nothing from a read-only
  one, instead of claiming reads work when every query returns empty.

## 0.9.2

### Patch Changes

- a1d8160: Progressive disclosure for the MCP tool surface (voyant#3927). `tools/list` used
  to serialize every authorized tool on every connection — 264 tools / ~310 KB /
  ~78k tokens — before the agent had read the request. It now advertises only a
  tier-0 of three meta-tools and discovers the long tail on demand:

  - `search_tools(query, domain)` — names + one-line descriptions (no schemas).
  - `describe_tool(name)` — the full projected input schema, output contract, and
    discovery metadata for one tool.
  - `call_tool(name, args)` — dispatch a tool that is not eagerly registered.

  Flat-name `tools/call` still dispatches the full authorized surface, so existing
  clients keep working unchanged. Authorization is re-checked at both the index
  (`search_tools` / `describe_tool`) and the dispatch (`call_tool` / flat name)
  layers: an unauthorized tool is neither discoverable nor callable. The
  scope-filtered `GET /manifest` index stays fine-grained. Measured for a full-scope
  staff key, `tools/list` drops to ~1.5 KB / ~370 tokens (a ~210x reduction).

  `McpApiRoutesOptions` gains an optional `eagerToolNames` allowlist to promote
  specific tools into the resident tier-0 surface; it defaults to empty.

  `ToolError` no longer throws when constructed with a `code` outside the documented
  set — it falls back to the terminal `PROVIDER_ERROR` remediation instead of
  crashing while computing `retryable`/`nextSteps`.

## 0.9.1

### Patch Changes

- 9d6a72b: Fix `ToolError` throwing a `TypeError` when constructed with a code outside
  `ToolErrorCode`. Domain handlers may raise their own codes, which the MCP
  transport forwards verbatim; looking up per-code defaults without a fallback
  turned any such throw into an unrelated construction failure and masked the real
  error as a generic `PROVIDER_ERROR`. Unknown codes now fall back to the
  conservative terminal defaults and keep their code.

## 0.9.0

### Minor Changes

- fae0f36: Make tool errors actionable. `ToolError` now carries `retryable`, `nextSteps`,
  and optional `candidates`/`didYouMean` alongside the existing `code`/`meta`. Each
  `ToolErrorCode` has a documented remediation and defensible retry semantics
  (`AUTHORIZATION_DENIED`, `INVALID_INPUT`, `NOT_FOUND`, a permanent
  `PROVIDER_ERROR` and the rest are terminal; only the new transient
  `PROVIDER_UNAVAILABLE` is retryable), so a caller can tell "retry" from "stop".
  The fields default per code, so existing throw sites stay valid.

  `APPROVAL_REQUIRED` and `CONFIRMATION_REQUIRED` now state their exact
  remediations ("request approval via request_action_approval, then re-call with
  \_voyant.approvalId" / "re-call with \_voyant.confirmed=true"). The storefront
  verification rate limit now reports the transient, retryable
  `PROVIDER_UNAVAILABLE` instead of `PROVIDER_ERROR`.

  The MCP error envelope in `dispatchToResult` surfaces `retryable`, `nextSteps`,
  `candidates`, and `didYouMean` as first-class properties, not buried in `meta`.

## 0.8.0

### Minor Changes

- 52c794d: Admit handler-owned actions bound to a route as well as to a Tool.

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

- 52c794d: Add a separate self-service action over the durable booking-create command.

  `create-booking-self-service` is a second action, not a widening of the staff
  Tool: it carries its own capability identity (and therefore its own fingerprint
  domain), allows only the `customer` actor, is bound to the route transport so
  it is unreachable from MCP, and declares a narrow public invocation contract in
  which the caller supplies only an idempotency key.

  `executeFinanceBookingCreateCommand` is replaced by two explicit entrypoints —
  `executeFinanceStaffBookingCreateCommand` and
  `executeFinanceSelfServiceBookingCreateCommand` — over one private mutation
  core. Each validates exactly one static policy expectation rather than
  selecting it from caller-supplied admission metadata, so neither can be driven
  by the other's admission. `verify:booking-create-authority` now enforces that
  boundary mechanically.

  `@voyant-travel/tools` gains `assertAdmittedActionPolicy` for command
  entrypoints that hold an admission but no `ToolContext`.

## 0.7.2

### Patch Changes

- 6df3ab4: Expose a review-first booking contract workflow to operator tools, including applicable-template prerequisites, immutable draft revisions, exact approved delivery, durable delivery status, audited void handling, authenticated MCP scope propagation, and shared tool context typing.

## 0.7.1

### Patch Changes

- 9713e4b: Serialize Tool input schemas with `io: "input"` in the discovery manifest.
  `z.toJSONSchema` defaults to the output direction, which cannot resolve a
  transform's output type and threw — so 26 of 284 Tools were published with a
  description-only stub carrying no parameter names, types or required list.

## 0.7.0

### Minor Changes

- 17f1239: Replace the inline Finance booking-create HTTP and dual-create surfaces with one
  handler-admitted, idempotent created-target Tool command. Booking rows, dependent
  finance records, the canonical action-ledger result, and domain-event outbox
  entries now settle in one transaction; exact retries resolve the original booking.

  Remove the retired booking-create React mutation, sheet, page, and slot shortcut.
  Unmount the legacy admin new/journey routes and semantic destinations, remove
  catalog and inventory booking actions, and remove the standard storefront
  `/shop/book/:entityModule/:entityId` route plus its booking page/journey exports.
  Catalog browsing, booking read/detail, customer-portal sessions, and reusable
  draft sections remain available; new booking creation is a Finance staff Tool.
  Remove raw Bookings, Charter, and Cruise creation APIs and Tools. Delete the
  dormant Catalog owned-commit contract and Inventory, Accommodations, Cruises,
  Commerce, Storefront, and Storefront SDK booking-row creation bridges rather
  than retaining unavailable legacy mutations. Require registry-minted,
  unforgeable handler admission plus a single-use Finance-specific mutation lease
  for Bookings domain settlement, and remove the Finance command's public
  subpath.

## 0.6.0

### Minor Changes

- a02a76b: Move generic MCP action targets, idempotency fingerprints, and approval preflight
  behind a discoverable server-owned Tool contract. Migrated packages resolve ledger
  targets from validated input, approval-required calls return structured server-issued
  approval metadata, and exact retries are validated against the stored command and
  principal. Route every handler-created target through the selected Tool admission,
  remove the raw created-target executor from the public package surface, and reject
  future package-level bypasses during manifest convergence. Validate graph risk
  against the loaded Tool tier before release and keep the Operator MCP health check
  from accepting startup failures.

## 0.5.0

### Minor Changes

- b07a0a3: Add an explicit handler-owned durable result protocol for existing-target Tool
  commands, including atomic package-owned operation intent preparation, exact
  admission, stable replay context, organization-bound approval continuity, and
  framework/runtime contract validation. Existing-target command payloads are
  restricted to immutable, acyclic JSON values so their runtime identity cannot
  diverge from canonical fingerprinting; that sanitized frozen value is the
  authoritative target, fingerprint, claim, and handler snapshot.

## 0.4.0

### Minor Changes

- bf548af: Make generated-child Tool creation retry-safe by binding each command to an
  explicit stable parent anchor, admitting the selected graph action in the
  handler, and atomically persisting the command claim, child row, and canonical
  child reference.
- a6460e2: Add explicit created-target action metadata and fail closed unless handler-owned
  Tools declare a durable command claim, replay, and canonical result-reference
  contract. Adopt the shared transaction-owning created-command executor for
  Bookings reservations, stop asking MCP callers to invent generated target IDs,
  and fail approval-bearing created commands closed until handler control
  propagation exists.
- Propagate isolated handler-owned action controls through Tool context and support
  transactionally validated approval-required created-target commands.

## 0.3.0

### Minor Changes

- cabf662: Add the provider-neutral, staff-only action-ledger Tool surface for audit
  entries, target timelines, approvals, delegations, and relay inspection. Add
  guarded approval request/decision Tools whose capability, risk, and policy are
  derived from selected graph actions and whose writes fail closed for missing,
  conditional, expired, misassigned, or no-longer-selected authority. Publish
  selected graph actions to package Tool context contributions. Reversal remains
  inspection-only until a provider-neutral runtime can execute and attest the
  underlying domain reversal command.
- b8cef4c: Carry stable capability identity, owner, version, aliases, deprecation, audience, deployment
  risk, input/output schemas, and MCP annotations through the Tool registry and standard MCP
  discovery. Graph bindings now check runtime metadata parity, while legacy invocation aliases
  remain callable and exact capability-version lookup fails closed for unsupported versions.
- db5adce: Fail closed before selected graph Tool dispatch by binding each capability to its action-ledger
  policy. Advertise invocation controls in discovery, enforce confirmation, target, idempotency,
  fingerprint, approval, and principal semantics, and record required-ledger execution outcomes.

  Keep the existing package-owned booking cancellation and invoice refund approval workflows as
  explicit handler-enforced policies so their domain-state fingerprints and atomic ledgers are not
  double-gated.

- c9b6144: Add graph-composed, module-owned Tools for navigation preferences and organization setup,
  including exact action policies and owner-scoped project configuration for MCP context wiring.
- ff87f68: Add staff-only workflow-run Tools for typed run inspection, registered workflow
  triggering, and rerun/resume retries. Writes require strict explicit scopes,
  confirmation, approval, action-ledger recording, and a graph-selected
  self-hosted workflow provider. Pass selected provider roles to package Tool
  context contributions so management operations fail closed when deployment
  authority is absent. Trigger and retry use a worst-case critical risk because
  the runner port has no per-workflow side-effect descriptors. Cancellation
  remains unavailable until the
  provider-neutral runner port exposes a real cancellation capability.

## 0.2.2

### Patch Changes

- 552acbf: Publish an external-consumer-safe Zod peer range and refresh Bookings so its public dependency
  range no longer selects the historical `@voyant-travel/tools@0.0.0` manifest.

## 0.2.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.

## 0.2.0

### Minor Changes

- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.

## 0.1.0

### Minor Changes

- 1655995: Publish the agent tool library (`@voyant-travel/tools`) and the in-deployment MCP
  server (`@voyant-travel/mcp`). `@voyant-travel/tools` is the transport-neutral,
  headless tool contract (`defineTool`, `createToolRegistry`, risk metadata);
  `@voyant-travel/mcp` exposes a tool registry as a Model Context Protocol server
  mounted at `/v1/admin/mcp`.
