# @voyant-travel/tools

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
