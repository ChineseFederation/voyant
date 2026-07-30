/**
 * Boundary rules for the Voyant package graph.
 *
 * See docs/adr/0016-modules-as-components-of-one-deployable.md. The rules here
 * encode the boundary the codebase already maintains rather than a new one; the
 * baseline is zero violations, so they run strict with no ratchet.
 *
 * Run via `pnpm verify:boundary`, which cruises one package at a time —
 * a single whole-graph reachability pass exhausts the heap.
 */

/**
 * Server-only runtime. Reaching either of these from browser-bound code means the
 * bundle carries the ORM or the HTTP kernel.
 *
 * Deliberately NOT `packages/db`: parts of it are dependency-light by design.
 * `packages/db/src/helpers.ts` imports Drizzle with `import type` only and its one
 * value export is re-exported from `@voyant-travel/schema-kit` — "pure, below the
 * data layer", per its own comment. Naming the package would forbid a legitimate
 * entry point; naming the runtime libraries lets the graph decide, which is the
 * property we actually care about.
 */
const SERVER_RUNTIME = String.raw`node_modules/(drizzle-orm|hono)/`

module.exports = {
  forbidden: [
    {
      name: "browser-no-server-runtime",
      severity: "error",
      comment:
        "A browser-bound package (*-react, ui) must not reach Drizzle, Hono, or the db " +
        "runtime through VALUE imports. Type-only imports are erased at compile time and " +
        "are excluded here via tsPreCompilationDeps:false, so importing a type from a " +
        "domain package is fine. Importing a value is not: take it from a dependency-light " +
        "entry point instead (e.g. `@voyant-travel/operations/validation`, not " +
        "`@voyant-travel/operations`).",
      from: { path: String.raw`^packages/([^/]+-react|ui)/src` },
      to: { path: SERVER_RUNTIME, reachable: true },
    },
    {
      name: "no-unresolvable",
      severity: "error",
      comment:
        "An import that does not resolve is invisible to every reachability rule above, " +
        "which then passes for the wrong reason. Keeping this rule on is what stops the " +
        "boundary checks going quietly vacuous when an exports map or resolver option " +
        "changes.",
      from: { path: String.raw`^packages/([^/]+-react|ui|[^/]+-contracts)/src` },
      to: { couldNotResolve: true },
    },
    {
      name: "contracts-no-runtime-sibling",
      severity: "error",
      comment:
        "ADR-0002: the dependency arrow points runtime -> contracts, never back. A " +
        "*-contracts package must stay dependency-light so external consumers can use the " +
        "schemas without the runtime.",
      from: { path: String.raw`^packages/([^/]+)-contracts/src` },
      to: { path: String.raw`^packages/$1/src` },
    },
    {
      name: "contracts-no-server-runtime",
      severity: "error",
      comment:
        "ADR-0002: a contracts package must not pull Drizzle, Hono, or the framework DB " +
        "into its own runtime. Type-only imports are excluded.",
      from: { path: String.raw`^packages/[^/]+-contracts/src` },
      to: { path: SERVER_RUNTIME, reachable: true },
    },
  ],
  options: {
    // Record the edge into third-party packages, but do not crawl their internals.
    // @voyant-travel/* resolve to workspace source and must be followed.
    doNotFollow: { path: String.raw`node_modules/(?!@voyant-travel)` },

    // THE load-bearing option. false => only dependencies that survive compilation,
    // i.e. `import type` edges are excluded. That is exactly the ADR's rule:
    // type imports are erased and cannot put anything in a bundle.
    tsPreCompilationDeps: false,

    exclude: { path: String.raw`\.(test|spec)\.tsx?$|/tests?/|/__tests__/|/dist/` },

    // Workspace `exports` maps point at TypeScript source in-repo (publishConfig
    // swaps them to dist on publish), so the resolver has to be told about .ts.
    // Without this every cross-package edge resolves to "unknown" and every
    // reachability rule silently passes.
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
      conditionNames: ["import", "require", "node", "default", "types"],
      exportsFields: ["exports"],
      mainFields: ["module", "main", "types"],
    },
  },
}
