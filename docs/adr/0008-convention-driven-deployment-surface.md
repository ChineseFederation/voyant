# ADR-0008: Convention-driven deployment surface — route metadata over hand-lists

- **Status:** Proposed (2026-06-22)
- **Relates to:** [ADR-0007](./0007-module-subsetting-and-capability-ports.md) (module subsetting / composition), [consolidated-deployments-rfc](../architecture/consolidated-deployments-rfc.md) (Workstream B), [api-route-ownership-and-composition](../architecture/api-route-ownership-and-composition.md), [api-route-authoring](../architecture/api-route-authoring.md), [auth-identity-architecture](../architecture/auth-identity-architecture.md)
- **Implemented by:** _(unstarted — this ADR is the design)_

## Context

A standard deployment's API wiring lives in two files —
`apps/operator/src/api/app.ts` (~208 lines) and `.../composition.ts`
(~294 lines). It is centralized and heavily justified (≈40% of `app.ts` is
comment), which is good. But the *shape* of what an operator author hand-maintains
is the problem, not the volume. Three things drive the "messy" feel, and two of
them are security-sensitive:

1. **`publicPaths` — 22 hand-listed entries**, each with an inline "why this is
   reachable without a session" comment. This is the **anonymous-access
   allowlist**: `requireAuth` skips auth entirely for a matching path and stamps
   `actor: "customer"` for `/v1/public/*` (`middleware/auth.ts:151-156`). It is
   *not* the same as the `/v1/public/*` surface — those routes still require a
   customer/partner/supplier session unless their path is also in this list.
   Forgetting an entry breaks a public route; adding a wrong one opens an
   unauthenticated hole. There is **no route-level declaration** behind it — it is
   a pure hand-list in deployment config.

2. **`dbTransactionalPaths` — 10 hand-listed prefixes** that must receive the
   per-request WebSocket Pool client (the only Workers-compatible client that can
   run `db.transaction()`). Miss one and a transactional handler silently runs on
   the non-transactional `neon-http` client. Unlike `publicPaths`, a metadata seam
   *already exists*: `Module.requiresTransactionalDb` and
   `Extension.requiresTransactionalDb` (`core/module.ts:132,155`), and `app.ts`
   already derives transactional module names from them and only *appends*
   `dbTransactionalPaths` for routes no module/extension owns —
   `additionalRoutes` and adapter-wired flows (`app.ts:438-444`). So this list is
   already a fallback; it just hasn't trended to empty.

3. **`composition.ts` boilerplate** — 13 lazy route-bundle loaders of the shape
   `() => import("./runtime/x").then((m) => …)`, an 8-entry `plugins` array in
   `app.ts` (with order-dependency comments like "booking-schedule before legal"),
   and subscriber bundles registered by hand. Custom modules are *already*
   discovered by convention (`import.meta.glob("../modules/*/index.ts")`,
   ADR-0007); the standard families are not, so they're enumerated by hand.

The unifying smell: **deployment intent that belongs on a route or module is
instead transcribed into imperative lists a human keeps in sync.** A webhook
receiver *knows* it's anonymous; a reserve handler *knows* it needs a transaction;
a route bundle *knows* its mount surface. Today that knowledge is re-stated in
`app.ts`/`composition.ts` and can drift from the code it describes.

The Node deployment still uses build-time bundling rather than production
filesystem discovery. That constraint shapes *how* discovery works
(`import.meta.glob` at build time and lazy loaders for boot weight), but it does
not require the *intent* to live in hand-maintained lists. Provider injection
(the ~39 closures in `buildOperatorProviders`) is a deliberate, sound decision
(no-assembly-kit) and is explicitly **out of scope** here; that complexity is
essential.

## Decision

Move deployment intent from hand-maintained lists onto the routes/modules that own
it; the framework assembles the lists. Three changes, ordered by leverage:

**1. Anonymous access is declared, not listed.** A module/extension declares which
of its public routes are reachable without a session — a metadata field rather
than a global path array. The framework assembles `publicPaths` from these
declarations at compose time.

```ts
// before — in the deployment's app.ts (excerpt of 22)
publicPaths: [
  "/v1/public/catalog",                          // storefront journey is auth-less
  "/v1/finance/providers/netopia/callback",      // processor POSTs without a session
  "/v1/public/customer-portal/contact-exists",
  // …19 more, each re-justified here
]

// after — declared where the route lives
export const catalogPublicRoutes: ApiModule = {
  module: { name: "catalog" },
  publicRoutes: catalogRoutes,
  anonymous: ["/quote", "/book", "/holds"],   // relative to the module's public mount
}
// the Netopia webhook declares `anonymous` on the plugin bundle that owns it.
// createApp assembles the global publicPaths from every declaration.
```

The deployment's `app.ts` no longer carries the allowlist; the security decision
sits next to the handler, reviewed in the same diff that adds the route. A
deployment may still pass an explicit `publicPaths` as an **override/escape
hatch**, but the standard surface needs none.

**2. Transaction need is fully metadata-driven; `dbTransactionalPaths` trends to
empty.** Push the remaining adapter-wired/`additionalRoutes` flows behind
`requiresTransactionalDb` on the module/extension that owns them (and, where a
family mixes transactional and non-transactional routes, a per-bundle flag). The
mechanism already exists and is already preferred (`app.ts:438`); this is
finishing the migration so `dbTransactionalPaths` is an escape hatch, ideally `[]`
in the standard deployment, not a 10-entry list.

**3. Standard route families + subscribers are convention-discovered.** Extend the
`import.meta.glob` discovery that already serves custom modules (ADR-0007) to the
standard route bundles and subscribers, so `composition.ts`'s 13 lazy loaders and
`app.ts`'s `plugins` array collapse into "drop a file in the conventional
directory." Build-time glob keeps this Workers-safe and cold-start-friendly (the
loaders stay lazy; only their *enumeration* becomes automatic).

The end state of `app.ts` is genuine configuration — db factories, auth handler,
observability — with the security-sensitive lists gone:

```ts
// after
export const app = createVoyantApp({
  providers: buildOperatorProviders(),
  db, dbTransactional,          // factories; no dbTransactionalPaths in the common case
  auth: { handler, resolve, hasPermission, validateApiKey },
  appName, reporter, outbox: true,
  // publicPaths: assembled from route declarations (override only if needed)
  // plugins / route families: discovered by convention
})
```

## Consequences

- **The security surface is reviewed where it's decided.** "This route is
  anonymous" / "this route transacts" lives on the route, so a PR that adds a
  public endpoint carries its own auth/transaction posture — a reviewer doesn't
  have to cross-check a list in another file. Drift between list and code becomes
  structurally impossible for the standard surface.
- **Smaller, less intimidating deployment files.** `app.ts` becomes config;
  `composition.ts` keeps the provider container (essential) but sheds the loader
  enumeration. The perceived mess drops without losing auditability — the
  declarations are greppable (`anonymous:` / `requiresTransactionalDb`).
- **A new failure mode to guard: silent under-declaration.** If anonymous access
  moves to per-route metadata, a route that *should* require auth but is mistakenly
  marked anonymous is now a local mistake rather than a centrally-reviewed list
  entry. Mitigation: a build-time report (extend `db doctor`) that prints the full
  assembled `publicPaths` so the total anonymous surface stays auditable in one
  place — derived, but still inspectable. This is the main risk and must ship with
  change 1, not after.
- **Convention requires discipline.** File-location-as-registration means a
  misplaced file silently doesn't mount (or mounts wrong). The existing
  `composeFromManifest` "fail loud on unregistered" check and `db doctor` parity
  extend to cover discovered families.
- **Provider injection is untouched.** The ~39 closures stay; this ADR does not
  pursue named-DI auto-wiring (see Alternatives). Scope is the *lists and
  enumeration*, not the injection model.

## Alternatives considered

- **Leave it as-is.** Rejected: the two hand-lists are a standing security-drift
  risk (anonymous allowlist, transactional-path list), and the boilerplate is a
  real onboarding tax. "Centralized and commented" mitigates but does not remove
  the drift hazard — the comment can lie when the code moves.
- **Full file-based routing (path = directory), replacing the module/route model.**
  Rejected for now: Voyant's routes are package-owned and provider-injected
  (ADR-0007, no-assembly-kit), not deployment-local files. A filesystem-route
  convention fits an app where the deployment *authors* its routes; here the
  deployment *composes* package routes. Declaring intent (anonymous / transactional)
  on the existing module/route metadata gets most of the DX win without discarding
  package ownership. Revisit if deployment-authored routes become common.
- **Named-DI container that auto-wires providers (drop the 39 closures).**
  Rejected/out-of-scope: explicit injection is a deliberate decision and the
  closures are type-checked seams, not boilerplate to magic away. Auto-wiring trades
  auditability for brevity in exactly the place we want auditability.
- **Keep `publicPaths` but generate it from a script.** Rejected: codegen re-creates
  the drift (the generated file lags the source) and adds a build step. Assembling
  at compose time from live declarations has no lag.

## Phasing

1. **Anonymous-access declaration + assembled `publicPaths` + `db doctor` report.**
   The highest-leverage, most security-sensitive change; ships with the
   auditability report so the total anonymous surface stays inspectable.
2. **Finish `requiresTransactionalDb` migration** so `dbTransactionalPaths` is empty
   in the operator (escape hatch only). Mostly moving existing adapter-wired flows
   behind module/extension flags.
3. **Convention-discover standard route families + subscribers** (extend the
   ADR-0007 `import.meta.glob` seam), collapsing the `composition.ts` loaders and
   `app.ts` `plugins` list.
