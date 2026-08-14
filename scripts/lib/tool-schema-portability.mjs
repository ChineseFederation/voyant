/**
 * A Tool's advertised JSON Schema must be parseable by a strict-schema LLM
 * client.
 *
 * Several providers validate every tool schema in a call with a RE2-style
 * engine that has no backtracking, so a `pattern` containing regex lookaround
 * (`(?=)`, `(?!)`, `(?<=)`, `(?<!)`) is rejected outright. Zod v4's `z.email()`
 * emits `^(?!\.)(?!.*\.\.)…`, so one field anywhere in the authorized catalog
 * poisons the whole call:
 *
 *     AI_APICallError: Invalid JSON schema: regex lookaround is not supported.
 *     Found at $.properties.patch.properties.email.anyOf[0].pattern.
 *
 * The client sends EVERY tool schema in a single model call, so this is not a
 * per-tool inconvenience — the operator gets a generic error on every turn, for
 * every question, including ones that never touch the offending Tool
 * (voyant#4598).
 *
 * Loosening the advertised `pattern` does not loosen enforcement: the handler
 * still parses with the same Zod schema, and the admin API still validates.
 * What changes is only what the model is told about the string's shape.
 */

/**
 * Lookaround openers. `(?:` (non-capturing), `(?<name>` (named capture) and
 * `(?i)`-style flags are fine — only the four assertion forms are rejected.
 */
const LOOKAROUND = /\((\?=|\?!|\?<=|\?<!)/

/** Keywords whose value is a schema (or map/array of schemas) worth descending. */
const SCHEMA_VALUES = ["not", "if", "then", "else", "items", "additionalProperties", "contains"]
const SCHEMA_MAPS = ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]
const SCHEMA_LISTS = ["anyOf", "oneOf", "allOf", "prefixItems"]

/**
 * Every `pattern` in a JSON Schema that a strict-schema client cannot parse.
 *
 * Paths are reported in the `$.properties.patch.properties.email.anyOf[0]`
 * shape the providers themselves use, so a failure here can be matched against
 * a production error message without translation.
 *
 * @param {unknown} schema - a JSON Schema (draft 2020-12) document.
 * @returns {{ path: string, pattern: string }[]}
 */
export function findUnsupportedPatterns(schema) {
  const found = []
  const seen = new WeakSet()

  walk(schema, "$")
  return found

  function walk(node, path) {
    if (!node || typeof node !== "object") return
    // `$defs` reuse means the same node object can be reached twice; a cyclic
    // document (a self-referencing `$ref` target inlined by the serializer)
    // would otherwise not terminate.
    if (seen.has(node)) return
    seen.add(node)

    if (Array.isArray(node)) {
      for (const [index, child] of node.entries()) walk(child, `${path}[${index}]`)
      return
    }

    if (typeof node.pattern === "string" && LOOKAROUND.test(node.pattern)) {
      found.push({ path: `${path}.pattern`, pattern: node.pattern })
    }

    for (const keyword of SCHEMA_VALUES) {
      if (keyword in node) walk(node[keyword], `${path}.${keyword}`)
    }
    for (const keyword of SCHEMA_LISTS) {
      if (Array.isArray(node[keyword])) {
        for (const [index, child] of node[keyword].entries()) {
          walk(child, `${path}.${keyword}[${index}]`)
        }
      }
    }
    for (const keyword of SCHEMA_MAPS) {
      const map = node[keyword]
      if (!map || typeof map !== "object" || Array.isArray(map)) continue
      for (const [name, child] of Object.entries(map)) walk(child, `${path}.${keyword}.${name}`)
    }
  }
}

/** @param {string} pattern */
export function hasLookaround(pattern) {
  return LOOKAROUND.test(pattern)
}

/**
 * Render one Tool's findings as build diagnostics.
 *
 * @param {{ packageName: string, toolName: string, findings: { path: string, pattern: string }[] }[]} offenders
 */
export function formatPortabilityDiagnostics(offenders) {
  return offenders.flatMap(({ packageName, toolName, findings }) =>
    findings.map(
      ({ path, pattern }) =>
        `${packageName}:${toolName} advertises regex lookaround at ${path} — ${pattern}`,
    ),
  )
}
