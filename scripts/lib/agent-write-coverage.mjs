/**
 * Compare each module's admin write surface against its agent Tool surface.
 *
 * The committed admin OpenAPI documents are the authority on what a human
 * operator can change. An agent that is meant to do what an operator does needs
 * a Tool for each of those resources. Three modules shipped read Tools with the
 * matching writes missing — departures, notification templates, quote
 * authoring — and each was found only when someone asked the agent to do the
 * thing. This closes that loop at build time.
 *
 * Matching is per *resource*, not per operation. Requiring a Tool per route
 * would force a Tool for every incidental PATCH, and route shape is not a
 * capability boundary. What matters is that a resource an operator can create
 * or modify is reachable at all.
 */

const WRITE_METHODS = new Set(["post", "patch", "put", "delete"])

/** Path segments that carry no entity meaning. */
const IGNORED_SEGMENTS = new Set(["v1", "admin", "api"])

/**
 * Verb-ish trailing segments — `/quotes/{id}/send` is an action on a quote, not
 * a `send` resource. Anything here collapses into its parent resource.
 */
const ACTION_SEGMENTS = new Set([
  "accept",
  "activate",
  "archive",
  "attach",
  "cancel",
  "complete",
  "confirm",
  "decline",
  "deactivate",
  "detach",
  "disable",
  "duplicate",
  "enable",
  "expire",
  "export",
  "import",
  "preview",
  "publish",
  "refund",
  "reindex",
  "reorder",
  "reset",
  "resend",
  "restore",
  "retry",
  "send",
  "snapshot",
  "sync",
  "test",
  "unpublish",
  "validate",
  "view",
  "void",
])

/**
 * Inspect admin write coverage across modules.
 *
 * @param modules Array of `{ packageName, unitId, tools: [{ id, name, risk }],
 *   adminWriteOperations: [{ method, path }] }`.
 * @param options.allowlist Map of `resourceKey` -> `{ rationale }` for
 *   resources that deliberately have no Tool.
 */
export function inspectAgentWriteCoverage(modules, options = {}) {
  const allowlist = options.allowlist ?? new Map()
  const diagnostics = []
  const rows = []
  const usedAllowlistKeys = new Set()

  for (const module of [...modules].sort(compareModules)) {
    const resources = new Map()
    for (const operation of module.adminWriteOperations ?? []) {
      const key = resourceKey(operation.path)
      if (!key) continue
      const entry = resources.get(key) ?? { key, methods: new Set() }
      entry.methods.add(operation.method.toLowerCase())
      resources.set(key, entry)
    }

    // Only write-capable Tools can cover a write resource. Counting reads was
    // the first version of this check, and it declared notification templates
    // "covered" by list/get — the precise gap it exists to catch.
    const toolTokens = dedupeByName(module.tools ?? [])
      .filter((tool) => isWriteTool(tool))
      .map((tool) => ({ name: tool.name, tokens: tokenize(tool.name) }))

    for (const resource of [...resources.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      const allowKey = `${module.unitId}:${resource.key}`
      const allowed = allowlist.get(allowKey)
      const covering = toolTokens.filter((tool) => coversResource(tool.tokens, resource.key))

      if (allowed) {
        usedAllowlistKeys.add(allowKey)
        if (covering.length > 0) {
          diagnostics.push(
            `${module.unitId}: ${resource.key} is allowlisted as having no Tool, but ${covering[0].name} covers it — drop the allowlist entry`,
          )
        }
        if (!nonEmpty(allowed.rationale)) {
          diagnostics.push(`${allowKey}: allowlist entry requires a non-empty rationale`)
        }
        rows.push({ ...rowFor(module, resource), posture: "allowlisted", tools: [] })
        continue
      }

      if (covering.length === 0) {
        rows.push({ ...rowFor(module, resource), posture: "uncovered", tools: [] })
        continue
      }

      rows.push({
        ...rowFor(module, resource),
        posture: "covered",
        tools: covering.map((tool) => tool.name).sort(),
      })
    }
  }

  for (const key of allowlist.keys()) {
    if (!usedAllowlistKeys.has(key)) {
      diagnostics.push(`${key}: allowlist entry matches no admin write resource — remove it`)
    }
  }

  return { diagnostics, rows }
}

/**
 * Ratchet the uncovered count per module.
 *
 * 463 admin write resources have no Tool today. That backlog is the point of
 * the report, but it cannot be a blocking gate without 463 allowlist entries
 * that nobody would read. Instead each module carries a baseline that may only
 * fall: a new uncovered resource fails the build, and closing a gap without
 * lowering the baseline fails too, so the number tracks reality.
 */
export function checkAgentWriteCoverageRatchet(rows, baseline) {
  const diagnostics = []
  const counts = new Map()
  for (const row of rows) {
    if (row.posture !== "uncovered") continue
    counts.set(row.unitId, (counts.get(row.unitId) ?? 0) + 1)
  }

  for (const [unitId, count] of [...counts.entries()].sort()) {
    const allowed = baseline[unitId]
    if (allowed === undefined) {
      diagnostics.push(
        `${unitId}: ${count} admin write resource(s) have no Tool and the module has no baseline — expose them, or record the baseline`,
      )
      continue
    }
    if (count > allowed) {
      const added = rows
        .filter((row) => row.unitId === unitId && row.posture === "uncovered")
        .map((row) => row.resource)
      diagnostics.push(
        `${unitId}: ${count} admin write resource(s) have no Tool, above the baseline of ${allowed}. An operator can write these but an agent cannot: ${added.join(", ")}`,
      )
    }
  }

  for (const [unitId, allowed] of Object.entries(baseline).sort()) {
    const count = counts.get(unitId) ?? 0
    if (count < allowed) {
      diagnostics.push(
        `${unitId}: only ${count} uncovered admin write resource(s) remain, below the baseline of ${allowed} — lower the baseline to ${count} so it cannot drift back`,
      )
    }
  }

  return diagnostics
}

/**
 * Reduce an admin path to a stable resource key: drop the version/surface
 * prefix and path parameters, collapse trailing action verbs, and singularize.
 * `/v1/admin/quotes/quotes/{id}/products` -> `quote/product`.
 */
export function resourceKey(pathname) {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("{"))
    .filter((segment) => !IGNORED_SEGMENTS.has(segment))
    .map((segment) => segment.toLowerCase())

  while (segments.length > 0 && ACTION_SEGMENTS.has(segments[segments.length - 1])) {
    segments.pop()
  }
  if (segments.length === 0) return undefined

  // A module mounted at its own name repeats it (`/quotes/quotes`). The repeat
  // carries no extra meaning.
  const deduped = segments.filter(
    (segment, index) => index === 0 || segment !== segments[index - 1],
  )
  return deduped.map(singularize).join("/")
}

/**
 * A Tool is write-capable when it asks for a scope that is not a read. Scopes
 * are the authoritative declaration (`quotes:write`, `notifications:send`,
 * `bookings:cancel`); tool naming is not.
 */
function isWriteTool(tool) {
  const scopes = tool.requiredScopes ?? []
  return scopes.some((scope) => {
    const action = String(scope).split(":").pop()
    return action !== undefined && action !== "read"
  })
}

function dedupeByName(tools) {
  const seen = new Map()
  for (const tool of tools) {
    if (!seen.has(tool.name)) seen.set(tool.name, tool)
  }
  return [...seen.values()]
}

function coversResource(toolTokens, key) {
  // The resource's own noun is the last segment; a Tool covers the resource
  // when it names that noun. `/quote/product` needs a Tool about products, not
  // merely one about quotes, or add_quote_product's absence would hide behind
  // create_quote.
  const segments = key.split("/")
  const noun = segments[segments.length - 1]
  const nounTokens = noun.split("-").map(singularize).filter(Boolean)
  return nounTokens.every((token) => toolTokens.includes(token))
}

function tokenize(name) {
  return String(name ?? "")
    .split(/[_\-\s]+/)
    .map((token) => singularize(token.toLowerCase()))
    .filter(Boolean)
}

function singularize(word) {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`
  if (word.endsWith("sses") || word.endsWith("ches") || word.endsWith("shes")) {
    return word.slice(0, -2)
  }
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1)
  return word
}

function rowFor(module, resource) {
  return {
    packageName: module.packageName,
    unitId: module.unitId,
    resource: resource.key,
    methods: [...resource.methods].sort(),
  }
}

/** Pull admin write operations out of a package's committed OpenAPI documents. */
export function adminWriteOperationsFromDocuments(documents) {
  const operations = []
  for (const document of documents) {
    for (const [pathname, pathItem] of Object.entries(document?.paths ?? {})) {
      if (!pathItem || typeof pathItem !== "object") continue
      for (const method of Object.keys(pathItem)) {
        if (!WRITE_METHODS.has(method.toLowerCase())) continue
        operations.push({ method: method.toLowerCase(), path: pathname })
      }
    }
  }
  return operations
}

export function formatAgentWriteCoverageMarkdown(rows) {
  const lines = [
    "| Module | Resource | Methods | Posture | Tools |",
    "| --- | --- | --- | --- | --- |",
  ]
  for (const row of rows) {
    lines.push(
      `| ${row.unitId} | ${row.resource} | ${row.methods.join(", ").toUpperCase()} | ${row.posture} | ${row.tools.join(", ") || "—"} |`,
    )
  }
  return `${lines.join("\n")}\n`
}

function compareModules(left, right) {
  return left.unitId.localeCompare(right.unitId)
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0
}
