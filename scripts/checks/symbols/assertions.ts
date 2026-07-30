/**
 * Symbol-level assertions over parsed TypeScript sources.
 *
 * These replace the substring pins that survive graph conformance — the ones
 * asserting where a symbol may appear rather than what a package contributes:
 *
 *     composition.includes("loadFlightsRuntime")     // must NOT appear
 *     runtimeContributor.includes("resolveRegistry") // must appear
 *
 * Matching source text catches comments and unrelated prose, and breaks on
 * reformatting. Matching identifiers in a parsed AST does neither.
 *
 * The technique is lifted from check-booking-create-authority, which has used it
 * successfully; this module makes it reusable and declarative. Every function
 * here is pure over a supplied source map so the tests can synthesise sources.
 *
 * Parsing all of packages/ costs ~6s, so callers parse once and share — see
 * index.ts. That shared parse, not rule merging, is what makes this affordable
 * across many packages.
 */
import ts from "typescript"

export type SourceMap = ReadonlyMap<string, ts.SourceFile>

export interface SymbolPolicy {
  /** identifier -> the only files allowed to reference it. Empty means nowhere. */
  referencesWithin?: Record<string, readonly string[]>
  /** identifier -> files it must not appear in. */
  absentFrom?: Record<string, readonly string[]>
  /** file -> identifiers that must be referenced in it. */
  presentIn?: Record<string, readonly string[]>
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  node.forEachChild((child) => walk(child, visit))
}

function referencesIdentifier(source: ts.SourceFile, identifier: string): boolean {
  let found = false
  walk(source, (node) => {
    if (!found && ts.isIdentifier(node) && node.text === identifier) found = true
  })
  return found
}

/**
 * Returns one violation string per breach; empty means the policy holds.
 */
export function checkSymbolPolicy(sources: SourceMap, policy: SymbolPolicy): string[] {
  const violations: string[] = []

  for (const [identifier, allowed] of Object.entries(policy.referencesWithin ?? {})) {
    const allowedSet = new Set(allowed)
    for (const [file, source] of sources) {
      if (!referencesIdentifier(source, identifier)) continue
      if (allowedSet.has(file)) continue
      violations.push(
        allowedSet.size === 0
          ? `${file}: ${identifier} must not exist anywhere, but is referenced here`
          : `${file}: ${identifier} escaped its allowlist (${allowed.join(", ")})`,
      )
    }
  }

  for (const [identifier, files] of Object.entries(policy.absentFrom ?? {})) {
    for (const file of files) {
      const source = sources.get(file)
      // A missing file cannot reference anything. Absence checks are about a
      // symbol not appearing, so a deleted file satisfies them trivially — the
      // file's own existence is retired-paths.json's job, not this one's.
      if (!source) continue
      if (referencesIdentifier(source, identifier)) {
        violations.push(`${file}: ${identifier} must not be referenced here`)
      }
    }
  }

  for (const [file, identifiers] of Object.entries(policy.presentIn ?? {})) {
    const source = sources.get(file)
    if (!source) {
      violations.push(`${file}: expected to exist and reference ${identifiers.join(", ")}`)
      continue
    }
    for (const identifier of identifiers) {
      if (!referencesIdentifier(source, identifier)) {
        violations.push(`${file}: must reference ${identifier}`)
      }
    }
  }

  return violations
}
