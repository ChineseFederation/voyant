/**
 * Shared derivation for the PK/SK capability line as it appears in the
 * published OpenAPI documents (voyant#4625 §1).
 *
 * One module derives the answer; the generator writes it and the checker
 * re-derives and compares. Two implementations of "which key may call this"
 * would be exactly the drift the capability line exists to prevent, so there is
 * deliberately only one.
 *
 * The source of truth is the resolved deployment graph — the same
 * `publishable` / `guardedIntake` declarations the runtime middleware reads —
 * never the documents themselves.
 */

const HTTP_METHODS = new Set([
  "connect",
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
])

export const KEY_KIND_EXTENSION = "x-voyant-key-kind"

/** Mirrors `resolveVoyantGraphRouteMountPath` in @voyant-travel/framework. */
export function resolveMountPath(unit, bundle) {
  if (bundle.mount?.startsWith("/v1/")) return normalizeAbsolute(bundle.mount)
  const segment = bundle.mount ?? unit.localId ?? unit.id?.split("#").at(-1) ?? unit.id
  const mount = String(segment).replace(/^\/+|\/+$/g, "")
  if (bundle.surface === "admin") return appendPath("/v1/admin", mount)
  if (bundle.surface === "public") return appendPath("/v1/public", mount)
  if (bundle.surface === "webhook") return appendPath("/v1", mount)
  return `/${mount}`
}

function normalizeAbsolute(value) {
  return value === "/" ? value : value.replace(/\/+$/g, "")
}

function appendPath(mount, relative) {
  return relative ? `${normalizeAbsolute(mount)}/${relative}` : normalizeAbsolute(mount)
}

/** Absolute paths covered by a `true | string[]` declaration on `mount`. */
function coveredPaths(declaration, mount) {
  if (!declaration) return []
  if (declaration === true) return [mount]
  return declaration.map((entry) => {
    const relative = String(entry)
      .trim()
      .replace(/^\/+|\/+$/g, "")
    if (!relative) return mount
    return mount === "/" ? `/${relative}` : `${mount}/${relative}`
  })
}

function coversPath(prefixes, path) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * Every API bundle the graph selected, with its resolved mount and posture.
 * Adapters, plugins and provider units contribute routes exactly like modules
 * do, so all of them are read — a bundle this misses is a route the checker
 * would silently declare covered.
 */
export function readApiBundles(graph) {
  const units = [
    ...(graph.modules ?? []),
    ...(graph.extensions ?? []),
    ...(graph.plugins ?? []),
    ...(graph.adapters ?? []),
    ...(graph.providers ?? []),
  ]
  const bundles = []
  for (const unit of units) {
    for (const bundle of unit.api ?? []) {
      bundles.push({
        unitId: unit.id,
        apiId: bundle.id,
        surface: bundle.surface,
        document: bundle.openapi?.document ?? null,
        mount: resolveMountPath(unit, bundle),
        publishable: bundle.publishable,
        guardedIntake: bundle.guardedIntake,
      })
    }
  }
  return bundles
}

/**
 * The key kind an absolute path resolves to.
 *
 * `secret` is the answer for anything undeclared, matching the middleware's
 * fail-closed default. Unchallenged intake also publishes as `secret`: whether
 * a publishable key may reach it depends on a deployment having wired an intake
 * guard, which no published document can know, and the narrower of two possible
 * answers is the honest one to print.
 */
export function keyKindForPath(bundles, path) {
  for (const bundle of bundles) {
    if (bundle.surface !== "public") continue
    if (coversPath(coveredPaths(bundle.guardedIntake, bundle.mount), path)) return "secret"
  }
  for (const bundle of bundles) {
    if (bundle.surface !== "public") continue
    if (coversPath(coveredPaths(bundle.publishable, bundle.mount), path)) return "publishable"
  }
  return "secret"
}

/** Documented operations on a published surface, in document order. */
export function publishedOperations(document) {
  const operations = []
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    if (!item || typeof item !== "object") continue
    if (!path.startsWith("/v1/admin/") && !path.startsWith("/v1/public/")) continue
    for (const [method, operation] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue
      if (!operation || typeof operation !== "object") continue
      operations.push({ path, method: method.toLowerCase(), operation })
    }
  }
  return operations
}
