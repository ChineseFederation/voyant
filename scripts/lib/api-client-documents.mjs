/**
 * Which OpenAPI documents a generated API client is typed from.
 *
 * Shared, never reimplemented. `generate-api-client.mjs` produces the client
 * from these documents and `check-api-client-capability.mjs` exercises the
 * PK/SK boundary against them; if the two resolved documents differently, the
 * checker would be proving a property of a surface the client is not generated
 * from — which looks exactly like success.
 *
 * The same argument `keyKindForPath` carries for the capability line: one
 * answer, or the agreement is a coincidence.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { trackedFilesIn } from "./tracked-files.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

/**
 * The documents a client is generated from: one named outright, or every
 * document on a surface.
 *
 * Read from the TRACKED listing rather than the filesystem, so a git worktree
 * parked in the repository root cannot contribute another checkout's documents
 * to this one's client — the false green that `trackedFilesIn` exists to
 * prevent.
 */
export function resolveDocuments(client) {
  if (client.document) return [client.document]
  return surfaceDocuments(client.surface)
}

/**
 * The surface a client belongs to, however it names its inputs.
 *
 * A client may select by surface or name one document outright; either way it
 * is a client FOR a surface, and `packages/<pkg>/openapi/<surface>/<name>.json`
 * says which. Kept separate from `resolveDocuments` because coverage has to ask
 * what the surface serves without asking the client — otherwise the answer is
 * whatever the client already covers.
 */
export function surfaceOf(client) {
  if (client.surface) return client.surface
  const match = /^packages\/[^/]+\/openapi\/([^/]+)\//.exec(client.document ?? "")
  if (!match) throw new Error(`api-clients.json: cannot derive a surface for ${client.outDir}`)
  return match[1]
}

/** Every tracked document on a surface. */
export function surfaceDocuments(surface) {
  const tracked = trackedFilesIn(root) ?? []
  const pattern = new RegExp(`^packages/[^/]+/openapi/${surface}/[^/]+\\.json$`)
  return tracked.filter((file) => pattern.test(file)).sort()
}

/**
 * One document standing for a whole surface, merged from its per-package parts.
 *
 * Keyed by URL, which is the thing that does not move. Per-package modules key
 * the client by *document*, and documents move: voyant#4627 relocated the
 * Trip-selection routes from `public-api` to `trips` without changing a single
 * URL, and customer-portal is queued to do the same. Every such move would be a
 * breaking change to a published subpath export, for a reason no caller can see.
 *
 * Safe to merge, verified rather than assumed: across the 22 public documents
 * there are 138 distinct paths with **no** duplicate keys, and 10 schema names
 * with no two disagreeing on shape. A collision would silently drop an operation
 * here, so it is checked rather than trusted.
 *
 * `info`/`servers` come from the surface's own composition document — the parts
 * each carry their own and merging them would be arbitrary.
 */
export function composeSurface(documents, client) {
  const paths = {}
  const schemas = {}
  for (const file of documents) {
    const parsed = JSON.parse(readFileSync(path.join(root, file), "utf8"))
    for (const [route, item] of Object.entries(parsed.paths ?? {})) {
      if (route in paths) {
        throw new Error(
          `generate:api-client: ${route} is declared by two documents on the ${client.surface} ` +
            `surface. Merging would drop one of them.`,
        )
      }
      paths[route] = item
    }
    for (const [name, schema] of Object.entries(parsed.components?.schemas ?? {})) {
      const existing = schemas[name]
      if (existing && JSON.stringify(existing) !== JSON.stringify(schema)) {
        throw new Error(
          `generate:api-client: two documents on the ${client.surface} surface define ` +
            `components.schemas.${name} with different shapes.`,
        )
      }
      schemas[name] = schema
    }
  }

  const base = JSON.parse(readFileSync(path.join(root, client.info), "utf8"))
  const composed = { openapi: base.openapi, info: base.info, paths }
  if (base.servers) composed.servers = base.servers
  if (Object.keys(schemas).length > 0) composed.components = { schemas }
  return composed
}

/**
 * The document a client is typed from: the composed surface when `compose` is
 * set, otherwise each part in turn.
 */
export function clientDocuments(client) {
  const parts = resolveDocuments(client)
  return { parts, documents: client.compose ? [composeSurface(parts, client)] : parts }
}
