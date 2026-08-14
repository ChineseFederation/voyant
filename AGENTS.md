# Voyant Agent Guide

This is the short operating guide for automated agents and contributors working
in this repository. Prefer the existing package patterns over new abstractions,
and promote repeated review feedback into scripts or docs.

## Repository Shape

- `packages/*` contain reusable schemas, services, routes, contracts, UI
  registries, React hooks, adapters, and runtime libraries.
- Vendor integrations are adapters (`packages/<vendor>-adapter`), not plugins —
  "plugin" is retired as a classification.
- `apps/*` own runtime wiring, auth, deployment shape, and application UI.
- `examples/*` are consumer-facing reference apps.
- `docs/adr/` contains decisions. `docs/architecture/` contains active design
  rules. `UBIQUITOUS_LANGUAGE.md` contains canonical domain terms.

## Architecture Rules To Read First

- Tenant model: `docs/adr/0001-tenant-scoping.md`
- Package and schema boundaries: `docs/architecture/schema-discipline.md`
- API route conventions: `docs/architecture/api-route-authoring.md`
- Module/provider/adapter/plugin vocabulary:
  `docs/architecture/module-provider-plugin-taxonomy.md`
- External systems as sources of truth:
  `docs/architecture/federated-operating-mode.md`
- Deployment targets (Node-first for the operator; Workers for storefronts/
  federated): `docs/architecture/deployment-targets.md`
- Unified package manifests and deployment authority:
  `docs/architecture/unified-deployment-graph.md`
- Public package surface rules: `docs/frontend-package-strategy.md`

Update the relevant doc when changing an architectural rule. Add or update a
checker when a rule is mechanical enough to enforce.

- Module boundaries and what the package split is for:
  `docs/adr/0016-modules-as-components-of-one-deployable.md`
- Which storefront key kind may reach a public route (and why origin binding is
  not the boundary): `docs/architecture/storefront-key-capability-line.md`

## Architecture Checkers

`verify:architecture` runs a chain of checks. Nine are declarative and take new
rules as data rather than code:

| Check | Enforces | Where rules live |
|---|---|---|
| `verify:boundary` | browser packages must not reach Drizzle or Hono through value imports | `.dependency-cruiser.cjs` |
| `verify:graph-conformance` | what a package contributes to the resolved graph, and that every graph action id is qualified by its own package | `scripts/checks/graph/graph-conformance.json` |
| `verify:symbol-policy` | where a symbol may and may not appear | `scripts/checks/symbols/symbol-policy.json` |
| `verify:retired-surfaces` | deleted paths stay deleted | `scripts/checks/regression/retired-paths.json` |
| `verify:public-surface` | what may be published, who outside this repo depends on it, and what a withdrawn package's successor is | `scripts/checks/manifests/public-surface.json` |
| `verify:supply-chain` | no tracked lockfile resolves a known-compromised release | `scripts/checks/supply-chain/compromised-packages.json` |
| `verify:route-conformance` | a mounted route array matches the doc that describes it | `scripts/checks/routes/route-sets.json` |
| `verify:openapi-drift` | a generated OpenAPI document matches the routes it came from | `scripts/checks/openapi/generated-specs.json` |
| `verify:openapi-key-kind` | every public route states which storefront key kind may call it, and every published operation is stamped with it | `scripts/checks/openapi/secret-only-public-bundles.json` |

`verify:symbol-policy` takes rules in two polarities. `absentFrom` is
default-allow — it names the files a symbol may not appear in, and every new
file is permitted until someone remembers to add it. `onlyIn` is default-deny —
it names the only paths (globs allowed) that may reference the symbol, so a new
file anywhere else fails on its own. An authority wants `onlyIn`: it is the
difference between guarding the meaning and guarding a list of filenames.

Three run as ratchets, holding a line rather than demanding it be clean today:
`verify:table-privacy` (cross-module table reach-ins),
`verify:package-descriptions`, and `verify:typecheck-coverage`. **Their
baselines may only shrink.** Regenerate one only when tightening it; never to
make a failure go away.

`verify:table-privacy` carries **184 reach-ins across 35 module pairs**, of which
**38 are cross-module WRITES**, counted separately in the baseline's `writePairs`.

**The goal is not zero, and it is not decoupling.** ADR-0016 made modules
components of one deployable, so "so they can ship separately" is not a reason
for anything. Cross-package FKs are settled separately and are fine when
`requiresSchemas`-backed. What is left is one question, asked per site:

> **Does the owning module do something on its own writes that this bypasses?**

**Every pair has now been read, and none of them clear it.** The per-pair verdict
and its evidence live in `writeNotes` in the baseline file, next to the counts:

- **inventory->commerce (16)** and **inventory->operations (4)** — all in
  `inventory/src/authoring`, all writing into a product scope they just created.
  `demoteOtherDefaultRules` is a no-op in a fresh scope, so the single-default
  invariant cannot be broken by a pre-existing row.
- **finance->bookings (12)**, **commerce->bookings (2)**, **commerce->finance
  (2)** — the same statements the owner runs itself, with no validation, event
  or hook around them.
- **apps->custom-fields (2)** — lifecycle transitions on definitions the app
  already owns; custom-fields has no lifecycle method or gate at all.

So the number is not a backlog and should not be driven down. Converting any of
these buys a hop and nothing else, which is the ADR-0007 indirection ADR-0016
rejected. Re-examine a pair when its **owner grows a gate** — not when the count
moves.

Reads follow the same test and mostly fail it too: a cross-module read is
type-safe, and `tsc` finds every caller on a rename. A `*Ref` mirror earns its
place when it documents a genuinely narrow view, not as a target to hit 184
times.

**The ratchet's job is drift, not cleanup.** No new pair, no new write. That is
cheap and it holds the line; the number falling is a side effect of someone
fixing a real gate, not a goal in itself.

`verify:typecheck-coverage` enforces that every test file is typechecked by some
CI job. A package whose tsconfig includes only `src/**` gets no typecheck job at
all — `build` still checks its `src`, but nothing checks its tests, so a fixture
may drift from the type it claims to match and the test still passes. 56
packages carry 844 such test files today ([#4244](https://github.com/voyant-travel/voyant/issues/4244));
the baseline is on **membership**, so a listed package may still gain tests but
an unlisted one may never start. Fix a package with the tsconfig split from
[#4243](https://github.com/voyant-travel/voyant/pull/4243):

- `tsconfig.json` — shared/editor project, `include: ["src/**/*", "tests/**/*"]`,
  **no** `outDir`/`rootDir`
- `tsconfig.build.json` — stands alone, re-declares the emit geometry and
  `include: ["src/**/*"]` so tests never reach `dist`
- `tsconfig.typecheck.json` — unchanged; inherits the wider include

Widening `tsconfig.typecheck.json` directly instead produces `TS6059` wherever a
test imports a sibling package by relative path, because `rootDir: "src"` is
inherited. Moving the emit geometry out of the shared project is what resolves
it.

### Migration identity lives where the source-free consumer reads it

There are two paths that resolve migration sources, and they do not read the same
things:

| | reads |
|---|---|
| dev + CI | the resolved graph → `buildMigrationPlan` → `node-migration-runner`, which adds `legacyNames` **after** loading the source |
| **managed image** | `loadModuleBundleSource(packageName)` alone — package name in, `migrations/` folder out. No graph, no plan, nothing to add anything |

So a fact the second path cannot see is a fact production does not have.
[#4330](https://github.com/voyant-travel/voyant/issues/4330): absorbing
`availability` into `operations` declared the retired ledger source on the **graph
migration facet**, which is exactly the place the managed runtime never reads. Path
A honoured it, every test passed, and two managed databases failed on upgrade
because the moved migrations had no ledger identity there. It looked configured and
did nothing.

Declare it in `package.json#voyant.legacyMigrationSources`, which ships in the
tarball and is what `loadModuleBundleSource` reads.
`verify:migration-identity` holds all three halves: nothing may declare identity on
a graph facet, everything declared must come back from a source-free load, and it
must survive this repo's own plan build.

**The verification lesson generalises.** The original check hand-constructed the
migration source with `legacyNames` already set. That proves the collector honours
the field and proves nothing about how it gets there — a green from a path
production does not take. When a change crosses a package or artifact boundary,
drive the real path end to end and inspect the artifact; never set the input by
hand and never assert against a generator this repo does not own (the migration
plan on disk comes from `@voyant-travel/cli`, pinned).

### A checker that is not in the chain is not a checker

`verify:architecture` is a hand-maintained `&&` string, so adding a check means
writing its `verify:` entry **and** remembering to append it. Membership is a
substring of a shell command, which means nothing can see it — a checker can
have an entry, pass locally, and never run.

Nine of the forty-six authority checkers were in that state, and **five of the
nine were already failing**: unenforced long enough to rot against a tree that
had legitimately moved on. One pinned a "workflow facet" after workflows were
removed; another expected `13 starter src files` after `starters/` became
`apps/operator`.

`verify:chain-reachability` runs first in the chain and fails if any
`scripts/check-*authority*.mjs` is unreachable from it. Reachability is
transitive over `pnpm <script>` references, because a checker invoked by an
aggregate that is itself chained does run — and because the inverse trap is
real: a checker reachable through *two* references looks removable after
deleting one ([#4320](https://github.com/voyant-travel/voyant/pull/4320)).

If a checker genuinely runs elsewhere, record it in
`scripts/checks/chain/runs-elsewhere.json` with a reason. That allowlist is
itself checked: an entry for a checker that is chained, or that no longer
exists, fails — otherwise an exemption outlives its reason and quietly makes
the checker optional again.

### A checker reads the tracked tree, not the working directory

A checker that walks the filesystem from the repository root sees whatever is on
disk: a git worktree parked in the root, a leftover directory from a deleted
package, a stale `.tsbuildinfo`. None of that is this tree's source and none of
it exists in CI's checkout.

It fails in both directions, and the second is the one that hurts:

- **false red** — fails locally on content CI never sees, which teaches everyone
  to dismiss the checker, including when it is right
- **false green** — resolves *another* checkout's files and validates those,
  reporting success while this tree is broken

The false green is not hypothetical. `verify:retail-spine-closure` printed
"Verified retail spine package closure" against `worktrees/<branch>/packages/*`
while this tree carried a forbidden edge, and only CI caught it
([#4281](https://github.com/voyant-travel/voyant/pull/4281)).

Use `trackedFilesIn(root)` from `scripts/lib/tracked-files.mjs`. It returns the
git listing when `root` is the repository toplevel and **null** otherwise, so a
checker driven over a `--root <fixture>` tree keeps walking — a fixture is not a
repository, and silently finding nothing there would turn its own vacuity tests
green while checking nothing.

`verify:tracked-tree-scan` holds the line: it plants an untracked worktree in the
repo root and asserts each converted checker ignores it, paired with an assertion
that one still goes red on a tracked violation. Only the pair means anything — a
checker that ignored everything would pass the first half.

### Converting an authority script you are already editing

The per-module `scripts/check-*authority*.mjs` scripts assert architecture by
matching **substrings of source text** — `manifest.includes("requirePort(x)")`.
That breaks on reformatting and passes when a module is subtly wrong, which is
why a feature change sometimes has to edit a checker to proceed.

**If one of them fights you, convert those assertions instead of patching the
substring.** You already have the context loaded; converting cold costs far more.

- a fact about the graph — ports, capabilities, `requiresSchemas`, the runtime
  contributor export — becomes an entry in `graph-conformance.json`
- a rule about where a symbol may appear becomes an entry in `symbol-policy.json`
- an assertion that a deleted file stays deleted becomes a path in
  `retired-paths.json`

Some assertions are none of these — they pin a call shape or a signature inside a
factory. Leave those alone rather than forcing a fit, and say so in the PR.

There is deliberately **no campaign** to convert the rest, because converting
cold costs far more than converting while you already have the module loaded.
See [#3898](https://github.com/voyant-travel/voyant/issues/3898).

**Do not read that as a shrink plan.** It is not one, and measuring it says so.
Between ADR-0016 (2026-07-30) and 2026-08-05 the corpus went 47 scripts / 5,578
lines / 38 using `.includes()` → **47 / 5,522 / 38**: not one script retired,
while `verify:architecture` grew from 62 chain links to 80. Opportunistic
conversion is real but it does not keep pace with new checks, so the imperative
corpus is flat and the chain is growing.

What actually holds the line is the **new-check rule** below, not attrition.

### A new architecture check is declarative by default

Add a rule to an existing rule file, or add a new rule file. Reach for a new
`scripts/check-*.mjs` only when the rule cannot be expressed as data — it pins a
call shape, a signature inside a factory, or needs a TypeScript program — and
**say which in the PR description**.

This is the half of the problem that is moving. A declarative rule costs one
line to extend and cannot rot into substring matching; an imperative script is a
permanent line item in a 80-link chain.

## Local Verification Lanes

Use the smallest lane that matches the risk of the change:

- Fast local feedback: `pnpm verify:fast`
- Full repository confidence: `pnpm verify:full`
- Package-scoped iteration: `pnpm --filter <package> typecheck`,
  `pnpm --filter <package> test`, or `pnpm --filter <package> lint`

The fast lane runs changed-file linting plus Turbo affected typecheck/test and
architecture checks. The full lane is intended for CI, release prep, and broad
cross-package changes.

### Reading a build result correctly

Two traps have each cost real rework here, and both make a FAILED build look
green:

- **`$?` after a pipe is the last command's.** `pnpm -F pkg build | tail -3;
  echo $?` reports `tail`'s status, not the build's. A package that failed to
  compile reads as exit 0. Write the output to a file and capture the status
  from the build itself:
  `npx tsc -p tsconfig.build.json > out.txt 2>&1; echo "exit=$?"`.
- **Never leave a build running while you switch branches.** A tsc run reads
  sibling packages' `dist` as it goes, so a checkout underneath it produces
  errors belonging to no coherent tree — `TS18046 'x' is of type 'unknown'` on
  files nobody touched is the usual shape. Both the failure and a later "clean"
  result from the same run are meaningless. Finish, then switch.

`tsc` is silent on success, so the honest check is an explicit exit code plus
`grep -c "error TS"` — not the absence of output, and not the summary line.

## Internal Dev Agent

AFK agent queue, remote sandbox, browser evidence, and code-execution tooling
lives outside this repository in `../internal-dev-agent`. Keep this repository
focused on product code, architecture docs, and quality checkers.

## Common Commands

- Install dependencies: `pnpm install`
- Build everything: `pnpm build`
- Typecheck everything: `pnpm typecheck`
- Test everything: `pnpm test`
- Lint everything: `pnpm lint`
- Check package exports: `pnpm verify:package-exports`
- Regenerate schema docs: `pnpm generate:schema-docs`

## Guardrails

- Do not add in-process tenant scoping to `packages/*`; tenancy is enforced at
  deployment boundaries.
- New package routes should use `parseJsonBody(...)` and `parseQuery(...)`
  instead of raw `c.req.json()` or manual `searchParams` parsing.
- A new `/v1/public/*` route is reachable only with a SECRET storefront key
  until its API bundle declares `publishable` (or `guardedIntake`, for routes
  that capture person data with nothing challenging the submitter). Silence is a
  denial, not an omission — `/v1/public/*` names the audience, not the trust
  level.
- Cross-package schema associations should go through link definitions unless
  documented as a narrow vertical-extension exception.
- Keep routes thin. Routes validate input, resolve runtime services, call domain
  services/workflows, and serialize responses.
- Avoid exposing internal helpers as public exports unless they are intended as
  supported package API.
- Never use the agent or model name (e.g. Codex, Claude, GPT) as authorship or
  attribution in version-control metadata: branch names, commit subjects or
  bodies, PR/issue titles or descriptions, `Co-authored-by` trailers, or
  generated-with footers. Keep commits attributed to the human author only.
  This restricts VCS metadata only — it does not restrict the content of
  tracked files, such as this guide naming the prohibited models or the
  `CLAUDE.md` importer file.
