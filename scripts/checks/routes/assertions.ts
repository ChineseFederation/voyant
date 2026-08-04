/**
 * Route-set conformance: the mounted set versus the documented set.
 *
 * A route array in code is the truth about what a deployment serves. A prose
 * architecture doc is what everyone reads before changing it. Nothing keeps
 * them in step, so the doc drifts silently — which is how voyant#4188 started,
 * with a document describing a `/quote` bootstrap route that no longer existed.
 *
 * Every function here is pure over supplied text so the tests can synthesise
 * both sides.
 */
import ts from "typescript"

export interface RouteSet {
  source: string
  export: string
  doc: string
  marker: string
}

/**
 * The string members of an exported `const x = [...] as const` array.
 *
 * Reading the AST rather than importing the module keeps the check free of the
 * module's runtime dependencies, which for a route module is the whole
 * deployment.
 */
export function mountedRoutes(sourceText: string, exportName: string): string[] {
  const source = ts.createSourceFile(
    `${exportName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const routes: string[] = []
  let found = false

  const unwrap = (node: ts.Expression): ts.Expression =>
    ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ? unwrap(node.expression) : node

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === exportName &&
      node.initializer
    ) {
      const initializer = unwrap(node.initializer)
      if (ts.isArrayLiteralExpression(initializer)) {
        found = true
        for (const element of initializer.elements) {
          if (ts.isStringLiteralLike(element)) routes.push(element.text)
        }
      }
    }
    node.forEachChild(visit)
  }
  visit(source)

  if (!found) throw new Error(`${exportName} is not an array literal in the named source`)
  return routes
}

/**
 * Expand `{a,b}` alternations, then rewrite `{param}` as `:param` so the doc
 * can stay in the OpenAPI-ish form readers expect while comparing exactly
 * against Hono's path syntax.
 */
function expand(template: string): string[] {
  const alternation = /\{([^{}]*,[^{}]*)\}/.exec(template)
  if (!alternation) return [template.replaceAll(/\{([^{}]+)\}/g, ":$1")]
  return alternation[1]!
    .split(",")
    .flatMap((option) =>
      expand(
        template.slice(0, alternation.index) +
          option.trim() +
          template.slice(alternation.index + alternation[0].length),
      ),
    )
}

export interface DocumentedRoute {
  method: string
  path: string
}

/**
 * The routes in the fenced block that follows `<!-- marker -->`.
 *
 * Each line is `METHOD  PATH`. Only the path takes part in the set comparison —
 * the code array records paths, not methods — but the method is kept so two
 * lines for one path (a GET and a PATCH) read as documentation rather than as
 * a duplicate.
 */
export function documentedRoutes(markdown: string, marker: string): DocumentedRoute[] {
  const lines = markdown.split("\n")
  const markerIndex = lines.findIndex((line) => line.includes(marker))
  if (markerIndex === -1) throw new Error(`marker ${JSON.stringify(marker)} is absent from the doc`)

  const openIndex = lines.findIndex((line, index) => index > markerIndex && line.startsWith("```"))
  if (openIndex === -1) throw new Error(`no fenced block follows ${JSON.stringify(marker)}`)
  const closeIndex = lines.findIndex((line, index) => index > openIndex && line.startsWith("```"))
  if (closeIndex === -1)
    throw new Error(`unterminated fenced block after ${JSON.stringify(marker)}`)

  return lines
    .slice(openIndex + 1, closeIndex)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const columns = line.split(/\s+/)
      const method = columns.length > 1 ? columns[0]! : ""
      return expand(columns.at(-1)!).map((path) => ({ method, path }))
    })
}

export interface RouteSetDiff {
  mountedNotDocumented: string[]
  documentedNotMounted: string[]
  duplicates: string[]
}

export function diffRouteSets(
  mounted: readonly string[],
  documented: readonly DocumentedRoute[],
): RouteSetDiff {
  const mountedSet = new Set(mounted)
  const documentedSet = new Set(documented.map((route) => route.path))
  const entries = documented.map((route) => `${route.method} ${route.path}`.trim())
  return {
    mountedNotDocumented: [...mountedSet].filter((path) => !documentedSet.has(path)).sort(),
    documentedNotMounted: [...documentedSet].filter((path) => !mountedSet.has(path)).sort(),
    // A block listing one method+path twice can hide a missing route behind an
    // equal line count, so say so rather than silently de-duplicating.
    duplicates: [
      ...new Set(entries.filter((entry, index) => entries.indexOf(entry) !== index)),
    ].sort(),
  }
}

export function formatRouteSetDiff(set: RouteSet, diff: RouteSetDiff): string[] {
  const lines: string[] = []
  if (diff.mountedNotDocumented.length > 0) {
    lines.push(
      `${set.doc}: mounted but not documented (${set.source} exports them from ${set.export}):`,
      ...diff.mountedNotDocumented.map((path) => `    + ${path}`),
    )
  }
  if (diff.documentedNotMounted.length > 0) {
    lines.push(
      `${set.doc}: documented but not mounted — ${set.export} does not serve these:`,
      ...diff.documentedNotMounted.map((path) => `    - ${path}`),
    )
  }
  if (diff.duplicates.length > 0) {
    lines.push(
      `${set.doc}: listed more than once:`,
      ...diff.duplicates.map((path) => `    = ${path}`),
    )
  }
  return lines
}
