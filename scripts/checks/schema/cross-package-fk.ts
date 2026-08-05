/**
 * Cross-package foreign keys must be backed by a declared schema requirement.
 *
 * `docs/architecture/schema-discipline.md` used to read "cross-domain FKs MUST
 * go through a link table", on the rationale that a consumer could install one
 * module without the module owning the referenced table, and so could not
 * create the constraint.
 *
 * ADR-0016 removed that consumer. There is one resident deployable, the whole
 * graph is resolved at build time, and there is no module subsetting. What a
 * cross-package FK actually needs is that the target's tables exist by the time
 * the source's migrations run — and that is exactly what `voyant.requiresSchemas`
 * declares: `framework-migrations/src/discover.ts` topologically sorts migration
 * sources deps-first over those edges, with a cycle guard.
 *
 * So the rule is not "no cross-package FKs". It is:
 *
 *   a cross-package `.references()` is allowed iff the owning package declares
 *   the target package in `voyant.requiresSchemas`.
 *
 * That keeps the property the original rule was protecting (the referenced
 * table is always present, and migrations are ordered) while dropping the part
 * that only made sense under subsetting.
 */

/** Packages every module may reference without declaring a schema requirement. */
export const FOUNDATION_PACKAGES = new Set(["db", "schema-kit", "core", "types", "utils"])

export interface CrossPackageReference {
  /** Package that owns the referencing table, e.g. "operations". */
  readonly pkg: string
  /** Package owning the referenced table, e.g. "identity". */
  readonly target: string
  /** Repo-relative file the `.references()` call appears in. */
  readonly file: string
  /** 1-indexed line of the `.references()` call. */
  readonly line: number
  /** Local identifier the reference resolves through, e.g. "identityAddresses". */
  readonly symbol: string
}

export interface CrossPackageFkResult {
  readonly violations: string[]
  /** References that are allowed because the requirement is declared. */
  readonly allowed: CrossPackageReference[]
}

/**
 * @param references every cross-package `.references()` found in the workspace
 * @param requiresSchemasByPackage package directory name -> declared `voyant.requiresSchemas`,
 *        already reduced to bare package directory names
 */
export function checkCrossPackageForeignKeys(
  references: readonly CrossPackageReference[],
  requiresSchemasByPackage: ReadonlyMap<string, ReadonlySet<string>>,
): CrossPackageFkResult {
  const violations: string[] = []
  const allowed: CrossPackageReference[] = []

  for (const reference of references) {
    if (FOUNDATION_PACKAGES.has(reference.target)) continue

    const declared = requiresSchemasByPackage.get(reference.pkg)
    if (declared?.has(reference.target)) {
      allowed.push(reference)
      continue
    }

    violations.push(
      `${reference.file}:${reference.line} — ${reference.pkg} declares a foreign key into ` +
        `${reference.target} (via ${reference.symbol}) but does not list ` +
        `"@voyant-travel/${reference.target}" in voyant.requiresSchemas. ` +
        `Either declare the schema requirement so migrations are ordered, or drop the ` +
        `.references() and keep a loose id column.`,
    )
  }

  return { violations, allowed }
}
