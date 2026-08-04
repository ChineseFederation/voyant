# ADR-0022: A third-party Connect connector declares compatibility against the worker protocol, not against packages

- **Status:** Proposed (2026-08-04)
- **Relates to:** [#4062](https://github.com/voyant-travel/voyant/issues/4062) (the question this
  ADR answers), [#4059](https://github.com/voyant-travel/voyant/issues/4059) (public npm surface),
  [#3976](https://github.com/voyant-travel/voyant/issues/3976) (deploy-and-use pivot),
  [#3340](https://github.com/voyant-travel/voyant/issues/3340) (versioned admin extension API —
  its versioning section predates this),
  [connect#106](https://github.com/voyant-travel/connect-sdk/issues/106),
  [connect#107](https://github.com/voyant-travel/connect-sdk/pull/107),
  [ADR-0002](./0002-contract-packages.md) (contract packages — upheld, and narrowed in scope here),
  [ADR-0016](./0016-modules-as-components-of-one-deployable.md) (the image is one deployable),
  [cruise-adapter-contract](../architecture/cruise-adapter-contract.md) (amended alongside this ADR)

## Context

### The question

The deploy-and-use pivot replaced "107 published packages you build against" with "an image you
deploy". Per-package semver was the compatibility mechanism: an integration declared a range, npm
resolution enforced it. #4062 asked what replaces that for a third-party Connect connector, and
offered three candidates — the image tag or digest, a framework version the image reports, or a
separately versioned protocol.

The app half of that question is settled. Marketplace apps carry
`voyant.marketplace-release-compatibility.v1` with six independent axes, `appApiVersions` is a date
(`2026-07-01`), and voyant-cloud#1731 published the `/v1/app/*` OpenAPI document a publisher pins
against. #4062 then narrowed to connectors, on the stated grounds that the app answer cannot
transfer because *"a connector runs as code against a typed SDK rather than over HTTP."*

**That premise is false for third parties, and correcting it decides the question.**

### The topology

```
third-party connector  (Cloudflare Worker, serves HTTP)
      │  connector worker protocol — POST per operation path,
      │  { protocolVersion, operation, context, input } → { ok, data | error }
      ▼
Connect API  (voyant-cloud)
      ▲
      │  connect-sdk client, over HTTP
      │
plugin-voyant-connect → connect-adapter / connect-cruises   ← in-process, FIRST-PARTY
      ▼
operator image
```

A third-party connector never enters the operator process. It is a separately deployed Worker that
serves HTTP and is reached by Connect. The in-process half of the picture is glue that Voyant
itself ships.

### Evidence: what a third party actually builds

`voyant-travel/hisky-connector` is the reference an external author copies. Its whole dependency
set is `@voyant-travel/connect-provider-sdk`, `@voyant-travel/flights-contracts`, `hono`, and
`zod`; it is a Worker, deployed with wrangler. It does not depend on `connect-adapter`,
`catalog-contracts`, `@voyant-travel/catalog`, or the framework. Under the image model it could
not: the operator is a sealed digest, so there is no install step through which external code
enters the runtime.

What it uses from the SDK is three erased types and two one-line helpers (`ok`, `connectorError`).
The protocol is a wire contract, not a code dependency.

### Evidence: the packages #4062 is about are first-party glue

The two peer ranges the issue is built around live on packages that run *inside* the image:

```
apps/operator, packages/framework, packages/operator-standard
  └── @voyant-travel/plugin-voyant-connect        (packages/plugins/voyant-connect, private)
        └── @voyant-travel/connect-adapter ^0.5.0     ← peer: catalog-contracts ^0.112.2
        └── @voyant-travel/connect-cruises  ^0.6.2
```

No third party is in that chain. Whatever those ranges assert, they assert it to Voyant.

### Evidence: those versions already do not mean anything

`@voyant-travel/plugin-voyant-connect` exists three times, under one npm name:

| Where | Version | Peers |
| --- | --- | --- |
| npm (published 2026-07-04) | 0.3.3 | `catalog >=0.130.0 <1`, `cruises >=0.85.3 <1` |
| connect-sdk `main` | 0.3.3 | `catalog ^0.224.0`, `catalog-contracts ^0.112.2`, … |
| voyant `main` (**private**, ships in the image) | 0.10.1 | all `workspace:^` |

The published ranges are the un-failable ones connect#106 was opened about — `>=X <1` against a
0.x, where minors *are* the breaking channel — and `catalog` has since reached 0.230.0. connect#107
replaced them in the repo on 2026-08-01 but never released, so the corrected manifests have no
version to publish under and npm still serves the originals. The copy that actually runs resolves
`workspace:^`, which is wiring, not a claim. Three versions, three range styles, one name, no
external consumer of any of them.

### Evidence: the right axis exists, and is almost entirely inert

The protocol declares a date and a well-known path:

```ts
export const CONNECTOR_WORKER_PROTOCOL_VERSION = "2026-05-28" as const
export const connectorWorkerManifestPath = "/.well-known/voyant-connect/manifest" as const

export interface ConnectorWorkerManifest {
  protocolVersion: typeof CONNECTOR_WORKER_PROTOCOL_VERSION | string
  providerKey: string
  displayName?: string
  categories: string[]
  capabilities: ConnectorWorkerOperation[]   // operation granularity, not a coarse vocabulary
}
```

This is the right shape — a date-versioned wire contract plus a self-description at operation
granularity, the same answer `appApiVersions` gives for apps. **Almost none of it is live.** The
honest inventory, because the ADR is otherwise easy to misread as documenting a working mechanism:

**The version is never compared.** It is sent in every request body and as an
`X-Voyant-Connect-Protocol` header, stored as an opaque `z.string().min(1).max(64).optional()` in
`connector_providers.metadata`, and forwarded by the egress relay. Nothing anywhere reads it back.
No supported window, no mismatch path. A per-provider `metadata.externalAdapter.protocolVersion`
override changes the header but not the body, so the two can disagree unnoticed.

**The version is stale, and CI enforces the staleness.** The constant was set in the file's first
commit on 2026-05-28, when the union held 10 operations. Twelve more were added on 2026-06-02, -03
and -04 (stays, packages, the two quote operations) and the constant was never touched. It now
names a surface twice the size of the one it was minted for. `verify-package-artifacts.mjs` asserts
the constant *equals* `"2026-05-28"`, so the release pipeline actively prevents the bump and
nothing flags an operation added without one. The guardrail points the wrong way.

**Nobody serves the well-known manifest.** `probeExternalAdapterEndpoint` fetches it once, at
private-connector creation, as a *reachability* check: it parses the body and reads one field,
discarding `protocolVersion`, `capabilities`, and `categories`. The field it reads is `key`, while
the SDK interface serves `providerKey`, so the check passes vacuously. The re-registration path does
not probe at all, and dispatch-namespace workers are never probed. On the other side, the reference
connector does not serve the path — it *pushes* a manifest to
`PUT /connect/v1/connector-providers/:key/manifest` at deploy time. Both ends of this mechanism are
unimplemented, in opposite directions.

**There are two unrelated things called a manifest.** The served `ConnectorWorkerManifest` has no
validator and no consumer. The pushed `connectorManifestSchema` is the one that is validated,
stored, and gates registration — and its `capabilities` are nine coarse business values
(`catalog_read`, `booking_create`, `ticketing`, …), not the 22 operations. Only flights gates per
operation, from `metadata.flightCapabilities`, a field absent from the schema that rides through
free-form metadata. Every other vertical calls the endpoint and interprets failure, so a worker that
does not implement `/packages/quote` is indistinguishable from one that is down.

**The published protocol is not the real one.** It exists twice, hand-synced:

| Package | Repo | Published? | State |
| --- | --- | --- | --- |
| `@voyant-travel/connect-provider-sdk` | connect-sdk | yes | trails |
| `@repo/connect-connector-sdk` | voyant-cloud | no — `@repo/` cannot publish | ahead |

The private copy carries a **flights vertical of ten operations that has never been in the public
union**, and the reference connector — a flights connector — therefore hand-rolls its own operation
table, saying so in a comment and noting that the stays connector "did the same dance". The public
package is not the source of truth, and forking it is the established authoring path.

**There is no runtime enforcement of anything.** The SDK has no runtime dependencies and ships no
validation; payloads cross the boundary on bare `as` casts. The `operation` field in the envelope is
dead weight — connectors dispatch on the URL path and never read it. For dispatch-namespace workers
the confidentiality guarantee is topological (reachable only through `CONNECTOR_WORKERS`); for
external adapters the host HMAC-signs through the egress relay, but the public SDK gives a connector
author nothing to verify that signature with.

None of this argues against the protocol as the axis. It is the argument for it: the correct
mechanism is already designed and already positioned, and what is missing is that anything acts on
it.

## Decision

**This ADR proposes a mechanism; it does not describe a working one.** Decisions 1, 2 and 5 name
things that must be built. That is stated plainly so the document is not read as an account of
current behaviour.

### 1. The connector compatibility axis is the worker protocol version plus the declared operations

A third-party connector declares compatibility against **the connector worker protocol date**, and
declares *what it does* as a list of protocol operations. Nothing else is a compatibility axis for a
connector — not contracts package versions, not the framework version, not the image digest.

This is the exact analogue of the app answer: a date for the wire contract, a structured record for
the per-axis detail.

To make that true, three things follow:

- **One protocol, published.** The public `connect-provider-sdk` becomes the single source of truth
  and voyant-cloud consumes it, rather than the two copies drifting with the private one ahead. The
  missing flights vertical is folded into the public union.
- **A readable contract.** The operation table and envelope are published as an OpenAPI document
  with `info.version` equal to the protocol date, distributed the way voyant-cloud#1731 distributes
  `/v1/app/*`. A publisher cannot pin to something they cannot read.
- **A version rule with teeth.** Adding, removing, or changing the shape of an operation bumps the
  date. `verify-package-artifacts.mjs` stops asserting a frozen literal and instead asserts that the
  constant matches a checksum of the operation table — so the check fails when the surface moves
  without a bump, which is the failure that actually matters.

### 2. One manifest, served and read

The served `ConnectorWorkerManifest` and the pushed `connectorManifestSchema` are reconciled into
one declaration carrying both vocabularies: the business-level fields registration already
validates, plus `protocolVersion` and the operation list.

The natural gate already exists and already fetches and parses the document —
`probeExternalAdapterEndpoint` — and today reads one misspelled field. It should compare what the
connector declares against what the host supports, on both write paths, not only at creation.

### 3. Contracts packages are an authoring convenience, not a compatibility axis

`flights-contracts` and its siblings stay published — they are the `connectContractSurface` group in
`scripts/checks/manifests/public-surface.json`, they resolve from the public registry, and a
connector author wants them. But **their version is not a compatibility claim**, and no admission,
registration, or dispatch decision may be derived from it.

Precisely: a contracts package supplies payload **types**, which are erased, plus small runtime
helpers — the reference connector imports `FLIGHT_CAPABILITIES` and `requireCapability` as values
and would not build without them. What it does *not* supply is validation of anything crossing the
protocol boundary; no contract schema parses a request or response. The dependency is authoring
convenience with a thin runtime tail that a connector could reimplement in a dozen lines, not a
coupling that compatibility can be expressed through.

A connector built against the wrong contracts version produces a payload the *protocol* should
reject on the wire. That is the correct failure: at the boundary, with a diagnostic, on the request
that is wrong — not an unmet peer warning at install time on a machine Voyant does not operate.

### 4. In-process adapter registration is a first-party mechanism

`SourceAdapter`, `CruiseAdapter`, `registerCruiseAdapter`, `plugin-voyant-connect`,
`connect-adapter` and `connect-cruises` are internal composition — how Voyant wires *Connect itself*
into the operator as one source among others. They are not a third-party extension point, and
documentation must stop describing them as one.

Their peer ranges are therefore a release-hygiene concern with a first-party blast radius: pin
exactly and release in lockstep, or generate the range at release time from the supported window.
**No public pre-1.0 range policy is required**, because no external party inherits these ranges.

### 5. Incompatibility surfaces at connection registration

The gate is the manifest exchange when a connection is registered: Connect reads the declared
protocol date and operations, checks them against the supported window and against what the
requesting operator needs, and refuses or degrades **there**.

Not at install time — there is no install. Not per request — a connector that cannot serve an
operation should be known before an operator depends on it, and today that case is
indistinguishable from an outage. This is the connector's equivalent of marketplace admission,
which connectors do not have.

### 6. Long term, compatibility is demonstrated by conformance

`catalog-contracts` already ships runner-agnostic conformance suites — `src/indexer/conformance.ts`
(*"Exercise the portable adapter behavior without depending on a test runner"*),
`src/booking-engine/lifecycle-conformance.ts`. Extend the pattern to the worker protocol: a runner
that exercises a candidate connector's declared operations with published fixtures at the declared
date, so admission records a result rather than a self-assertion.

This is the expensive tail. It does not block decisions 1–5 and should not be sequenced ahead of
them.

## Consequences

- **#4062 is answered**: a connector declares against the protocol date and its declared operations,
  not against contracts packages, not against the framework version, not against the image digest.
- **The pre-1.0 caret problem is dissolved rather than solved.** connect#107's per-package
  correction was already stale on merge — `^0.112.2` against `catalog-contracts` 0.117.1 — and a
  policy to keep such ranges fresh is unnecessary once they are first-party wiring.
- **The protocol date must move, and moving it is currently blocked by a test.** Bumping it is the
  first change this ADR requires, and `verify-package-artifacts.mjs` must be inverted in the same
  change.
- **The public SDK gains a vertical.** Folding the ten flight operations into the published union is
  a prerequisite for calling it the axis, and removes the fork-the-protocol authoring path the
  reference connector documents.
- **`docs/architecture/cruise-adapter-contract.md` is amended alongside this ADR.** It was addressed
  to *"developers implementing an external adapter package"* and instructed them to
  `registerCruiseAdapter(...)` at application startup — unreachable for a third party under the
  image model, and in fact the only registrations in the tree come from
  `packages/cruises/src/catalog-runtime-extension.ts`.
- **#3340's versioning section** should be read against this and the app-side record rather than the
  other way round. Its slot/sandbox design is unaffected.
- **connect#106 remains open and is upstream of the payload work**, not of this decision. What each
  vertical's contract must *contain* still needs answering; the axis does not depend on it.
- **Release hygiene debt is now explicit**: connect#107's manifests need a version bump and a
  release, and npm currently serves un-failable ranges for `connect-adapter` and
  `plugin-voyant-connect`. That is maintenance, not compatibility design.

## What this ADR does not decide

- The contents of each vertical's contract (connect#106).
- Whether contracts packages remain in the published allowlist long term (#4059) — this ADR removes
  *compatibility* as a reason to keep them published; authoring convenience remains one.
- Authentication of the connector boundary. Today it is topological for dispatch-namespace workers
  and host-signed for external adapters, with no verification helper offered to connector authors.
  That gap is real but is a security decision, not a compatibility one.
- The conformance runner's hosting, fixtures, or admission workflow.
