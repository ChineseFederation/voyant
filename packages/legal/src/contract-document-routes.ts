/**
 * Contract-document HTTP routes, owned by the legal module.
 *
 *   GET    /v1/admin/documents/files/*
 *
 * This route streams private document bytes from the deployment's document storage — used
 * as the authenticated download fallback for environments where object storage
 * isn't backed by a real S3 SigV4 signer.
 *
 * These shapes (validation, status codes, headers, the scriptable-mime safety,
 * the path-traversal-safe key parser) are framework logic and live here. The
 * deployment supplies the document storage resolver and MIME guesser via
 * `ContractDocumentRoutesOptions`.
 *
 * The routes are mounted at absolute paths (the family spans multiple prefixes),
 * so a deployment composes them via `lazyRoutes` using
 * `CONTRACT_DOCUMENT_ROUTE_PATHS`.
 */
import { OpenAPIHono } from "@hono/zod-openapi"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import type { Context } from "hono"
import { legalContractDocumentRuntimePort } from "./contract-document-runtime-port.js"

/** Minimal structural view of the deployment's document storage backend. */
export interface ContractDocumentStorageLike {
  get(key: string): Promise<ArrayBuffer | null>
}

export interface ContractDocumentDelivery {
  url: string
  filename: string
  contentType: string | null
}

/**
 * Deployment-supplied dependencies for the contract-document routes. Generic /
 * structural types keep the legal package free of operator types and
 * CloudflareBindings — the deployment casts `c.env` / `c.get("db")` to its own
 * concrete types inside these callbacks.
 */
export interface ContractDocumentRoutesOptions {
  /** Resolve a deployment-authorized download URL for a generated attachment. */
  resolveGeneratedDocument?(
    env: unknown,
    db: unknown,
    attachmentId: string,
  ): Promise<ContractDocumentDelivery | null>
  /**
   * Resolve the private document storage backend from the request env. Returns
   * `null` when storage isn't configured (→ 503).
   */
  resolveStorage(env: unknown): ContractDocumentStorageLike | null
  /** Best-effort MIME-type guess from a document key/path. */
  guessMimeType(key: string): string
}

/** Absolute path matchers for the deployment's `lazyRoutes.paths`. */
export const CONTRACT_DOCUMENT_ROUTE_PATHS = ["/v1/admin/documents/files/*"] as const

const SCRIPTABLE_MIME_TYPES = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/xhtml+xml",
  "application/xml",
  "image/svg+xml",
  "text/ecmascript",
  "text/html",
  "text/javascript",
  "text/xml",
])

function maybeString(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function safeAsciiFilename(filename: string | null | undefined) {
  const normalized = maybeString(filename)
  if (!normalized) return "document"

  const safe = normalized
    .normalize("NFKD")
    .replace(/[^\w .-]+/g, "-")
    .replace(/[\r\n"\\]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)

  return safe || "document"
}

function contentDispositionForKey(key: string) {
  return `attachment; filename="${safeAsciiFilename(key.split("/").filter(Boolean).at(-1))}"`
}

function normalizedMimeType(contentType: string | null | undefined) {
  const value = maybeString(contentType)
  if (!value) return null
  return value.split(";")[0]?.trim().toLowerCase() || null
}

function isScriptableMimeType(contentType: string | null | undefined) {
  const normalized = normalizedMimeType(contentType)
  return normalized ? SCRIPTABLE_MIME_TYPES.has(normalized) : false
}

function safeServedContentType(guessMimeType: (key: string) => string, key: string) {
  const guessed = guessMimeType(key)
  return isScriptableMimeType(guessed) ? "application/octet-stream" : guessed
}

function parseDocumentKey(path: string) {
  const rawKey = path.replace(/^\/v1\/admin\/documents\/files\//, "")
  if (!rawKey) return null

  const segments: string[] = []
  for (const rawSegment of rawKey.split("/")) {
    if (!rawSegment) return null
    let segment: string
    try {
      segment = decodeURIComponent(rawSegment)
    } catch {
      return null
    }
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes("\0")
    ) {
      return null
    }
    segments.push(segment)
  }

  return segments.join("/")
}

// `/v1/admin/documents/files/*` is an admin-only raw download served
// via `new Response`; it stays a plain `.get(...)` wildcard on the same
// `OpenAPIHono` (catch-all path keys aren't expressible as a published OpenAPI
// JSON operation), so it keeps working at runtime without polluting the spec.

/**
 * Build the contract-document routes (absolute paths). A deployment composes
 * these via `lazyRoutes` and supplies the storage resolver and MIME guesser.
 */
export function createContractDocumentRoutes(options: ContractDocumentRoutesOptions) {
  const { resolveStorage, guessMimeType } = options
  const hono = new OpenAPIHono({ defaultHook: openApiValidationHook })

  // GET /v1/admin/documents/files/* — admin-only stream of private
  // documents bytes from the document storage. Used as the fallback
  // download target for environments where object storage isn't backed by a
  // real S3 SigV4 signer. Auth is the standard staff guard inherited from
  // `/v1/admin/*` middleware in createApp. Served via `new Response`; a
  // catch-all path isn't a publishable OpenAPI operation, so it stays a plain
  // wildcard handler on this OpenAPIHono instance.
  hono.get("/v1/admin/documents/files/*", async (c: Context) => {
    const storage = resolveStorage(c.env)
    if (!storage) {
      return c.json({ error: "Storage not configured" }, 503)
    }

    const key = parseDocumentKey(c.req.path)
    if (!key) return c.json({ error: "Invalid document key" }, 400)

    const buffer = await storage.get(key)
    if (!buffer) return c.json({ error: "Not found" }, 404)

    const headers = new Headers()
    headers.set("Content-Type", safeServedContentType(guessMimeType, key))
    headers.set("X-Content-Type-Options", "nosniff")
    headers.set("Cache-Control", "private, no-store")
    headers.set("Content-Length", String(buffer.byteLength))
    headers.set("Content-Disposition", contentDispositionForKey(key))

    return new Response(buffer, { headers })
  })

  return hono
}

/** Package-owned module descriptor; deployments inject document storage. */
export function createContractDocumentApiModule(options: ContractDocumentRoutesOptions): ApiModule {
  return {
    module: { name: "contract-document" },
    lazyRoutes: {
      paths: CONTRACT_DOCUMENT_ROUTE_PATHS,
      load: async () => createContractDocumentRoutes(options),
    },
  }
}

export const createContractDocumentVoyantRuntime = defineGraphRuntimeFactory(async ({ getPort }) =>
  createContractDocumentApiModule(await getPort(legalContractDocumentRuntimePort)),
)
