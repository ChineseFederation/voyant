/**
 * What counts as an OpenAPI document in this repository, in one place.
 *
 * `check-openapi-dialect.mjs` and `check-openapi-document-closure.mjs` both have
 * to enumerate the same set, and they answer complementary questions about it —
 * is each document the kind of thing it claims to be, and is each one accounted
 * for by a registry. Two copies of the pattern would let one checker see a
 * document the other does not, which is precisely the silent gap the closure
 * check exists to remove.
 */
import path from "node:path"

import { trackedFilesIn } from "../../lib/tracked-files.mjs"

/** `packages/<pkg>/openapi/<surface>/<name>.json`, and the same under `apps/`. */
export const DOCUMENT = /^(?:packages|apps)\/[^/]+\/openapi\/[^/]+\/[^/]+\.json$/

/**
 * Tracked OpenAPI documents under `root`, sorted, or **null** when `root` is not
 * a git toplevel — see `trackedFilesIn` for why that distinction is load-bearing.
 *
 * @param {string} root
 * @returns {string[] | null}
 */
export function trackedDocuments(root) {
  const tracked = trackedFilesIn(path.resolve(root))
  if (tracked === null) return null
  return tracked.filter((file) => DOCUMENT.test(file)).sort()
}
