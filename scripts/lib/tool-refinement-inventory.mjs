/**
 * Exact inventory of Tool input-schema refinements.
 *
 * `z.toJSONSchema` drops `.refine` / `.superRefine`, and that JSON Schema is
 * what an MCP client shows the model when it picks arguments. A rule expressed
 * only as a refinement is invisible at call time and surfaces afterwards as a
 * `-32602`, which an agent reads as bad luck rather than bad arguments — it
 * retries unchanged until the loop guard fires (voyant#3814, voyant#3822).
 *
 * The first attempt at this check inferred "documented" by matching keywords
 * ("must", "when", "unless") against visible text, which produced false
 * negatives — `set_organization_navigation_preferences` passed because its
 * description happens to contain "unless", while its real rules appear nowhere
 * in its JSON Schema. Nothing here is inferred from prose. Every refinement is
 * an entry a human has classified, so a new one fails until someone looks at it.
 */

/** A `.refine()` / `.superRefine()` / `.check()` node, as opposed to a
 *  constraint like `min_length` that JSON Schema can express. */
const REFINEMENT_CHECK = "custom"

const ROOT_PATH = "<root>"

/**
 * Schema node types we know how to descend. Anything else fails the run rather
 * than being skipped: a walker that silently ignores an unfamiliar node reports
 * a confident zero, which is exactly how the first sweep convinced itself the
 * class did not exist.
 */
const TRAVERSABLE = new Set([
  "object",
  "array",
  "optional",
  "nullable",
  "default",
  "prefault",
  "union",
  "intersection",
  "tuple",
  "record",
  "map",
  "set",
  "pipe",
  "transform",
  "lazy",
  "readonly",
  "catch",
  "promise",
  "nonoptional",
  "success",
])

/** Leaf types that cannot contain another schema. */
const LEAF = new Set([
  "string",
  "number",
  "bigint",
  "boolean",
  "date",
  "symbol",
  "undefined",
  "null",
  "any",
  "unknown",
  "never",
  "void",
  "literal",
  "enum",
  "nan",
  "file",
  "template_literal",
  "custom",
])

function defOf(schema) {
  return schema?._zod?.def
}

function hasRefinement(schema) {
  const checks = defOf(schema)?.checks
  if (!Array.isArray(checks)) return false
  return checks.some((check) => check?._zod?.def?.check === REFINEMENT_CHECK)
}

/**
 * Every path in one Tool's input schema that carries a refinement.
 *
 * @returns {{ paths: string[], unknownTypes: string[] }}
 */
export function findRefinementPaths(schema) {
  const paths = []
  const unknownTypes = []
  const seen = new WeakSet()

  walk(schema, ROOT_PATH)
  return { paths, unknownTypes }

  function walk(node, path) {
    if (!node || typeof node !== "object") return
    // Dedupe on node identity, not path. Recursive schemas (`z.lazy`) are
    // self-similar, so a path-keyed guard never terminates: the getter mints
    // a fresh node each call and the path keeps growing. Identity is also the
    // right grain for an inventory, since one shared refined sub-schema is one
    // rule a human classifies once, not one entry per place it is reused.
    if (seen.has(node)) return
    seen.add(node)

    if (hasRefinement(node)) paths.push(path)

    const def = defOf(node)
    const type = def?.type
    if (!type) return
    if (LEAF.has(type)) return
    if (!TRAVERSABLE.has(type)) {
      unknownTypes.push(`${path}: ${type}`)
      return
    }

    switch (type) {
      case "object": {
        const shape = typeof def.shape === "function" ? def.shape() : def.shape
        for (const [field, child] of Object.entries(shape ?? {})) {
          walk(child, path === ROOT_PATH ? field : `${path}.${field}`)
        }
        if (def.catchall) walk(def.catchall, `${path}.*`)
        return
      }
      case "array":
        walk(def.element, `${path}[]`)
        return
      case "tuple":
        for (const [index, child] of (def.items ?? []).entries()) {
          walk(child, `${path}[${index}]`)
        }
        if (def.rest) walk(def.rest, `${path}[]`)
        return
      case "union":
        for (const [index, child] of (def.options ?? []).entries()) {
          walk(child, `${path}|${index}`)
        }
        return
      case "intersection":
        walk(def.left, path)
        walk(def.right, path)
        return
      case "record":
      case "map":
        if (def.keyType) walk(def.keyType, `${path}{key}`)
        walk(def.valueType, `${path}.*`)
        return
      case "set":
        walk(def.valueType, `${path}[]`)
        return
      case "pipe":
        walk(def.in, path)
        walk(def.out, path)
        return
      case "lazy": {
        const inner = typeof def.getter === "function" ? def.getter() : undefined
        if (inner) walk(inner, path)
        return
      }
      default:
        // optional / nullable / default / prefault / readonly / catch /
        // promise / nonoptional / success / transform all wrap one schema.
        walk(def.innerType ?? def.in ?? def.type, path)
        return
    }
  }
}

export function entryId(packageName, toolName, path) {
  return `${packageName}:${toolName}:${path}`
}

/**
 * Compare what the code carries against what the inventory records.
 *
 * @param {{ id: string }[]} found
 * @param {{ entries?: { id: string, documented?: boolean, note?: string }[], maxUndocumented?: number }} inventory
 */
export function inspectRefinementInventory(found, inventory) {
  const diagnostics = []
  const recorded = new Map()
  for (const entry of inventory?.entries ?? []) {
    if (!entry?.id) {
      diagnostics.push("Inventory entry is missing an `id`.")
      continue
    }
    if (recorded.has(entry.id)) {
      diagnostics.push(`Inventory lists "${entry.id}" more than once.`)
      continue
    }
    if (typeof entry.documented !== "boolean") {
      diagnostics.push(`"${entry.id}" must record \`documented\` as a boolean.`)
      continue
    }
    if (!entry.note || entry.note.trim().length === 0) {
      diagnostics.push(
        `"${entry.id}" needs a note saying where the rule is stated, or why it is not.`,
      )
      continue
    }
    recorded.set(entry.id, entry)
  }

  const foundIds = new Set(found.map((item) => item.id))

  for (const item of found) {
    if (recorded.has(item.id)) continue
    diagnostics.push(
      `Unregistered refinement "${item.id}". Add it to scripts/tool-refinement-inventory.json ` +
        `with \`documented\` set to whether the rule is stated in text the model can read ` +
        `(a field \`.describe()\` or the Tool description), and a note saying where.`,
    )
  }

  for (const id of recorded.keys()) {
    if (foundIds.has(id)) continue
    diagnostics.push(
      `Stale inventory entry "${id}" — no refinement at that path any more. Remove it.`,
    )
  }

  const undocumented = found.filter((item) => recorded.get(item.id)?.documented === false)
  const ceiling = inventory?.maxUndocumented

  if (typeof ceiling !== "number") {
    diagnostics.push("Inventory must set `maxUndocumented` as the ratchet ceiling.")
  } else if (undocumented.length > ceiling) {
    diagnostics.push(
      `${undocumented.length} undocumented refinements exceeds the ceiling of ${ceiling}. ` +
        `State the rule where the model can read it, or raise the ceiling deliberately.`,
    )
  } else if (undocumented.length < ceiling) {
    diagnostics.push(
      `Only ${undocumented.length} undocumented refinements remain but the ceiling is ${ceiling}. ` +
        `Lower \`maxUndocumented\` to ${undocumented.length} so the ratchet holds.`,
    )
  }

  return {
    diagnostics,
    total: found.length,
    documented: found.length - undocumented.length,
    undocumented: undocumented.length,
  }
}
