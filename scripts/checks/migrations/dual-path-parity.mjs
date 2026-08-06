/**
 * Migration identity must be visible to the consumer that actually applies it.
 *
 * There are two resolution paths and they do not read the same things:
 *
 *   A  dev + CI      resolve the graph -> buildMigrationPlan -> node-migration-runner,
 *                    which bolts `legacyNames` onto the source AFTER loading it
 *   B  managed image source-free: `loadModuleBundleSource(packageName)` resolves a
 *                    package by NAME and reads its own `migrations/` folder. There
 *                    is no graph and no plan, so nothing bolts anything on.
 *
 * voyant#4330: `legacySources` was declared on the graph migration facet — the one
 * place path B cannot see. Path A honoured it, every test passed, and two managed
 * databases failed on upgrade because the absorbed `availability` tags had no
 * ledger identity there. The declaration looked configured and did nothing.
 *
 * voyant#4331 moved it to `package.json#voyant.legacyMigrationSources`, which
 * path B reads and which ships in the tarball. These assertions keep it there.
 *
 * SCOPE. Only what this repository controls is asserted. The generated
 * `migration-plan.generated.json` is emitted by `@voyant-travel/cli`, an external
 * package pinned at a version that predates the field, so the artifact on disk
 * legitimately lacks it until that pin moves. Asserting against the artifact would
 * fail CI for something no change here can fix; the resolver's own behaviour is
 * asserted instead.
 */

/** Absorbed source names declared where the source-free consumer can read them. */
export function declaredInManifests(manifests) {
  const declared = new Map()
  for (const [packageName, manifest] of manifests) {
    const names = manifest?.voyant?.legacyMigrationSources ?? []
    if (names.length > 0) declared.set(packageName, [...names])
  }
  return declared
}

/**
 * The #4330 trap, guarded directly: identity declared on a graph migration facet
 * is invisible to the managed runtime, and looks configured while doing nothing.
 */
export function checkNoGraphFacetIdentity(units) {
  const violations = []
  for (const unit of units) {
    for (const facet of unit.migrations ?? []) {
      if (!facet.legacySources?.length) continue
      violations.push(
        `${unit.packageName ?? unit.id} declares legacySources on its graph migration facet ` +
          `(${facet.id}). The managed runtime resolves migrations by package name and never reads ` +
          `the graph, so this is invisible to it and a deployment carrying the retired identities ` +
          `will re-run the moved migrations. Declare them in package.json#voyant.` +
          `legacyMigrationSources instead — see voyant#4330.`,
      )
    }
  }
  return violations
}

/** Everything declared must come back from a source-free load. */
export function checkSourceFreeVisibility(declared, observable) {
  const violations = []
  for (const [packageName, names] of declared) {
    const visible = new Set(observable.get(packageName) ?? [])
    const missing = names.filter((name) => !visible.has(name))
    if (missing.length > 0) {
      violations.push(
        `${packageName} declares legacyMigrationSources ${missing.join(", ")}, but a source-free ` +
          `load does not return them. That load is what the managed image performs.`,
      )
    }
  }
  return violations
}

/** …and must also survive this repo's own plan build, which path A consumes. */
export function checkPlanCarriesIdentity(declared, inPlan) {
  const violations = []
  for (const [packageName, names] of declared) {
    const planned = new Set(inPlan.get(packageName) ?? [])
    const missing = names.filter((name) => !planned.has(name))
    if (missing.length > 0) {
      violations.push(
        `${packageName} declares legacyMigrationSources ${missing.join(", ")}, but buildMigrationPlan ` +
          `does not carry them into the plan. Path A applies migrations from that plan, so a ` +
          `developer or self-hoster migrating an existing database would re-run the moved ones.`,
      )
    }
  }
  return violations
}
