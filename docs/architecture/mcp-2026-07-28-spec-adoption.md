# MCP 2026-07-28 Spec Adoption Tracking

- **Status:** Tracking (opened for [#3934](https://github.com/voyant-travel/voyant/issues/3934), MCP W10)
- **Umbrella:** [#3921](https://github.com/voyant-travel/voyant/issues/3921) — redesign the MCP tool surface around intents
- **Relates to:** [ADR-0011](../adr/0011-agent-tool-library-and-mcp.md) (transport-neutral tool library + in-deployment, stateless MCP server)

## Purpose

A new MCP specification revision landed **2026-07-28** with several features that
would let us delete workarounds currently carried in `packages/mcp` and
`packages/hono`. This document tracks those features and what each one buys us.

It is a **checklist, not an implementation**. None of the features below are
implemented here yet, because the TypeScript SDK does not support them yet.

## SDK reality (verified 2026-07-31)

- `packages/mcp` now depends on `@modelcontextprotocol/sdk@^1.30.0`
  (was `^1.29.0`; lockfile updated). 1.30.0 is the latest published release.
- **1.30.0 was published 2026-07-27 — one day *before* the spec revision
  landed** — so none of the 2026-07-28 features are implemented in the TS SDK.
- The SDK's `LATEST_PROTOCOL_VERSION` is `2025-11-25`. Its
  `SUPPORTED_PROTOCOL_VERSIONS` do **not** include `2026-07-28`.
- Our stateless Streamable-HTTP transport negotiates `2025-11-25` when a client
  requests it, and falls back to `2025-11-25` for an unsupported
  `2026-07-28` request.
- This is asserted by `tests/protocol-version.test.ts` so a future SDK bump that
  advances the negotiated wire protocol — and unlocks the features below — is
  visible in a diff rather than silent.

**Adopt each feature as the SDK ships it.** Re-verify SDK support with:

```sh
npm view @modelcontextprotocol/sdk version
node -e "import('@modelcontextprotocol/sdk/types.js').then(m => console.log(m.SUPPORTED_PROTOCOL_VERSIONS))"
```

## ⚠️ Deprecation constraint — do not build on these

**Sampling, Roots, and Logging are DEPRECATED in the 2026-07-28 revision, with a
12-month offramp.** Do not build new capabilities on them, and migrate off them
where already used:

- The **guide layer** (#3931) and any future **elicitation** work must not depend
  on Sampling, Roots, or Logging.
- Prefer the MRTR `input_required` path (feature 2 below) over Sampling-based
  round-trips for server-initiated input.

## Note — the spec validates ADR-0011

The spec core went **stateless**: protocol version is per-request, and client
identity plus capabilities travel in `_meta` rather than in a negotiated
session. This independently validates
[ADR-0011](../adr/0011-agent-tool-library-and-mcp.md)'s decision to run a
stateless MCP server (fresh server + transport per request, **no session store,
no Durable Object**). It closes the statefulness tension raised during #3921:
the spec is now moving in the direction we already committed to, so there is no
pressure to introduce a session store or a separate MCP service.

## Feature checklist (value order)

### 1. Cacheable list results — `ttlMs`, `cacheScope`, deterministic ordering

- [ ] Adopt when SDK supports it.
- **What it buys us:** clients can cache the tool catalog, and upstream prompt
  caches stay stable across reconnects. Compounds with the progressive
  disclosure already merged (#3927): the residual tier-0 payload becomes
  near-free on reconnect. Lets us stop worrying that every reconnect re-pays the
  `tools/list` token cost.

### 2. MRTR `resultType: "input_required"` — server-initiated elicitation

- [ ] Adopt when SDK supports it.
- **What it buys us:** a tool can request missing input via `inputRequests` plus
  an opaque `requestState` the client echoes back, **without a session** — so it
  fits our stateless transport directly. This is the eventual fix for
  orchestration prose currently embedded in tool descriptions: a workflow tool
  missing (e.g.) a billing party can *ask* for one instead of failing or relying
  on description text. Pairs with W9. Must avoid Sampling (see deprecation note).

### 3. Tasks extension — `io.modelcontextprotocol/tasks`, poll-based `tasks/get`

- [ ] Adopt when SDK supports it.
- **What it buys us:** long-running work no longer has to finish inside one HTTP
  request. Lets us delete the "must complete within one request" constraint on
  `search_flights`, `source_trip_requirement_candidates`, and document
  generation, replacing it with a poll-based task lifecycle.

### 4. `Mcp-Method` / `Mcp-Name` header routing

- [ ] Adopt when SDK supports it.
- **What it buys us:** authorization and rate limiting can route on headers
  without parsing the JSON-RPC body. Lets us delete the path special-case in
  `packages/hono/src/middleware/auth.ts` (around line 415) and stop the rate
  limiter from parsing the request body to classify calls.

### 5. Authorization hardening — RFC 9207 issuer validation; CIMD

- [ ] Adopt when SDK supports it.
- **What it buys us:** RFC 9207 issuer validation on the authorization response,
  and Client ID Metadata Documents (CIMD) replacing the deprecated Dynamic
  Client Registration (DCR). Lets us retire DCR-based client onboarding.

## Acceptance for #3934 (this change)

- [x] SDK on the latest published version (1.30.0), lockfile updated.
- [x] A test asserts the negotiated protocol version
      (`tests/protocol-version.test.ts`).
- [x] This tracking checklist exists for features 1–5, including the
      Sampling/Roots/Logging deprecation warning.
- [x] Existing `packages/mcp` tests still pass — this is an upgrade, not a
      behaviour change.
