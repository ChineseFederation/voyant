import { OpenAPIHono } from "@hono/zod-openapi"
import type { Hono } from "hono"

import type { LazyRoutesLoader } from "./lazy-routes.js"

/**
 * OpenAPI document generation for composed Voyant apps (voyant#2114).
 *
 * The app returned by `createApp`/`mountApp` is an `OpenAPIHono` under the hood
 * (typed as `Hono` for callers), so the helpers here cast to reach
 * `getOpenAPIDocument`. Only routes authored via `createRoute(...).openapi(...)`
 * contribute operations — plain routes are absent until migrated.
 *
 * Import these from `@voyant-travel/hono/openapi`, never from the package
 * barrel: `getOpenAPIDocument` pulls in `@asteasolutions/zod-to-openapi`, which
 * must stay out of the Worker runtime bundle. This module is meant for
 * build-time generation only.
 */

export interface OpenApiInfo {
  title: string
  version: string
  description?: string
  /** OpenAPI spec extension fields (`x-*`), matching the doc's `InfoObject`. */
  [extension: `x-${string}`]: unknown
}

export interface OpenApiServer {
  url: string
  description?: string
  [extension: `x-${string}`]: unknown
}

export interface GenerateOpenApiOptions {
  info: OpenApiInfo
  servers?: OpenApiServer[]
}

// biome-ignore lint/suspicious/noExplicitAny: accepts any composed app, regardless of its Env/Schema/BasePath; narrowed to OpenAPIHono below.
type AnyApp = Hono<any, any, any>

/**
 * An OpenAPI 3.1 document, as produced by `OpenAPIHono`. Named via the direct
 * dependency's method type so the inferred type stays portable (TS2883).
 */
export type OpenApiDocument = ReturnType<OpenAPIHono["getOpenAPI31Document"]>

/**
 * Generate a single OpenAPI 3.1 document covering every `.openapi()` route
 * mounted on the composed app, with module base paths already merged in
 * (honojs/middleware#952).
 */
export function generateOpenApiDocument(
  app: AnyApp,
  options: GenerateOpenApiOptions,
): OpenApiDocument {
  // The composed app is an `OpenAPIHono` (built in `mountApp`) presented to
  // callers as `Hono`; this build-time seam narrows it back to read the doc.
  const oapi = app as OpenAPIHono
  return oapi.getOpenAPI31Document({
    openapi: "3.1.0",
    info: options.info,
    ...(options.servers ? { servers: options.servers } : {}),
  })
}

/**
 * Voyant's two published API surfaces, keyed by path prefix. Admin routes mount
 * under `/v1/admin/*` and storefront/public routes under `/v1/public/*`; the
 * legacy `/v1/*` surface is intentionally excluded from the published docs.
 */
export type ApiSurface = "admin" | "public-api"

const SURFACE_PREFIX: Record<ApiSurface, string> = {
  admin: "/v1/admin",
  "public-api": "/v1/public",
}

/**
 * Narrow a composed document to a single surface by path prefix, producing the
 * `framework-admin` / `framework-storefront` documents that replace the
 * hand-authored specs. Components are carried over verbatim (the generator may
 * over-include shared component schemas, which is harmless).
 */
export function selectSurface(doc: OpenApiDocument, surface: ApiSurface): OpenApiDocument {
  const prefix = SURFACE_PREFIX[surface]
  const paths = Object.fromEntries(
    Object.entries(doc.paths ?? {}).filter(([path]) => path.startsWith(prefix)),
  )
  return { ...doc, paths }
}

/**
 * A lazy-mounted route family recorded by `mountApp` for build-time spec
 * merging. `prefix` is the absolute surface mount (`/v1/admin/<name>`,
 * `/v1/public/...`) for relative-route loaders, or `"/"` for absolute
 * `lazyRoutes` loaders. `load` is the same loader the runtime dispatcher caches
 * — it constructs (but does not serve) the sub-app via `import(...)`.
 */
export interface LazyMount {
  prefix: string
  load: LazyRoutesLoader
}

/**
 * A single module route mount recorded by `mountApp` for build-time per-module
 * spec generation (voyant#2733). One module contributes several mounts (admin +
 * public, eager + lazy), all tagged with the same `moduleName` — so the module
 * boundary is the authoritative one from the registration, not a path-prefix
 * guess. `prefix` is the real absolute mount (base path included), so the
 * generated per-module doc carries correct absolute paths — including
 * `publicPath` overrides whose prefix isn't the module name (e.g. a module that
 * mounts its storefront routes under `/v1/public/booking-engine`). `load`
 * returns the sub-app without serving it (eager mounts wrap the already-built
 * app as `() => routes`; lazy mounts pass their loader).
 */
export interface ModuleMount {
  moduleName: string
  prefix: string
  load: () => AnyApp | Promise<AnyApp>
}

/** Detect an `OpenAPIHono` sub-app (carries the `.openapi()` route registry). */
function isOpenApiHono(value: unknown): value is OpenAPIHono {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { getOpenAPI31Document?: unknown }).getOpenAPI31Document === "function" &&
    "openAPIRegistry" in value
  )
}

/**
 * Eager-merge lazy route families into a generated base document (voyant#2114).
 *
 * Lazy families mount at runtime as wildcard dispatch stubs (see
 * `lazy-routes.ts`), so their `.openapi()` operations never reach the composed
 * `OpenAPIHono` registry and are invisible to `generateOpenApiDocument`. This
 * runs each loader at build time, and for any that return an `OpenAPIHono`,
 * re-mounts it into a throwaway `OpenAPIHono` at its real prefix — reusing the
 * exact prefix-merge semantics `OpenAPIHono.route(...)` applies to eager mounts
 * — then shallow-merges the resulting `paths` + `components.*` into `base`.
 *
 * Plain `Hono` sub-apps (no `.openapi()` routes) carry no registry and are
 * skipped without error. A loader that throws is skipped with a warning so one
 * bad family can't break generation. `base` wins on path/component collisions
 * (which shouldn't happen given distinct prefixes), with a dev-time warning.
 *
 * Build-time only — same module-level constraint as the rest of this file
 * (`@asteasolutions/zod-to-openapi` stays out of the Worker bundle).
 */
export async function mergeLazyOpenApiPaths(
  base: OpenApiDocument,
  mounts: readonly LazyMount[],
  options: GenerateOpenApiOptions,
): Promise<OpenApiDocument> {
  const throwaway = new OpenAPIHono()
  let mergedAny = false

  for (const { prefix, load } of mounts) {
    let subApp: unknown
    try {
      subApp = await load()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[voyant] openapi: lazy loader for "${prefix}" failed, skipping: ${message}`)
      continue
    }
    if (!isOpenApiHono(subApp)) {
      // Plain Hono (or anything without the registry) contributes no docs.
      continue
    }
    // `route("/", subApp)` reproduces what an absolute-path (`lazyRoutes`)
    // family does at runtime; a relative-surface loader merges at its prefix.
    throwaway.route(prefix === "/" ? "/" : prefix, subApp)
    mergedAny = true
  }

  if (!mergedAny) return base

  const lazyDoc = throwaway.getOpenAPI31Document({
    openapi: "3.1.0",
    info: options.info,
    ...(options.servers ? { servers: options.servers } : {}),
  })

  const paths: Record<string, unknown> = { ...(base.paths ?? {}) }
  for (const [path, item] of Object.entries(lazyDoc.paths ?? {})) {
    if (path in paths) {
      console.warn(
        `[voyant] openapi: lazy path "${path}" collides with an eager route; keeping eager.`,
      )
      continue
    }
    paths[path] = item
  }

  const merged: OpenApiDocument = { ...base, paths } as OpenApiDocument

  const lazyComponents = lazyDoc.components
  if (lazyComponents) {
    const baseComponents = (base.components ?? {}) as Record<string, Record<string, unknown>>
    const mergedComponents: Record<string, Record<string, unknown>> = {}
    const groups = new Set([...Object.keys(baseComponents), ...Object.keys(lazyComponents)])
    for (const group of groups) {
      const baseGroup = (baseComponents[group] ?? {}) as Record<string, unknown>
      const lazyGroup = (lazyComponents as Record<string, Record<string, unknown>>)[group] ?? {}
      const combined: Record<string, unknown> = { ...lazyGroup }
      for (const [key, value] of Object.entries(baseGroup)) {
        combined[key] = value // base wins
      }
      mergedComponents[group] = combined
    }
    ;(merged as { components?: unknown }).components = mergedComponents
  }

  return merged
}

/**
 * Generate one self-contained OpenAPI document per module from its recorded
 * mounts (voyant#2733).
 *
 * Instead of building one giant composed document and splitting it by path
 * prefix, this generates each module's spec directly from the routes the module
 * registered — the authoritative module boundary. Each module's admin + public
 * (+ lazy) sub-apps are re-mounted into a throwaway `OpenAPIHono` at their real
 * absolute prefix (reusing the exact prefix-merge `OpenAPIHono.route(...)`
 * applies), then its `getOpenAPI31Document()` is read. The returned docs are
 * self-contained (each carries its own referenced components), so they render
 * and diff cleanly on their own — unlike a 7 MB aggregate.
 *
 * A mount whose loader throws, or that returns a plain `Hono` with no
 * `.openapi()` registry, is skipped without failing the module. Modules that
 * contribute no documented operation are omitted from the result entirely.
 *
 * Build-time only — same constraint as the rest of this module
 * (`@asteasolutions/zod-to-openapi` must stay out of the Worker bundle).
 */
export async function generateModuleOpenApiDocuments(
  mounts: readonly ModuleMount[],
  options: GenerateOpenApiOptions,
): Promise<Map<string, OpenApiDocument>> {
  const byModule = new Map<string, ModuleMount[]>()
  for (const mount of mounts) {
    const list = byModule.get(mount.moduleName)
    if (list) list.push(mount)
    else byModule.set(mount.moduleName, [mount])
  }

  const result = new Map<string, OpenApiDocument>()
  for (const [moduleName, moduleMounts] of byModule) {
    const throwaway = new OpenAPIHono()
    let mountedAny = false
    for (const { prefix, load } of moduleMounts) {
      let subApp: unknown
      try {
        subApp = await load()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(
          `[voyant] openapi: module "${moduleName}" mount at "${prefix}" failed to load, skipping: ${message}`,
        )
        continue
      }
      if (!isOpenApiHono(subApp)) continue
      throwaway.route(prefix === "/" ? "/" : prefix, subApp)
      mountedAny = true
    }
    if (!mountedAny) continue

    const doc = throwaway.getOpenAPI31Document({
      openapi: "3.1.0",
      info: options.info,
      ...(options.servers ? { servers: options.servers } : {}),
    })
    if (!doc.paths || Object.keys(doc.paths).length === 0) continue
    result.set(moduleName, doc)
  }
  return result
}

/**
 * The module a path belongs to, given the authoritative owner map: the manifest
 * owner if known (which is what keeps `publicPath` overrides correct), else the
 * path's own module segment — `<seg>` in `/v1/admin/<seg>/...`,
 * `/v1/public/<seg>/...`, or `/v1/<seg>/...` (webhooks/legacy).
 */
function moduleNameForPath(path: string, owner: ReadonlyMap<string, string>): string {
  const known = owner.get(path)
  if (known) return known
  const parts = path.split("/").filter(Boolean) // ["v1","admin","bookings",...]
  const seg = parts[1] === "admin" || parts[1] === "public" ? parts[2] : parts[1]
  return seg ?? "misc"
}

/** The API surface a path is served on, or `null` for non-surface routes. */
function surfaceForPath(path: string): ApiSurface | null {
  if (path.startsWith("/v1/admin/")) return "admin"
  if (path.startsWith("/v1/public/")) return "public-api"
  return null
}

/**
 * Build the authoritative path → module ownership map from the mount manifest.
 *
 * Generates each module's isolated doc (see `generateModuleOpenApiDocuments`)
 * only to learn which real absolute paths it owns — so `publicPath` overrides
 * (whose prefix isn't the module name, e.g. `/v1/public/booking-engine`) map to
 * the right module. Routes the manifest doesn't record (`additionalRoutes`,
 * directly-mounted routes) are absent here and fall back to their path segment.
 *
 * Build-time only.
 */
export async function buildModulePathOwnership(
  mounts: readonly ModuleMount[],
  options: GenerateOpenApiOptions,
): Promise<Map<string, string>> {
  const moduleDocs = await generateModuleOpenApiDocuments(mounts, options)
  const owner = new Map<string, string>()
  for (const [moduleName, doc] of moduleDocs) {
    for (const path of Object.keys(doc.paths ?? {})) owner.set(path, moduleName)
  }
  return owner
}

/**
 * Partition a composed document into one document per module, covering EVERY
 * admin/storefront path (voyant#2733).
 *
 * Uses the ownership map as the authoritative module owner, falling back to the
 * path's own segment for anything the manifest doesn't claim.
 * The full surface is therefore partitioned exactly: every `/v1/admin/*` and
 * `/v1/public/*` path lands in exactly one module document. Non-surface routes
 * (`/v1/<name>` webhooks, legacy `/v1/*`) live only in the aggregate, as before.
 *
 * Each per-module document carries the aggregate's shared `components` verbatim
 * (there is ~one), so it stays a valid, self-contained OpenAPI document.
 */
export function partitionByModule(
  full: OpenApiDocument,
  owner: ReadonlyMap<string, string>,
): Map<string, OpenApiDocument> {
  const buckets = new Map<string, Record<string, unknown>>()
  for (const [path, item] of Object.entries(full.paths ?? {})) {
    if (!path.startsWith("/v1/admin/") && !path.startsWith("/v1/public/")) continue
    const moduleName = moduleNameForPath(path, owner)
    let bucket = buckets.get(moduleName)
    if (!bucket) {
      bucket = {}
      buckets.set(moduleName, bucket)
    }
    bucket[path] = item
  }

  const result = new Map<string, OpenApiDocument>()
  for (const [moduleName, paths] of buckets) {
    result.set(moduleName, {
      ...full,
      paths,
      ...(full.components ? { components: full.components } : {}),
    } as OpenApiDocument)
  }
  return result
}

/**
 * Convenience: build the ownership map and partition in one call. Prefer the
 * two-step `buildModulePathOwnership` + `partitionByModule` when you also want
 * to `stampModuleMetadata` the aggregate from the same map (so it's built once).
 *
 * Build-time only.
 */
export async function splitDocumentByModule(
  full: OpenApiDocument,
  mounts: readonly ModuleMount[],
  options: GenerateOpenApiOptions,
): Promise<Map<string, OpenApiDocument>> {
  return partitionByModule(full, await buildModulePathOwnership(mounts, options))
}

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const

/** PascalCase a path segment, splitting on non-alphanumerics (kebab, etc.). */
function pascalCase(segment: string): string {
  return segment
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")
}

/**
 * Stable camelCase operationId derived from method + path (voyant#2729) — gives
 * client generators readable, deterministic method names instead of guessing.
 * Path params render as `ByX`, the `v1` prefix is dropped:
 * `GET /v1/admin/bookings/{id}` → `getAdminBookingsById`. Method + path is unique
 * per OpenAPI, so the derived id is too (a numeric suffix guards edge cases).
 */
function deriveOperationId(method: string, path: string): string {
  const parts = path
    .split("/")
    .filter(Boolean)
    .filter((segment) => segment !== "v1")
    .map((segment) => {
      const param = /^\{(.+)\}$/.exec(segment)
      return param?.[1] ? `By${pascalCase(param[1])}` : pascalCase(segment)
    })
  return `${method}${parts.join("")}`
}

/**
 * A readable, always-correct operation summary (voyant#2729): the method + path
 * signature. Deliberately mechanical rather than guessed prose — a hand-authored
 * per-route `summary` overrides it (forward-only).
 */
function deriveSummary(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

/**
 * Stamp every operation with the metadata standard OpenAPI tooling expects
 * (voyant#2733 / voyant#2729). All fields are non-destructive — a value a route
 * already declares is never overwritten:
 *   - `operationId` — stable camelCase id from method + path, for readable
 *     generated client method names.
 *   - `summary` — the method + path signature, so viewers/linters have a title
 *     for every operation.
 *   - `tags: [module]` — so Swagger/Scalar group the sidebar by module (they
 *     key grouping off `tags` and ignore `x-*`).
 *   - `x-voyant-module` / `x-voyant-surface` — machine-readable owner + surface
 *     for custom tooling that shouldn't re-derive them from path prefixes.
 *
 * The module is the authoritative owner from the manifest, so `publicPath`
 * overrides are labelled with their real owning module rather than their mount
 * prefix. Applied to the aggregate before it's split, so the per-module and
 * surface documents (all derived from it) inherit the stamps. Keys are appended,
 * keeping order deterministic for the drift gate.
 */
export function stampModuleMetadata(
  doc: OpenApiDocument,
  owner: ReadonlyMap<string, string>,
): OpenApiDocument {
  const paths: Record<string, unknown> = {}
  // operationId must be unique across the document; track what we've assigned so
  // a derived id never collides. Pre-seed EVERY route-declared id up front —
  // otherwise a hand-authored id appearing later in iteration order than an
  // earlier op that derived the same string would slip through un-suffixed,
  // leaving duplicate ids in the output (declared ids always win; derived yield).
  const usedOperationIds = new Set<string>()
  for (const item of Object.values(doc.paths ?? {})) {
    if (!item || typeof item !== "object") continue
    for (const method of HTTP_METHODS) {
      const op = (item as Record<string, unknown>)[method]
      const declared =
        op && typeof op === "object" ? (op as Record<string, unknown>).operationId : null
      if (typeof declared === "string" && declared.length > 0) usedOperationIds.add(declared)
    }
  }
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!item || typeof item !== "object") {
      paths[path] = item
      continue
    }
    const moduleName = moduleNameForPath(path, owner)
    const surface = surfaceForPath(path)
    const nextItem: Record<string, unknown> = { ...(item as Record<string, unknown>) }
    for (const method of HTTP_METHODS) {
      const op = nextItem[method]
      if (!op || typeof op !== "object") continue
      const operation = op as Record<string, unknown>

      const declaredId =
        typeof operation.operationId === "string" && operation.operationId.length > 0
          ? operation.operationId
          : null
      let operationId = declaredId ?? deriveOperationId(method, path)
      if (!declaredId) {
        let suffix = 2
        while (usedOperationIds.has(operationId)) {
          operationId = `${deriveOperationId(method, path)}_${suffix++}`
        }
      }
      usedOperationIds.add(operationId)

      const hasSummary = typeof operation.summary === "string" && operation.summary.length > 0
      // Swagger/Scalar group by `tags` (and ignore `x-*`) — without one a
      // whole-surface document collapses under a single "default" group (#2733).
      const hasTags = Array.isArray(operation.tags) && operation.tags.length > 0

      nextItem[method] = {
        ...operation,
        operationId,
        ...(hasSummary ? {} : { summary: deriveSummary(method, path) }),
        ...(hasTags ? {} : { tags: [moduleName] }),
        "x-voyant-module": moduleName,
        ...(surface ? { "x-voyant-surface": surface } : {}),
      }
    }
    paths[path] = nextItem
  }
  return { ...doc, paths } as OpenApiDocument
}

export {
  diffOpenApiCoverage,
  type OpenApiCoverageDiff,
  type OperationKey,
} from "./openapi-coverage.js"
