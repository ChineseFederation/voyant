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
 *
 * ## Withdrawal, and who it lands on — #4159
 *
 * Contracting a surface has a second failure the closure rule does not see:
 * someone outside this repository is already depending on what gets withdrawn.
 * `hisky-connector` pinned `@voyant-travel/flights` after it went private;
 * `voyant-smartbill-app` pinned `@voyant-travel/apps` after it was split. Both
 * kept installing, because marking a package private here does not unpublish it
 * — it freezes it. The break is silent and in the future: no version will ever
 * supersede the one they resolve, and npm names no successor.
 *
 * So the allowlist carries two more sections, and this file checks them:
 *
 * - `consumers` — repositories outside this one that install from the surface,
 *   and what they declare. Taking a package they name off the allowlist fails
 *   here, naming the repository, instead of in their next install.
 * - `withdrawn` — packages that used to be on the surface, each pointing at the
 *   successor a reader should move to. This is what an external reader has
 *   instead of a deprecation notice, so entries must stay true: a withdrawn
 *   package must really be private, and a successor must really be published.
 *
 * Neither section can be derived from this repository, which is the point —
 * they are the record of what the contraction is standing on.
 */

export interface SurfaceManifest {
  name: string
  private?: boolean
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/** A repository outside this one that installs from the public surface. */
export interface ConsumerRecord {
  /** Everything scoped `@voyant-travel/` that the repository declares. */
  consumes: string[]
}

/** A package that used to be on the public surface and no longer is. */
export interface WithdrawalRecord {
  /** The package a reader should move to, or `null` when there is not one yet. */
  successor: string | null
  /** Required when `successor` is null: why there is nothing to point at. */
  reason?: string
  /** Repositories known to have depended on it when it was withdrawn. */
  consumers?: string[]
}

export interface SurfaceRegistry {
  consumers?: Record<string, ConsumerRecord>
  withdrawn?: Record<string, WithdrawalRecord>
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
  /** A recorded consumer installs a package of ours that is no longer published. */
  stranded: { repository: string; dependency: string }[]
  /** A withdrawal record that no longer describes reality. */
  staleWithdrawals: { package: string; why: string }[]
  /** A withdrawal that points at a successor which is itself not published. */
  danglingSuccessors: { package: string; successor: string }[]
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
  registry: SurfaceRegistry = {},
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

  // A recorded consumer is a repository we know installs from this surface. Only
  // the names this repository owns are checkable: a connector's dependency on
  // `connect-provider-sdk` is the connect repo's business, not ours. Withdrawing
  // a package a consumer names is what produced #4159, so it fails here rather
  // than in that repository's next install.
  const withdrawn = registry.withdrawn ?? {}
  const stranded: SurfaceReport["stranded"] = []
  for (const [repository, record] of Object.entries(registry.consumers ?? {})) {
    for (const dependency of record.consumes) {
      if (!byName.has(dependency)) continue
      if (allowed.has(dependency)) continue
      // Recording the withdrawal is the way to do this deliberately: the entry
      // names a successor, or says why there is not one. What fails here is
      // withdrawing without saying anything.
      if (dependency in withdrawn) continue
      stranded.push({ repository, dependency })
    }
  }

  // The withdrawal record is what a reader outside this repository has instead
  // of an npm deprecation notice, so it has to stay true. An entry that no
  // longer describes a withdrawn package is worse than no entry.
  const staleWithdrawals: SurfaceReport["staleWithdrawals"] = []
  const danglingSuccessors: SurfaceReport["danglingSuccessors"] = []
  for (const [name, record] of Object.entries(withdrawn)) {
    if (!byName.has(name)) {
      staleWithdrawals.push({ package: name, why: "no such package in this repository" })
    } else if (byName.get(name)?.private !== true) {
      staleWithdrawals.push({ package: name, why: "the package is publishable again" })
    }
    if (allowed.has(name)) {
      staleWithdrawals.push({ package: name, why: "it is also on the allowlist" })
    }
    if (record.successor === null) {
      if (!record.reason?.trim()) {
        staleWithdrawals.push({ package: name, why: "no successor and no reason given" })
      }
      continue
    }
    // A successor this repository does not own cannot be checked here; one it
    // does own must still be published, or the pointer leads nowhere.
    if (byName.has(record.successor) && !allowed.has(record.successor)) {
      danglingSuccessors.push({ package: name, successor: record.successor })
    }
  }

  return {
    escapes,
    missing,
    unpublishable,
    unlisted,
    stranded,
    staleWithdrawals,
    danglingSuccessors,
    closureSize: seen.size,
  }
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
  for (const { repository, dependency } of report.stranded) {
    violations.push(
      `${repository} declares ${dependency}, which this change takes off the public surface. ` +
        `Nothing unpublishes on npm, so that repository keeps resolving a frozen version and ` +
        `nothing will ever supersede it — this is #4159. Migrate it first, or record ` +
        `${dependency} under \`withdrawn\` with the successor a reader should move to.`,
    )
  }
  for (const { package: name, why } of report.staleWithdrawals) {
    violations.push(
      `${name}: recorded under \`withdrawn\` but ${why}. The withdrawal record is what an ` +
        `external reader has instead of an npm deprecation notice; a wrong entry misdirects them.`,
    )
  }
  for (const { package: name, successor } of report.danglingSuccessors) {
    violations.push(
      `${name} was withdrawn in favour of ${successor}, but ${successor} is not on the public ` +
        `surface either. Point at something a reader can actually install, or set ` +
        `\`successor: null\` with a reason.`,
    )
  }
  return violations
}
