# ADR-0023: Generated API clients are typed from the resolved graph, and the PK/SK line is a compile error

- **Status:** Proposed (2026-08-17).
- **Relates to:** [#4256](https://github.com/voyant-travel/voyant/issues/4256) (generate the
  clients from the specs — the question this answers),
  [#4626](https://github.com/voyant-travel/voyant/issues/4626) (split the clients by API surface),
  [#4625](https://github.com/voyant-travel/voyant/issues/4625) (the PK/SK capability line),
  [#4250](https://github.com/voyant-travel/voyant/issues/4250) (the 3,658 lines of hand-rolled
  fetch plumbing this replaces),
  [ADR-0016](./0016-modules-as-components-of-one-deployable.md) (the image is one deployable)

## Context

#4256 proposed generating the admin and public API clients from the 82 tracked OpenAPI documents,
and left four decisions open: the toolchain, the input, whether generated code is committed, and
whether the clients are published. #4626 added a fifth and more consequential requirement — that a
client constructed with a publishable key must not *expose* secret-only operations, so the
capability line is a compile error rather than a docs warning.

Getting the input wrong is the expensive mistake. Generating 60 admin documents into a flat client
that then has to be re-cut is precisely what #4256 warned about, so each decision below is recorded
with the measurement or the code that settles it.

## Decision 1 — the input is the resolved graph plus the per-package documents, never the documents alone

**The checked-in per-package documents do not carry the capability line, and cannot.**

`x-voyant-key-kind` is stamped by `buildSelectedGraphOpenApiDocuments`
(`packages/framework/src/selected-graph-openapi.ts`) at composition time, from the `publishable` /
`guardedIntake` declarations on each API bundle in the resolved deployment graph. It is absent from
every tracked document — measured, not assumed: zero of the 82 contain the extension.

Stamping it into them was tried and reverted, and the reason is recorded in
`scripts/check-openapi-key-kind-authority.mjs`: the tracked documents are produced *without* a
graph, so writing a graph-derived fact into them broke `verify:openapi-drift` and the generators on
a clean checkout. That constraint has not changed.

So the generator reads the tracked document for the *shape* of each operation and the resolved
graph for *who may call it*. Concretely it reuses `keyKindForPath` from
`scripts/lib/openapi-key-kind.mjs`, which already states the rule this ADR must not break:

> One module derives the answer; the generator writes it and the checker re-derives and compares.
> Two implementations of "which key may call this" would be exactly the drift the capability line
> exists to prevent, so there is deliberately only one.

A second derivation inside the client generator would be a third. There is one, and the generator
imports it.

**Rejected:** booting the operator app to emit composed documents. It produces the same answer for
strictly more machinery — the composition needs a live `runtime` and `app` — and it would make
client generation depend on the application booting, which nothing else in the generation path
does.

## Decision 2 — `openapi-typescript` for types, `openapi-fetch` for the runtime

Measured against the four largest documents, at `strict` with `noUncheckedIndexedAccess` and
**`skipLibCheck: false`**:

| document | input | generated `.d.ts` | generation |
|---|---|---|---|
| `operations/admin/operations.json` (153 paths) | 1,384 KiB | 647 KiB | 2s |
| `finance/admin/finance.json` (102 paths) | 1,303 KiB | 530 KiB | 1s |
| `public-api/public-api/public-api.json` | 1,153 KiB | 342 KiB | 1s |
| `catalog/admin/catalog-booking.json` | 1,031 KiB | 270 KiB | 1s |

All four together — 1.8 MiB of generated types — typecheck in **1.6s at 332 MB RSS** with zero
errors. Output is consistently *smaller* than input, which matters because our documents are
unusually hostile to generators: `operations.json` has **153 paths, zero `$ref`s and zero
`components.schemas`** — everything is inlined, 1,052 inline object schemas of which 359 are
distinct. A generator that keys its output off `components.schemas` would emit almost nothing
reusable. `openapi-typescript` emits a `paths` interface regardless, so the inlining costs
readability, not correctness.

`openapi-fetch` is ~2 KB with no generated class hierarchy, so it tree-shakes and runs on Workers —
required, because storefronts deploy there.

**The known risk, recorded rather than discovered later:** `openapi-typescript` builds on the
TypeScript compiler API, and **TypeScript 7 removes `ts.factory`**, which breaks it outright
(`TypeError: Cannot read properties of undefined (reading 'createKeywordTypeNode')` on
`openapi-typescript@7.13.0` under `typescript@7.0.2`).

The repository is on `typescript@^6.0.3`, which is **verified working** — same 342 KiB output for
the public document as under 5.9. So this is a future-facing risk on a TS 7 adoption, not a present
one, and it is contained either way: the tool is a *build-time* dependency, and what ships is plain
`.d.ts` plus `openapi-fetch`. A break would block regeneration, not consumers — which is the
strongest argument for Decision 3.

**Rejected:** `@hey-api/openapi-ts` and `orval` generate a client surface (classes, hooks) rather
than types over a thin fetch, which is a larger artifact and a second opinion about ergonomics we
do not need. `kubb` is a plugin pipeline whose flexibility buys nothing here.

## Decision 3 — generated output is committed

Because the generator is coupled to a compiler API that just broke across a major version, a tree
that cannot regenerate must still build, typecheck and publish. Committing also keeps the diff
reviewable — the same property that made the `verify:openapi-drift` regenerate-and-compare check
possible — and keeps installs free of a build-order dependency across 60 documents.

Every generated client is registered in `scripts/checks/openapi/generated-specs.json`, so drift is
caught by the mechanism that already exists rather than a new one.

## Decision 4 — the capability line is enforced in the types

`PublishablePaths = Pick<paths, PublishablePath>`, where `PublishablePath` is the union the
generator derives from the graph. A client constructed with a publishable key is typed on that
subset; a secret client is typed on `paths`.

Verified end to end against the real public document — the allowed calls compile, and the violation
does not:

```
error TS2345: Argument of type '"/v1/public/leads"' is not assignable to parameter of type
'PathsWithMethod<PublishablePaths, "post">'.
```

The secret-only operation does not merely reject at runtime: **it does not exist on the type**,
which is what #4626 §3 asked for. Note the direction — `/v1/public/leads` is `guardedIntake`, so it
is *secret*-only despite being public-surfaced. Silence is a denial: an unclassified bundle is
secret-only, which is the correct fail-closed default.

## Deferred, deliberately

**Whether the clients are published.** Both `@voyant-travel/public-api-client` and
`@voyant-travel/public-api-react` are `private: true` today, and the public npm surface is
deliberately closed. Publishing reopens that question and interacts with `verify:public-surface`;
it is a product decision, not a generation one, and nothing above depends on the answer. The
generated clients work as workspace packages either way.

**Versioning.** Same reason — it only becomes answerable once the publish question is.

**The 24 documents with no generator.** #4256 P0 is still worth doing for drift protection, but it
is not a precondition here: the generator reads whatever a document says, generated or hand-written.
A hand-written document that has drifted from its routes produces a client that has drifted the
same way, which is an argument for P0, not a blocker for this.

## Consequences

- One derivation of the capability line, shared by the runtime middleware, the authority checker and
  the client generator.
- The generator depends on a resolved graph (`apps/operator/.voyant/deployment-graph.generated.json`),
  which `prepare:verify` produces and a clean checkout lacks — the same precondition
  `verify:openapi-key-kind` already carries.
- An operation moving between `publishable` and `guardedIntake` becomes a **breaking type change**
  in the client, which is the correct signal and was previously invisible.
