/**
 * The public npm surface must be a closed set.
 *
 * Issue #4059: 108 packages are published, and the target is roughly a dozen —
 * the third-party extension surface plus the Connect contract surface. The
 * hazard is not choosing that list; it is that a listed package can quietly
 * re-widen the surface by depending on something outside it. `@voyant-travel/ui`
 * carried a runtime geography dependency until #4021; `@voyant-travel/apps`
 * pulled in nine packages, including the operator's Drizzle schema and Hono
 * wiring, until the manifest contract was split out.
 *
 * So this checks the property that matters rather than the list: **the
 * dependency closure of the allowlist must equal the allowlist**. A member that
 * grows a dependency on a runtime module fails here, at the point the
 * dependency is added, instead of at `npm install` in a publisher's project.
 *
 * This is deliberately not yet a publish gate. The 90-odd packages outside the
 * allowlist are still published, because contracting the surface is blocked on
 * giving the first-party repos (netopia-adapter, connect, hisky-connector,
 * algolia-adapter, plugin-smartbill) a build path — #4059 item 4. What this
 * stops is the allowlist rotting before that lands.
 */

export interface SurfaceManifest {
  name: string
  private?: boolean
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export interface SurfaceReport {
  /** Published packages that are not on the allowlist. */
  unlisted: string[]
  /** Allowlisted packages whose dependencies reach outside the allowlist. */
  escapes: { package: string; via: string; dependency: string }[]
  /** Allowlist entries that name a package that does not exist. */
  missing: string[]
  /** Allowlist entries that are marked private and so cannot be published. */
  unpublishable: string[]
  closureSize: number
}

const WORKSPACE_SCOPE = "@voyant-travel/"

function workspaceDependencies(manifest: SurfaceManifest): string[] {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ].filter((name) => name.startsWith(WORKSPACE_SCOPE))
}

export function checkPublicSurface(
  manifests: readonly SurfaceManifest[],
  allowlist: readonly string[],
): SurfaceReport {
  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]))
  const allowed = new Set(allowlist)

  const missing = allowlist.filter((name) => !byName.has(name))
  const unpublishable = allowlist.filter((name) => byName.get(name)?.private === true)

  // Walk the closure, recording the first path by which each escape is reached
  // so the failure names the edge to cut rather than only the destination.
  const escapes: SurfaceReport["escapes"] = []
  const seen = new Set<string>()
  const queue = [...allowlist]
  while (queue.length > 0) {
    const name = queue.shift()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const manifest = byName.get(name)
    if (!manifest) continue
    for (const dependency of workspaceDependencies(manifest)) {
      if (!allowed.has(dependency)) {
        escapes.push({ package: name, via: name, dependency })
        continue
      }
      queue.push(dependency)
    }
  }

  // The allowlist is the whole published surface, not a subset of it: anything
  // publishable and unlisted has widened the surface without a decision.
  const unlisted = manifests
    .filter((manifest) => manifest.private !== true && !allowed.has(manifest.name))
    .map((manifest) => manifest.name)
    .sort()

  return { escapes, missing, unpublishable, unlisted, closureSize: seen.size }
}

export function formatSurfaceViolations(report: SurfaceReport): string[] {
  const violations: string[] = []
  for (const name of report.missing) {
    violations.push(`${name}: on the public surface allowlist but no such package exists`)
  }
  for (const name of report.unpublishable) {
    violations.push(`${name}: on the public surface allowlist but marked private`)
  }
  for (const name of report.unlisted) {
    violations.push(
      `${name}: publishable but not on the public surface allowlist. The deployment ships as an ` +
        `image, so the npm assembly path is private. Mark it \`private: true\`, or add it to the ` +
        `allowlist deliberately.`,
    )
  }
  for (const leak of report.escapes) {
    violations.push(
      `${leak.package} depends on ${leak.dependency}, which is not on the public surface. ` +
        `Publishing ${leak.package} would drag ${leak.dependency} — and its own closure — ` +
        `back onto npm. Either extract the contract ${leak.package} actually needs, or add ` +
        `${leak.dependency} to the allowlist deliberately.`,
    )
  }
  return violations
}
