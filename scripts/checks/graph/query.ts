/**
 * Pure queries over a resolved deployment graph.
 *
 * Deliberately separate from load.ts: importing a query must not drag in the
 * resolver, which pulls @voyant-travel/framework and the whole authored project.
 * Keeping this module dependency-light is what lets the conformance tests inject
 * a synthetic graph instead of resolving the real one.
 */

/** Structural shape these queries need; the resolved graph satisfies it. */
interface GraphUnitLike {
  packageName?: string
  requires?: { capabilities?: readonly string[] }
  provides?: { ports?: readonly (string | { id?: string })[] }
  runtimePorts?: readonly (string | { id?: string })[]
  actions?: readonly { id?: string }[]
}

interface GraphPackageRecordLike {
  packageName?: string
}

export interface GraphLike {
  modules: readonly GraphUnitLike[]
  extensions: readonly GraphUnitLike[]
  plugins: readonly GraphUnitLike[]
  adapters: readonly GraphUnitLike[]
  providers: readonly GraphUnitLike[]
  packageRecords: readonly GraphPackageRecordLike[]
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

/** Every declared graph action, paired with the unit that declared it. */
export function declaredActions(graph: GraphLike): { packageName: string; id: string }[] {
  return allUnits(graph).flatMap((unit) =>
    (unit.actions ?? [])
      .map((action) => action?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => ({ packageName: unit.packageName ?? "(unnamed unit)", id })),
  )
}

/** Runtime port ids a package declares, per its selected unit. */
export function declaredPortIds(graph: GraphLike, packageName: string): string[] {
  const unit = unitForPackage(graph, packageName)
  const ports = [...(unit?.provides?.ports ?? []), ...(unit?.runtimePorts ?? [])]
  return [
    ...new Set(ports.map((port) => (typeof port === "string" ? port : port.id)).filter(Boolean)),
  ]
}
