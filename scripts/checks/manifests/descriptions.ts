/**
 * Every published package must describe itself.
 *
 * A package with no `description` renders blank on npmjs.com, in `pnpm why`, and
 * in editor tooling. With 86 of them blank, nothing distinguishes one
 * `@voyant-travel/*` from another without opening its source — which is a large
 * part of why clusters like the seven `admin-*` packages are hard to navigate.
 *
 * This runs as a decreasing allowlist rather than strict. Writing 86
 * descriptions is easy; *shipping* them is not, because `description` lives in
 * package.json and so needs a changeset per package — 86 patch bumps, the
 * notification flood that caused global lockstep to be abandoned. So the backfill
 * rides an existing release wave (see issue #3902 item 5) while this stops the
 * backlog growing in the meantime.
 */
export interface PackageManifest {
  name: string
  description?: string
  private?: boolean
}

export interface DescriptionReport {
  violations: string[]
  /** Allowlisted packages that have since gained a description. */
  fixed: string[]
  checked: number
}

export function checkDescriptions(
  manifests: readonly PackageManifest[],
  allowlist: readonly string[],
): DescriptionReport {
  const allowed = new Set(allowlist)
  const violations: string[] = []
  const fixed: string[] = []
  let checked = 0

  for (const manifest of manifests) {
    if (manifest.private) continue
    checked += 1
    const described = (manifest.description ?? "").trim().length > 0

    if (!described && !allowed.has(manifest.name)) {
      violations.push(
        `${manifest.name}: published packages need a description. It is what npm, ` +
          `\`pnpm why\`, and editor tooling show, and this package would show nothing.`,
      )
    }
    if (described && allowed.has(manifest.name)) fixed.push(manifest.name)
  }

  for (const name of allowlist) {
    if (!manifests.some((manifest) => manifest.name === name)) {
      violations.push(`${name}: allowlisted for a missing description but no longer exists`)
    }
  }

  return { violations, fixed, checked }
}
