import type { VoyantGraphRouteMethod } from "@voyant-travel/core/project"
import {
  buildModulePathOwnership,
  type GenerateOpenApiOptions,
  generateOpenApiDocument,
  type LazyMount,
  type ModuleMount,
  mergeLazyOpenApiPaths,
  type OpenApiDocument,
  stampModuleMetadata,
} from "@voyant-travel/hono/openapi"

import { resolveVoyantGraphRouteMountPath } from "./runtime-composition.js"
import type { VoyantGraphRuntime, VoyantGraphRuntimeUnitLoader } from "./runtime-lowering.js"

const HTTP_METHODS = new Set(["delete", "get", "head", "options", "patch", "post", "put", "trace"])

type OpenApiSourceApp = Parameters<typeof generateOpenApiDocument>[0] & {
  lazyMounts?: readonly LazyMount[]
  moduleMounts?: readonly ModuleMount[]
}

export interface BuildSelectedGraphOpenApiDocumentsInput {
  runtime: Pick<
    VoyantGraphRuntime,
    "modules" | "extensions" | "plugins" | "adapters" | "providerUnits"
  >
  app: OpenApiSourceApp
  options: GenerateOpenApiOptions
}

interface OpenApiClaim {
  document: string
  mount: string
  route: VoyantGraphRuntimeUnitLoader["routes"][number]["route"]
  unit: VoyantGraphRuntimeUnitLoader
}

/**
 * Emit one OpenAPI document for each opted-in API bundle in the selected graph.
 * This entry point is build-time only and is intentionally excluded from the
 * framework runtime barrel.
 */
export async function buildSelectedGraphOpenApiDocuments(
  input: BuildSelectedGraphOpenApiDocumentsInput,
): Promise<Map<string, OpenApiDocument>> {
  const eager = generateOpenApiDocument(input.app, input.options)
  const merged = await mergeLazyOpenApiPaths(eager, input.app.lazyMounts ?? [], input.options)
  const ownership = await buildModulePathOwnership(input.app.moduleMounts ?? [], input.options)
  const source = stampModuleMetadata(merged, ownership)
  const claims = collectClaims(input.runtime)

  const claimedOperations = new Map<string, OpenApiClaim>()
  const documents = new Map<string, OpenApiDocument>()
  for (const claim of claims) {
    const paths: Record<string, unknown> = {}
    let operationCount = 0

    for (const [path, pathItem] of Object.entries(source.paths ?? {})) {
      if (!isRecord(pathItem)) continue

      const selectedItem: Record<string, unknown> = {}
      let selectedOperationCount = 0
      for (const [key, value] of Object.entries(pathItem)) {
        const method = key.toLowerCase()
        if (!HTTP_METHODS.has(method)) {
          selectedItem[key] = value
          continue
        }
        if (!isRecord(value) || !routeClaimsMethod(claim, method)) continue

        const explicitApiId = value["x-voyant-api-id"]
        if (typeof explicitApiId === "string" && explicitApiId !== claim.route.id) continue
        if (claim.mount === "/" && explicitApiId !== claim.route.id) continue
        if (!isWithinMount(path, claim.mount) && explicitApiId !== claim.route.id) continue

        const operation = `${method.toUpperCase()} ${path}`
        const previous = claimedOperations.get(operation)
        if (previous) {
          throw new Error(
            `Selected graph OpenAPI path "${path}" method "${method.toUpperCase()}" is claimed by both "${previous.route.id}" (${previous.document}) and "${claim.route.id}" (${claim.document}).`,
          )
        }
        claimedOperations.set(operation, claim)

        operationCount += 1
        selectedOperationCount += 1
        selectedItem[key] = {
          ...value,
          "x-voyant-api-id": claim.route.id,
          "x-voyant-unit-id": claim.unit.id,
          "x-voyant-package-name": claim.unit.packageName,
          "x-voyant-key-kind": keyKindForPath(claim, path),
        }
      }

      if (selectedOperationCount === 0) continue
      paths[path] = selectedItem
    }

    if (operationCount === 0) {
      throw new Error(
        `Selected graph OpenAPI bundle "${claim.route.id}" (${claim.document}) matched zero operations at "${claim.mount}".`,
      )
    }

    const existingPaths = documents.get(claim.document)?.paths ?? {}
    documents.set(claim.document, {
      ...source,
      paths: mergeDocumentPaths(existingPaths, paths),
    } as OpenApiDocument)
  }

  const unclaimed = documentOperationKeys(source).filter(
    ({ operation, path }) => isPublishedSurfacePath(path) && !claimedOperations.has(operation),
  )
  if (unclaimed.length > 0) {
    throw new Error(
      `Selected graph OpenAPI has unclaimed published operations: ${unclaimed
        .map(({ operation }) => operation)
        .join(", ")}.`,
    )
  }

  return documents
}

/** Compose selected package documents into the deployment aggregate. */
export function mergeSelectedGraphOpenApiDocuments(
  documents: ReadonlyMap<string, OpenApiDocument>,
): OpenApiDocument {
  const entries = [...documents.entries()]
  const first = entries[0]?.[1]
  if (!first) {
    throw new Error("Selected graph OpenAPI emitted no documents.")
  }

  const paths: Record<string, unknown> = {}
  const owners = new Map<string, string>()
  for (const [documentName, document] of entries) {
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      if (!isRecord(pathItem)) continue
      const current = isRecord(paths[path]) ? paths[path] : {}
      const merged = { ...current }
      for (const [key, value] of Object.entries(pathItem)) {
        if (!HTTP_METHODS.has(key.toLowerCase())) {
          if (!(key in merged)) merged[key] = value
          continue
        }
        const operation = `${key.toUpperCase()} ${path}`
        const previous = owners.get(operation)
        if (previous) {
          throw new Error(
            `Selected graph OpenAPI operation "${operation}" is emitted by both "${previous}" and "${documentName}".`,
          )
        }
        owners.set(operation, documentName)
        merged[key] = value
      }
      paths[path] = merged
    }
  }

  return { ...first, paths } as OpenApiDocument
}

function collectClaims(
  runtime: Pick<VoyantGraphRuntime, "modules" | "extensions" | "plugins"> & {
    adapters?: VoyantGraphRuntime["adapters"]
    providerUnits?: VoyantGraphRuntime["providerUnits"]
  },
): OpenApiClaim[] {
  return [
    ...runtime.modules,
    ...runtime.extensions,
    ...runtime.plugins,
    ...(runtime.adapters ?? []),
    ...(runtime.providerUnits ?? []),
  ]
    .flatMap((unit) =>
      unit.routes.flatMap(({ route }) =>
        route.openapi
          ? [
              {
                document: route.openapi.document,
                mount: resolveVoyantGraphRouteMountPath(unit, route),
                route,
                unit,
              },
            ]
          : [],
      ),
    )
    .sort(
      (left, right) =>
        left.document.localeCompare(right.document) || left.route.id.localeCompare(right.route.id),
    )
}

function mergeDocumentPaths(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing }
  for (const [path, pathItem] of Object.entries(incoming)) {
    const current = merged[path]
    merged[path] = isRecord(current) && isRecord(pathItem) ? { ...current, ...pathItem } : pathItem
  }
  return merged
}

/**
 * The published key-kind for one operation (voyant#4625).
 *
 * Derived from the SAME `publishable`/`guardedIntake` declaration the capability
 * middleware enforces, resolved against the same mount, so the document a client
 * reads and the middleware that answers it cannot disagree. Hand-stamping the
 * committed specs instead would have produced exactly that drift — a contract
 * saying "publishable" over a runtime that returns 403.
 *
 * `secret` is the value for anything undeclared, matching the middleware's
 * fail-closed default: a route nobody classified is documented as
 * secret-key-only rather than left blank for a reader to assume the safer of
 * the two.
 */
function keyKindForPath(claim: OpenApiClaim, path: string): "publishable" | "secret" {
  // Only the public surface accepts a storefront key at all, and composition
  // drops `publishable` on anything else — so a stray declaration on an admin
  // bundle must not document a reach the runtime does not grant.
  if (claim.route.surface !== "public") return "secret"
  // Unchallenged intake is publishable only on a deployment that configured a
  // guard, which no document can know. The narrower of the two claims is the
  // honest one to publish.
  if (matchesDeclaration(claim.route.guardedIntake, claim.mount, path)) return "secret"
  return matchesDeclaration(claim.route.publishable, claim.mount, path) ? "publishable" : "secret"
}

/** Whether `path` falls under a `boolean | string[]` declaration on `mount`. */
function matchesDeclaration(
  declaration: boolean | readonly string[] | undefined,
  mount: string,
  path: string,
): boolean {
  if (!declaration) return false
  const covered =
    declaration === true
      ? [mount]
      : declaration.map((entry) => {
          const relative = entry.trim().replace(/^\/+|\/+$/g, "")
          if (!relative) return mount
          return mount === "/" ? `/${relative}` : `${mount}/${relative}`
        })
  return covered.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function routeClaimsMethod(claim: OpenApiClaim, method: string): boolean {
  return (
    !claim.route.methods ||
    claim.route.methods.includes(method.toUpperCase() as VoyantGraphRouteMethod)
  )
}

function isWithinMount(path: string, mount: string): boolean {
  return mount === "/" || path === mount || path.startsWith(`${mount}/`)
}

function isPublishedSurfacePath(path: string): boolean {
  return path.startsWith("/v1/admin/") || path.startsWith("/v1/public/")
}

function documentOperationKeys(
  document: OpenApiDocument,
): Array<{ operation: string; path: string }> {
  const operations: Array<{ operation: string; path: string }> = []
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!isRecord(pathItem)) continue
    for (const method of Object.keys(pathItem)) {
      if (HTTP_METHODS.has(method.toLowerCase())) {
        operations.push({ operation: `${method.toUpperCase()} ${path}`, path })
      }
    }
  }
  return operations
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
