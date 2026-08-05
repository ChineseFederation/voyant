/**
 * Analytics-event conformance: the declared catalogue, the documented one, and
 * what the code actually emits.
 *
 * A taxonomy is only worth having if it is one list. Three copies of it exist
 * whether we like it or not — a TypeScript constant, an architecture document,
 * and the `track()` calls themselves — so the checker's job is to make them one
 * list by refusing to let them differ. It is the same treatment
 * `verify:route-conformance` gives a mounted route array, for the same reason:
 * `booking-journey-architecture.md` described a `/quote` route long after it
 * was deleted, and nothing noticed (voyant#4188).
 *
 * Three directions, and all three matter:
 *
 *   declared vs documented   the doc is what everyone reads before changing it
 *   declared vs emitted      an event nobody emits is a dashboard line that
 *                            silently reads zero forever
 *   emitted vs declared      an event nobody declared is data arriving under a
 *                            name no document explains
 *
 * Every function here is pure over supplied text so the tests can synthesise
 * all three sides.
 */
import ts from "typescript"

export interface EventCatalogueRule {
  source: string
  export: string
  doc: string
  marker: string
  /** Globs-free directory prefixes whose tracked `.ts`/`.tsx` files may emit. */
  emitters: string[]
}

export type EventProperties = Map<string, string[]>

/**
 * The `{ "name": ["prop", …] }` object literal an export is initialised with.
 *
 * Read from the AST rather than by importing the module: the catalogue lives in
 * a package whose runtime this checker must not load, and an AST read also
 * keeps the constant legible as data rather than as something with behaviour.
 */
export function declaredEvents(sourceText: string, exportName: string): EventProperties {
  const source = ts.createSourceFile(
    `${exportName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const events: EventProperties = new Map()
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
      if (ts.isObjectLiteralExpression(initializer)) {
        found = true
        for (const property of initializer.properties) {
          if (!ts.isPropertyAssignment(property)) continue
          const name = ts.isStringLiteralLike(property.name)
            ? property.name.text
            : ts.isIdentifier(property.name)
              ? property.name.text
              : null
          if (name === null) continue
          const value = unwrap(property.initializer)
          if (!ts.isArrayLiteralExpression(value)) continue
          events.set(
            name,
            value.elements.filter(ts.isStringLiteralLike).map((element) => element.text),
          )
        }
      }
    }
    node.forEachChild(visit)
  }
  visit(source)

  if (!found) throw new Error(`${exportName} is not an object literal in the named source`)
  return events
}

/**
 * The events in the fenced block that follows `<!-- marker -->`.
 *
 * Each line is `event.name  prop, prop, …`. Properties are comma-separated so
 * the block stays readable as a table while comparing exactly.
 */
export function documentedEvents(markdown: string, marker: string): EventProperties {
  const lines = markdown.split("\n")
  const markerIndex = lines.findIndex((line) => line.includes(marker))
  if (markerIndex === -1) throw new Error(`marker ${JSON.stringify(marker)} is absent from the doc`)

  const openIndex = lines.findIndex((line, index) => index > markerIndex && line.startsWith("```"))
  if (openIndex === -1) throw new Error(`no fenced block follows ${JSON.stringify(marker)}`)
  const closeIndex = lines.findIndex((line, index) => index > openIndex && line.startsWith("```"))
  if (closeIndex === -1)
    throw new Error(`unterminated fenced block after ${JSON.stringify(marker)}`)

  const events: EventProperties = new Map()
  const duplicates: string[] = []
  for (const raw of lines.slice(openIndex + 1, closeIndex)) {
    const line = raw.trim()
    if (line.length === 0) continue
    const [name, ...rest] = line.split(/\s{2,}|\t/)
    const key = (name ?? "").trim()
    if (key.length === 0) continue
    if (events.has(key)) duplicates.push(key)
    events.set(
      key,
      rest
        .join(" ")
        .split(",")
        .map((property) => property.trim())
        .filter((property) => property.length > 0),
    )
  }
  if (duplicates.length > 0) {
    // A block listing one event twice can hide a missing one behind an equal
    // line count, so say so rather than silently de-duplicating.
    throw new Error(`the doc lists ${[...new Set(duplicates)].sort().join(", ")} more than once`)
  }
  return events
}

export interface EmittedEvent {
  name: string
  file: string
  /** Object-literal property keys, or null when the call spreads or computes them. */
  properties: string[] | null
}

/**
 * Every `…track("some.event", { … })` call in a source file.
 *
 * Matched on the method name rather than on a resolved import, because the
 * emitter arrives through half a dozen aliases (`analytics`, the hook's return
 * value, a destructured field) and a name-based match cannot be defeated by
 * renaming a variable. The cost is that an unrelated `track()` would be picked
 * up — which is fine: it would have to be named like a catalogue event to fail
 * anything, and if it is, it belongs in the catalogue.
 */
export function emittedEvents(sourceText: string, file: string): EmittedEvent[] {
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true)
  const emitted: EmittedEvent[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "track" &&
      node.arguments.length > 0 &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      emitted.push({
        name: (node.arguments[0] as ts.StringLiteralLike).text,
        file,
        properties: propertyKeys(node.arguments[1]),
      })
    }
    node.forEachChild(visit)
  }
  visit(source)
  return emitted
}

/**
 * The literal keys of an emitted property bag.
 *
 * `null` — meaning "do not check" — for a spread, a computed key, or an
 * expression that is not an object literal. Call sites legitimately build
 * property bags through a helper, and a checker that demanded a literal
 * everywhere would push those call sites into a worse shape to satisfy it.
 */
function propertyKeys(argument: ts.Expression | undefined): string[] | null {
  if (!argument) return []
  let node: ts.Expression = argument
  while (ts.isCallExpression(node) && node.arguments.length === 1 && node.arguments[0]) {
    // `analyticsProperties({ … })` — unwrap the one helper the emitters use to
    // drop undefined values, so its call sites are still checked.
    node = node.arguments[0]
  }
  if (!ts.isObjectLiteralExpression(node)) return null
  const keys: string[] = []
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) return null
    const name = property.name
    if (!name) return null
    if (ts.isStringLiteralLike(name) || ts.isIdentifier(name)) keys.push(name.text)
    else return null
  }
  return keys
}

export interface CatalogueDiff {
  documentedNotDeclared: string[]
  declaredNotDocumented: string[]
  propertyMismatches: string[]
  declaredNotEmitted: string[]
  emittedNotDeclared: string[]
  undeclaredProperties: string[]
}

export function diffCatalogue(
  declared: EventProperties,
  documented: EventProperties,
  emitted: readonly EmittedEvent[],
): CatalogueDiff {
  const emittedByName = new Map<string, EmittedEvent[]>()
  for (const event of emitted) {
    // Only names shaped like ours take part: an unrelated `.track()` on some
    // other object must not be able to fail this check.
    if (!/^(engine|admin|portal)\./.test(event.name)) continue
    const bucket = emittedByName.get(event.name)
    if (bucket) bucket.push(event)
    else emittedByName.set(event.name, [event])
  }

  const propertyMismatches: string[] = []
  for (const [name, properties] of declared) {
    const documentedProperties = documented.get(name)
    if (!documentedProperties) continue
    const a = [...properties].sort().join(", ")
    const b = [...documentedProperties].sort().join(", ")
    if (a !== b) {
      propertyMismatches.push(`${name}: declared [${a}] but documented [${b}]`)
    }
  }

  const undeclaredProperties: string[] = []
  for (const [name, events] of emittedByName) {
    const allowed = declared.get(name)
    if (!allowed) continue
    for (const event of events) {
      if (event.properties === null) continue
      const extra = event.properties.filter((key) => !allowed.includes(key))
      if (extra.length > 0) {
        undeclaredProperties.push(`${event.file}: ${name} emits undeclared ${extra.join(", ")}`)
      }
    }
  }

  return {
    documentedNotDeclared: [...documented.keys()].filter((name) => !declared.has(name)).sort(),
    declaredNotDocumented: [...declared.keys()].filter((name) => !documented.has(name)).sort(),
    propertyMismatches: propertyMismatches.sort(),
    declaredNotEmitted: [...declared.keys()].filter((name) => !emittedByName.has(name)).sort(),
    emittedNotDeclared: [...emittedByName.keys()].filter((name) => !declared.has(name)).sort(),
    undeclaredProperties: undeclaredProperties.sort(),
  }
}

export function formatCatalogueDiff(rule: EventCatalogueRule, diff: CatalogueDiff): string[] {
  const lines: string[] = []
  const section = (label: string, entries: readonly string[], prefix: string): void => {
    if (entries.length === 0) return
    lines.push(label, ...entries.map((entry) => `    ${prefix} ${entry}`))
  }

  section(
    `${rule.doc}: declared in ${rule.export} but not documented:`,
    diff.declaredNotDocumented,
    "+",
  )
  section(
    `${rule.doc}: documented but absent from ${rule.export}:`,
    diff.documentedNotDeclared,
    "-",
  )
  section(`${rule.doc}: properties disagree with ${rule.export}:`, diff.propertyMismatches, "~")
  section(
    `${rule.source}: declared but never emitted — a dashboard line that reads zero forever:`,
    diff.declaredNotEmitted,
    "0",
  )
  section(
    `${rule.source}: emitted but never declared — data arriving under an unexplained name:`,
    diff.emittedNotDeclared,
    "?",
  )
  section("undeclared properties on an emitted event:", diff.undeclaredProperties, "!")
  return lines
}

/**
 * Import specifiers in a source file that name a forbidden analytics vendor.
 *
 * The port's whole justification is that this repository stays vendor-neutral,
 * and "we intend to" is not a property a build can hold. `verify:boundary`
 * proves an equivalent thing about Drizzle and Hono in browser bundles; this
 * proves it about analytics SDKs everywhere.
 *
 * Prefix matching, so `@posthog/` catches every package in the scope and
 * `posthog-js` catches `posthog-js/react` as well.
 */
export function forbiddenVendorImports(
  sourceText: string,
  file: string,
  forbidden: readonly string[],
): string[] {
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true)
  const hits: string[] = []

  const check = (specifier: string): void => {
    const vendor = forbidden.find(
      (name) => specifier === name || specifier.startsWith(name.endsWith("/") ? name : `${name}/`),
    )
    if (vendor) hits.push(`${file}: imports ${specifier}`)
  }

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      check(node.moduleSpecifier.text)
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      check((node.arguments[0] as ts.StringLiteralLike).text)
    }
    node.forEachChild(visit)
  }
  visit(source)
  return hits
}

/** Dependency entries in a manifest that name a forbidden analytics vendor. */
export function forbiddenVendorDependencies(
  manifestText: string,
  file: string,
  forbidden: readonly string[],
): string[] {
  const manifest = JSON.parse(manifestText) as Record<string, unknown>
  const fields = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const
  const hits: string[] = []
  for (const field of fields) {
    const block = manifest[field]
    if (!block || typeof block !== "object") continue
    for (const name of Object.keys(block as Record<string, unknown>)) {
      const vendor = forbidden.find(
        (entry) => name === entry || name.startsWith(entry.endsWith("/") ? entry : `${entry}/`),
      )
      if (vendor) hits.push(`${file}: ${field} carries ${name}`)
    }
  }
  return hits
}
