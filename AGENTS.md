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

## Architecture Checkers

`verify:architecture` runs a chain of checks. Eight are declarative and take new
rules as data rather than code:

| Check | Enforces | Where rules live |
|---|---|---|
| `verify:boundary` | browser packages must not reach Drizzle or Hono through value imports | `.dependency-cruiser.cjs` |
| `verify:graph-conformance` | what a package contributes to the resolved graph | `scripts/checks/graph/graph-conformance.json` |
| `verify:symbol-policy` | where a symbol may and may not appear | `scripts/checks/symbols/symbol-policy.json` |
| `verify:retired-surfaces` | deleted paths stay deleted | `scripts/checks/regression/retired-paths.json` |
| `verify:public-surface` | what may be published, who outside this repo depends on it, and what a withdrawn package's successor is | `scripts/checks/manifests/public-surface.json` |
| `verify:supply-chain` | no tracked lockfile resolves a known-compromised release | `scripts/checks/supply-chain/compromised-packages.json` |
| `verify:route-conformance` | a mounted route array matches the doc that describes it | `scripts/checks/routes/route-sets.json` |
| `verify:openapi-drift` | a generated OpenAPI document matches the routes it came from | `scripts/checks/openapi/generated-specs.json` |

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

There is deliberately **no campaign** to convert the rest. The corpus shrinks as
a side effect of normal work, which is cheaper than a sweep and puts each
conversion in the hands of someone who knows what the module does. See
[#3898](https://github.com/voyant-travel/voyant/issues/3898).

## Local Verification Lanes

Use the smallest lane that matches the risk of the change:

- Fast local feedback: `pnpm verify:fast`
- Full repository confidence: `pnpm verify:full`
- Package-scoped iteration: `pnpm --filter <package> typecheck`,
  `pnpm --filter <package> test`, or `pnpm --filter <package> lint`

The fast lane runs changed-file linting plus Turbo affected typecheck/test and
architecture checks. The full lane is intended for CI, release prep, and broad
cross-package changes.

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
