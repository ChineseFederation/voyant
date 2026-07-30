/**
 * `*Ref` mirror conformance.
 *
 * A module that needs to read another module's table declares a local partial
 * mirror rather than importing the owner's schema — `availabilitySlotsRef` in
 * `packages/bookings` mirrors `availability_slots` owned by `packages/availability`.
 * That is what keeps the read from becoming a cross-module schema dependency.
 *
 * A mirror is deliberately WEAKER than its owner, and that is not drift:
 *
 *   - `typeId()` / `typeIdRef()` are literally `text()` (see
 *     packages/db/src/lib/typeid-column.ts), so a mirror declaring `text()` has
 *     the same SQL column. It omits the primary key and default, which is
 *     correct — a read-only mirror must not generate ids.
 *   - An enum column mirrored as `text()` avoids importing the owner's `pgEnum`,
 *     which would reintroduce exactly the dependency the mirror exists to avoid.
 *   - A mirror declares only the columns its module reads.
 *
 * The one thing that IS a bug is a mirror declaring a column the owner does not
 * have — a typo, or a column since removed from the owner. That fails at query
 * time with a missing-column error, and nothing else catches it.
 */

export interface TableDecl {
  /** Exported const name, e.g. `availabilitySlotsRef`. */
  constName: string
  /** SQL table name, e.g. `availability_slots`. */
  tableName: string
  file: string
  /** Column property name -> declared column type callee. */
  columns: Record<string, string>
}

export interface MirrorReport {
  violations: string[]
  /** Mirrors checked, for the summary line. */
  checked: number
}

export function checkRefMirrors(declarations: readonly TableDecl[]): MirrorReport {
  const mirrors = declarations.filter((decl) => decl.constName.endsWith("Ref"))
  const owners = new Map<string, TableDecl>()
  for (const decl of declarations) {
    if (decl.constName.endsWith("Ref")) continue
    if (!owners.has(decl.tableName)) owners.set(decl.tableName, decl)
  }

  const violations: string[] = []

  for (const mirror of mirrors) {
    const owner = owners.get(mirror.tableName)
    if (!owner) {
      violations.push(
        `${mirror.file}: ${mirror.constName} mirrors table "${mirror.tableName}", which no package declares`,
      )
      continue
    }

    for (const column of Object.keys(mirror.columns)) {
      if (column in owner.columns) continue
      violations.push(
        `${mirror.file}: ${mirror.constName}.${column} is not a column of "${mirror.tableName}" ` +
          `(owned by ${owner.file}). A mirror may declare fewer columns than its owner, never different ones.`,
      )
    }
  }

  return { violations, checked: mirrors.length }
}
