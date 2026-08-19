import { keyKindForPath, publishedOperations } from "./openapi-key-kind.mjs"

const compareCodeUnits = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

const pascalCase = (segment) =>
  segment
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")

/** Mirrors the runtime OpenAPI stamp for operations without an authored ID. */
function derivedOperationId(method, path) {
  const parts = path
    .split("/")
    .filter(Boolean)
    .filter((segment) => segment !== "v1")
    .map((segment) => {
      const parameter = /^\{(.+)\}$/.exec(segment)
      return parameter?.[1] ? `By${pascalCase(parameter[1])}` : pascalCase(segment)
    })
  return `${method}${parts.join("")}`
}

/**
 * Canonical operation metadata for the generated Public API client.
 *
 * Identity, method, and path come from the same composed OpenAPI document that
 * produces the client types. Credential posture comes from the resolved graph.
 * Keeping the derivation here means a Theme requirement registry cannot become
 * another hand-maintained account of the HTTP surface.
 */
export function derivePublicApiOperationMetadata(document, bundles) {
  const sourceOperations = publishedOperations(document)
  const metadata = []
  const byId = new Map()

  // Authored IDs win. Pre-seeding them matches the runtime OpenAPI stamp: a
  // mechanically derived ID encountered earlier must yield to an authored ID
  // encountered later. Duplicate authored IDs are ambiguous and fail instead
  // of being silently renamed.
  for (const { path, method, operation } of sourceOperations) {
    const id = operation.operationId
    if (typeof id !== "string" || id.length === 0) continue
    const previous = byId.get(id)
    if (previous) {
      throw new Error(
        `generate:api-client: duplicate Public API operationId ${JSON.stringify(id)}: ` +
          `${previous.method} ${previous.path} and ${method.toUpperCase()} ${path}.`,
      )
    }
    byId.set(id, { method: method.toUpperCase(), path })
  }

  const usedIds = new Set(byId.keys())
  for (const { path, method, operation } of sourceOperations) {
    const authoredId = operation.operationId
    const hasAuthoredId = typeof authoredId === "string" && authoredId.length > 0
    const baseId = derivedOperationId(method, path)
    let id = hasAuthoredId ? authoredId : baseId
    if (!hasAuthoredId) {
      let suffix = 2
      while (usedIds.has(id)) id = `${baseId}_${suffix++}`
    }
    usedIds.add(id)
    const entry = {
      id,
      method: method.toUpperCase(),
      path,
      keyKind: keyKindForPath(bundles, path),
    }
    metadata.push(entry)
  }

  return metadata.sort((left, right) => compareCodeUnits(left.id, right.id))
}
