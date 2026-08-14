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
  /**
   * identifier -> the only paths allowed to reference it, as globs or exact
   * paths. Empty means nowhere.
   *
   * The default-deny complement of `absentFrom`. An authority needs this
   * polarity: `absentFrom` permits every new file until someone remembers to
   * deny it, so a symbol the authority owns can be named from a path nobody
   * listed and nothing complains.
   *
   * Unlike `referencesWithin`, a non-empty rule also fails when one of its own
   * patterns matches nothing. A pin that has quietly stopped matching is
   * indistinguishable from one that holds, and that is how a path-shaped guard
   * rots into a permanent false negative.
   */
  onlyIn?: Record<string, readonly string[]>
  /**
   * string-literal text -> the only paths allowed to write that literal, as
   * globs or exact paths. Empty means nowhere.
   *
   * The `onlyIn` polarity for values that are not identifiers. A sentinel — the
   * anonymous-storefront principal, a magic status string — has to be one
   * constant with one definition, or every copy is a place the meaning can
   * drift. Copies are exactly how voyant#4637 happened: three files agreed the
   * placeholder is not a person and a fourth handed it to a payment processor
   * as a stable customer key.
   *
   * Matches the literal's *text*, so it fires on the value however it is
   * spelled or quoted, and only on real string literals — the name in a comment
   * or in this rule file is not a copy of the constant. Like `onlyIn`, a
   * pattern that matches nothing fails: a pin that has quietly stopped matching
   * is indistinguishable from one that holds.
   */
  literalsOnlyIn?: Record<string, readonly string[]>
  /** identifier -> globs or exact paths it must not appear in. */
  absentFrom?: Record<string, readonly string[]>
  /** file -> identifiers that must be referenced in it. */
  presentIn?: Record<string, readonly string[]>
  /**
   * module specifier -> globs or exact paths that must not import it.
   *
   * The other polarities match IDENTIFIERS through the AST, which cannot
   * express "this file must not import `@voyant-travel/inventory`": a specifier
   * is a string literal, not an identifier, and a package can be depended on
   * without naming any symbol from it (a side-effect import, or a type-only
   * import that is erased). Authority scripts assert this shape by substring —
   * `source.includes("@voyant-travel/inventory")` — which also matches the
   * package name in a comment or an unrelated string.
   *
   * A rule matches a specifier that IS the rule, or that sits beneath it:
   * banning `@voyant-travel/inventory` also bans `@voyant-travel/inventory/schema`,
   * and banning `apps/operator` also bans `../../apps/operator/thing.js`.
   */
  importsAbsentFrom?: Record<string, readonly string[]>
}

/**
 * `*` matches inside one path segment, `**` crosses segments. A pattern without
 * a wildcard is an exact path, so exact-path rules keep their prior meaning.
 */
function globToRegExp(pattern: string): RegExp {
  // One pass over the pattern, so a wildcard is never re-read as literal text
  // and no placeholder character has to be reserved.
  const source = pattern.replaceAll(/\*\*|\*|[^*]+/g, (token) => {
    if (token === "**") return ".*"
    if (token === "*") return "[^/]*"
    return token.replaceAll(/[.+^${}()|[\]\\?]/g, (character) => `\\${character}`)
  })
  return new RegExp(`^${source}$`)
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
 * True when the source writes `text` as a string literal — quoted or as a
 * no-substitution template. Comments and identifiers are not literals, so
 * naming the value in prose is not a copy of it.
 */
function writesStringLiteral(source: ts.SourceFile, text: string): boolean {
  let found = false
  walk(source, (node) => {
    if (found) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text === text) found = true
    }
  })
  return found
}

/**
 * Returns one violation string per breach; empty means the policy holds.
 */
/** Every module specifier a source imports, re-exports, or dynamically loads. */
function importedSpecifiers(source: ts.SourceFile): string[] {
  const specifiers: string[] = []
  walk(source, (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
      return
    }
    // `import("x")` and `require("x")`
    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require"
      const [first] = node.arguments
      if ((isDynamicImport || isRequire) && first !== undefined && ts.isStringLiteral(first)) {
        specifiers.push(first.text)
      }
    }
  })
  return specifiers
}

/** True when `specifier` is `rule` or sits beneath it as a path. */
function specifierMatches(specifier: string, rule: string): boolean {
  return (
    specifier === rule ||
    specifier.startsWith(`${rule}/`) ||
    specifier.includes(`/${rule}/`) ||
    specifier.endsWith(`/${rule}`)
  )
}

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

  for (const [identifier, patterns] of Object.entries(policy.onlyIn ?? {})) {
    const matchers = patterns.map(globToRegExp)
    const matched = new Set<number>()
    for (const [file, source] of sources) {
      if (!referencesIdentifier(source, identifier)) continue
      const index = matchers.findIndex((matcher) => matcher.test(file))
      if (index === -1) {
        violations.push(
          patterns.length === 0
            ? `${file}: ${identifier} must not exist anywhere, but is referenced here`
            : `${file}: ${identifier} is owned by this authority and may only be named in ${patterns.join(", ")}`,
        )
        continue
      }
      matched.add(index)
    }
    // A pattern nobody matches is a rule that no longer says anything. Reject it
    // here rather than let it keep passing as a guard that still holds.
    for (const [index, pattern] of patterns.entries()) {
      if (matched.has(index)) continue
      violations.push(`${pattern}: stale onlyIn entry — no source here references ${identifier}`)
    }
  }

  for (const [literal, patterns] of Object.entries(policy.literalsOnlyIn ?? {})) {
    const matchers = patterns.map(globToRegExp)
    const matched = new Set<number>()
    for (const [file, source] of sources) {
      if (!writesStringLiteral(source, literal)) continue
      const index = matchers.findIndex((matcher) => matcher.test(file))
      if (index === -1) {
        violations.push(
          patterns.length === 0
            ? `${file}: the literal "${literal}" must not appear anywhere, but is written here`
            : `${file}: the literal "${literal}" is owned by this authority and may only be written in ${patterns.join(", ")}`,
        )
        continue
      }
      matched.add(index)
    }
    for (const [index, pattern] of patterns.entries()) {
      if (matched.has(index)) continue
      violations.push(`${pattern}: stale literalsOnlyIn entry — no source here writes "${literal}"`)
    }
  }

  for (const [identifier, patterns] of Object.entries(policy.absentFrom ?? {})) {
    const matchers = patterns.map(globToRegExp)
    // A missing file cannot reference anything. Absence checks are about a
    // symbol not appearing, so a deleted file — or a glob matching none —
    // satisfies them trivially; file existence is retired-paths.json's job.
    for (const [file, source] of sources) {
      if (!matchers.some((matcher) => matcher.test(file))) continue
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

  for (const [specifier, patterns] of Object.entries(policy.importsAbsentFrom ?? {})) {
    const matchers = patterns.map(globToRegExp)
    // An absence rule, so a deleted file or a glob matching nothing satisfies it
    // trivially — file existence is retired-paths.json's job, as with absentFrom.
    for (const [file, source] of sources) {
      if (!matchers.some((matcher) => matcher.test(file))) continue
      const offending = importedSpecifiers(source).find((imported) =>
        specifierMatches(imported, specifier),
      )
      if (offending !== undefined) {
        violations.push(
          offending === specifier
            ? `${file}: must not import ${specifier}`
            : `${file}: must not import ${specifier} (imports ${offending})`,
        )
      }
    }
  }

  return violations
}
