/**
 * Declarative graph conformance — the replacement for source-text substring pins.
 *
 * The `*authority*` scripts assert facts about the deployment graph by matching
 * strings in source files: `manifest.includes("requirePort(flightsRuntimePort)")`,
 * `manifest.includes('requires: { capabilities: ["finance.payment-sessions"] }')`.
 * Those break when the code is reformatted and pass when it is subtly wrong,
 * because they check how a module is *written* rather than what it *contributes*.
 *
 * Expectations live in graph-conformance.json and are checked against the
 * resolved graph. Everything here is a pure function of a graph object, so the
 * unit tests inject a synthetic graph rather than resolving the real one.
 */
import {
  declaredActions,
  declaredPortIds,
  type GraphLike,
  packageRecord,
  requiredCapabilities,
  unitForPackage,
} from "./query.ts"

export interface PackageExpectation {
  /** Package names whose schema this package depends on (`voyant.requiresSchemas`). */
  requiresSchemas?: readonly string[]
  /** Capability tokens the selected unit must require. */
  requiredCapabilities?: readonly string[]
  /** Runtime port ids the selected unit must declare. */
  portIds?: readonly string[]
  /** Export name of the package-owned runtime contributor. */
  runtimeExport?: string
}

export type GraphConformanceSpec = Record<string, PackageExpectation>

/**
 * Repo-wide naming rule for graph action ids, rather than a per-package fact.
 *
 * This is an **authoring** convention, not a wire contract. `actionPolicy.id` is
 * an opaque lookup key and a consumer must not infer ownership from its shape
 * (voyant#4596) — a custom module from outside this repo is free to name its
 * actions anything, and this checker cannot reach it. What the rule buys is that
 * first-party manifests stop shipping two shapes for one field, which is what
 * invited the wrong inference in the first place.
 */
export interface ActionIdConvention {
  /** Ids exempt from the rule, each mapped to the reason it cannot move. */
  allow?: Readonly<Record<string, string>>
}

/**
 * Every declared action id must be qualified by the package that declares it,
 * as `<packageName>#…`. Returns a violation string per offending id.
 */
export function checkActionIdConvention(
  graph: GraphLike,
  convention: ActionIdConvention = {},
): string[] {
  const violations: string[] = []
  const actions = declaredActions(graph)
  const allowed = new Set(Object.keys(convention.allow ?? {}))

  for (const { packageName, id } of actions) {
    if (allowed.has(id) || id.startsWith(`${packageName}#`)) continue
    violations.push(
      `${packageName}: graph action id "${id}" must be qualified as "${packageName}#…"`,
    )
  }

  // An exemption that outlives its subject quietly makes the rule optional
  // again, so a stale allowlist entry is itself a violation.
  const declared = new Set(actions.map((action) => action.id))
  for (const id of allowed) {
    if (!declared.has(id)) {
      violations.push(`allowlisted action id "${id}" is no longer declared; remove the exemption`)
    }
  }

  return violations
}

function missing(expected: readonly string[], actual: readonly string[]): string[] {
  const have = new Set(actual)
  return expected.filter((value) => !have.has(value))
}

/**
 * Returns a violation string per unmet expectation. Empty means conformant.
 */
export function checkGraphConformance(graph: GraphLike, spec: GraphConformanceSpec): string[] {
  const violations: string[] = []

  for (const [packageName, expectation] of Object.entries(spec)) {
    const unit = unitForPackage(graph, packageName)
    if (!unit) {
      violations.push(`${packageName}: contributes no selected graph unit`)
      continue
    }

    if (expectation.requiredCapabilities) {
      const absent = missing(
        expectation.requiredCapabilities,
        requiredCapabilities(graph, packageName),
      )
      for (const capability of absent) {
        violations.push(`${packageName}: must require capability "${capability}"`)
      }
    }

    if (expectation.portIds) {
      const absent = missing(expectation.portIds, declaredPortIds(graph, packageName))
      for (const port of absent) {
        violations.push(`${packageName}: must declare runtime port "${port}"`)
      }
    }

    const record = packageRecord(graph, packageName) as
      | { metadata?: { requiresSchemas?: readonly string[]; runtime?: { export?: string } } }
      | undefined

    if (expectation.requiresSchemas) {
      const absent = missing(expectation.requiresSchemas, record?.metadata?.requiresSchemas ?? [])
      for (const dependency of absent) {
        violations.push(`${packageName}: must declare requiresSchemas entry "${dependency}"`)
      }
    }

    if (expectation.runtimeExport !== undefined) {
      const actual = record?.metadata?.runtime?.export
      if (actual !== expectation.runtimeExport) {
        violations.push(
          `${packageName}: runtime contributor export must be "${expectation.runtimeExport}", got ${
            actual === undefined ? "none" : `"${actual}"`
          }`,
        )
      }
    }
  }

  return violations
}
