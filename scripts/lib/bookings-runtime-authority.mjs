import { findProductionDependencyCycles } from "./node-runtime-adapter-dependency-policy.mjs"

export function simulateDirectMergeCycles(manifests, packageName, dependencyNames) {
  const edges = productionEdges(manifests)
  return dependencyNames.flatMap((dependencyName) => {
    const path = findPath(edges, dependencyName, packageName)
    return path ? [[packageName, ...path]] : []
  })
}

export function inspectBookingsRuntimeAuthority({ files, manifests, policy }) {
  const violations = []
  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]))
  const bookings = byName.get(policy.packageName)
  if (!bookings) return [`missing domain package ${policy.packageName}`]
  if (byName.has(policy.removedPackageName)) {
    violations.push(`${policy.removedPackageName} must remain deleted`)
  }

  const runtime = bookings.voyant?.runtime
  if (
    runtime?.entry !== "./runtime-contributor" ||
    runtime?.export !== policy.runtimeFactory ||
    !bookings.exports?.["./runtime-contributor"]
  ) {
    violations.push("Bookings must own its runtime contributor metadata and export")
  }
  for (const exportName of Object.keys(bookings.exports ?? {})) {
    if (/standard-node|bookings-node/.test(exportName)) {
      violations.push(`Bookings must not expose target-labelled runtime API ${exportName}`)
    }
  }
  for (const dependencyName of policy.forbiddenProductionDependencies) {
    if (
      bookings.dependencies?.[dependencyName] ||
      bookings.optionalDependencies?.[dependencyName]
    ) {
      violations.push(`Bookings must not depend on provider package ${dependencyName}`)
    }
  }
  for (const cycle of findProductionDependencyCycles(manifests)) {
    violations.push(`workspace production dependency cycle: ${cycle.join(" -> ")}`)
  }

  const contributor = files.get("packages/bookings/src/runtime-contributor.ts") ?? ""
  const runtimeSource = files.get("packages/bookings/src/runtime.ts") ?? ""
  const portSource = files.get("packages/bookings/src/runtime-port.ts") ?? ""
  const manifestSource = files.get("packages/bookings/src/voyant.ts") ?? ""
  const operatorHost = files.get("packages/runtime/src/deployment-resources.ts") ?? ""
  const coreHost = files.get("packages/core/src/runtime-host.ts") ?? ""

  for (const required of [
    "actionLedgerBookingDriftRuntimePort",
    "createBookingsRuntime",
    "createBookingRequirementsRuntime",
    "relationships.upsertPersonFromContact",
    "customFields.resolveRegistry",
    "accommodation.enrichOverviewItems",
    "inventory.resolveProductSnapshot",
  ]) {
    if (!(contributor + runtimeSource).includes(required)) {
      violations.push(`Bookings runtime authority is missing ${required}`)
    }
  }
  if (
    /modules\s*:\s*\{|modules\.import/.test(coreHost + operatorHost + contributor + runtimeSource)
  ) {
    violations.push("Runtime composition must not use a host module loader")
  }
  if (/new Map\s*\(|packageIds|packageIdRegistry/.test(contributor + runtimeSource + portSource)) {
    violations.push("Bookings runtime must not introduce a central package registry")
  }
  if (
    /from\s+["']@voyant-travel\/(?:accommodations|finance|inventory|relationships|commerce|distribution)(?:\/[^"']*)?["']/.test(
      runtimeSource,
    )
  ) {
    violations.push("Bookings runtime must consume provider ports instead of provider packages")
  }

  for (const { port, file } of policy.providers) {
    const provider = files.get(file) ?? ""
    if (!portSource.includes(`export const ${port}`)) {
      violations.push(`Bookings must declare ${port}`)
    }
    if (!manifestSource.includes(`requirePort(${port})`)) {
      violations.push(`Bookings graph manifest must require ${port}`)
    }
    if (!provider.includes(`[${port}.id]`)) {
      violations.push(`${file} must statically provide ${port}`)
    }
    if (operatorHost.includes(port)) {
      violations.push(`Operator host must not bind ${port}`)
    }
  }
  return violations
}

function productionEdges(manifests) {
  const names = new Set(manifests.map((manifest) => manifest.name))
  return new Map(
    manifests.map((manifest) => [
      manifest.name,
      Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }).filter((name) =>
        names.has(name),
      ),
    ]),
  )
}

function findPath(edges, start, target) {
  const queue = [[start]]
  const visited = new Set([start])
  while (queue.length > 0) {
    const path = queue.shift()
    const current = path.at(-1)
    if (current === target) return path
    for (const dependency of edges.get(current) ?? []) {
      if (visited.has(dependency)) continue
      visited.add(dependency)
      queue.push([...path, dependency])
    }
  }
  return undefined
}
