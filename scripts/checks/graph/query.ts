/**
 * Pure queries over a resolved deployment graph.
 *
 * Deliberately separate from load.ts: importing a query must not drag in the
 * resolver, which pulls @voyant-travel/framework and the whole authored project.
 * Keeping this module dependency-light is what lets the conformance tests inject
 * a synthetic graph instead of resolving the real one.
 */

/** Structural shape these queries need; the resolved graph satisfies it. */
export interface GraphLike {
  modules: readonly any[]
  extensions: readonly any[]
  plugins: readonly any[]
  adapters: readonly any[]
  providers: readonly any[]
  packageRecords: readonly any[]
}

/** Every selected unit, across modules/extensions/plugins/adapters/providers. */
export function allUnits(graph: GraphLike) {
  return [
    ...graph.modules,
    ...graph.extensions,
    ...graph.plugins,
    ...graph.adapters,
    ...graph.providers,
  ]
}

/** The selected unit contributed by a package, by canonical package name. */
export function unitForPackage(graph: GraphLike, packageName: string) {
  return allUnits(graph).find((unit) => unit.packageName === packageName)
}

/** The `voyant.package.v1` record a package published into the graph. */
export function packageRecord(graph: GraphLike, packageName: string) {
  return graph.packageRecords.find((record) => record.packageName === packageName)
}

/** Capability tokens a package requires, per its selected unit. */
export function requiredCapabilities(graph: GraphLike, packageName: string): readonly string[] {
  return unitForPackage(graph, packageName)?.requires?.capabilities ?? []
}

/** Runtime port ids a package declares, per its selected unit. */
export function declaredPortIds(graph: GraphLike, packageName: string): string[] {
  const unit = unitForPackage(graph, packageName)
  const ports = [...(unit?.provides?.ports ?? []), ...(unit?.runtimePorts ?? [])]
  return ports.map((port) => (typeof port === "string" ? port : port.id)).filter(Boolean)
}
