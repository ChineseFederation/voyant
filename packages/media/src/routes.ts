/**
 * agent-quality: file-size exception -- this admin surface is one cohesive route
 * family (assets + folders + membership + usage) sharing the same response
 * schemas and storage-injection seam; splitting it would scatter a single
 * media-library contract for a ~10-line overage (voyant#3555).
 *
 * `@voyant-travel/media` HTTP routes — the admin CRUD surface over the library
 * service, mounted under `/v1/admin/media-library/*`. Authored with
 * `@hono/zod-openapi` (mirrors the inventory `routes-media.ts` OpenAPIHono
 * style): each leg is a `createRoute(...).openapi(...)` on an `OpenAPIHono<Env>`
 * carrying the shared `openApiValidationHook`. Bodies/queries are validated
 * through `parseJsonBody` / `parseQuery` rather than reading the raw request.
 *
 * Routes stay thin: they validate input, resolve the runtime `"media"`
 * StorageProvider, call the service, and serialize. All business logic
 * (dedup, delete-in-use guard, folder membership, usage) lives in `./service`.
 *
 * Byte storage/serving is NOT reimplemented here: uploads go through the
 * injected StorageProvider, and raw-byte serving is owned by
 * `@voyant-travel/storage` (`createMediaRoutes` — `GET /v1/admin/media/*`). A
 * deployment resolves the provider via the storage runtime port
 * (`storageObjectRuntimePort` → `resolve("media")`) and passes it in through
 * `options.resolveStorage`.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook, parseJsonBody, parseQuery } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import type { StorageProvider } from "@voyant-travel/storage"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import type { MediaSiteClientAuthRuntime } from "./runtime-port.js"
import {
  addAssetToFolder,
  createMediaAsset,
  createMediaFolder,
  deleteMediaAsset,
  deleteMediaFolder,
  getMediaAsset,
  getMediaFolder,
  listAssetUsage,
  listMediaAssets,
  listMediaFolders,
  MediaError,
  recordAssetUsage,
  removeAssetFromFolder,
  updateMediaAsset,
  updateMediaFolder,
} from "./service.js"
import { createMediaSiteBridgeRoutes } from "./site-bridge.js"
import {
  createMediaAssetSchema,
  createMediaFolderSchema,
  folderMemberBodySchema,
  listAssetUsageQuerySchema,
  listMediaAssetsQuerySchema,
  listMediaFoldersQuerySchema,
  mediaAssetTypeSchema,
  recordAssetUsageSchema,
  updateMediaAssetSchema,
  updateMediaFolderSchema,
} from "./validation.js"

/** Absolute matchers for the media-library admin surface. */
export const MEDIA_LIBRARY_ROUTE_PATHS = ["/v1/admin/media-library/*"] as const

type Env = { Variables: { db: PostgresJsDatabase } }

/**
 * Deployment-supplied surface. `resolveStorage` returns the `"media"`
 * StorageProvider for this request (resolved via the storage runtime port), or
 * `null` when object storage isn't configured (the upload route then responds
 * `503`).
 */
export interface MediaLibraryRoutesOptions {
  resolveStorage(c: Context): StorageProvider | null
  siteClientAuth?: MediaSiteClientAuthRuntime
}

// ──────────────────────────────────────────────────────────────────
// Response schemas (Drizzle `$inferSelect` → wire shapes; §17: timestamps
// serialize to ISO strings, integers stay numbers).
// ──────────────────────────────────────────────────────────────────

const isoTimestamp = z.string()
const opaqueJson = z.unknown().nullable()

const mediaAssetTranslationRowSchema = z.object({
  assetId: z.string(),
  languageTag: z.string(),
  altText: z.string(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const mediaAssetRowSchema = z.object({
  id: z.string(),
  type: mediaAssetTypeSchema,
  name: z.string(),
  altText: z.string().nullable(),
  defaultLanguageTag: z.string(),
  altTranslations: z.array(mediaAssetTranslationRowSchema),
  storageKey: z.string(),
  url: z.string().nullable(),
  mimeType: z.string().nullable(),
  fileSize: z.number().nullable(),
  checksum: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  durationMs: z.number().nullable(),
  tags: z.array(z.string()),
  providerMeta: opaqueJson,
  createdBy: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const mediaFolderRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const mediaFolderMemberRowSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  folderId: z.string(),
  createdAt: isoTimestamp,
})

const assetUsageRowSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  createdAt: isoTimestamp,
})

const errorResponseSchema = z.object({ error: z.string() })

const jsonContent = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
})
const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
})
const dataEnvelope = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema })

const notFound = jsonContent(errorResponseSchema, "Not found")
const invalid = jsonContent(errorResponseSchema, "Invalid request")

const assetIdParam = z.object({ assetId: z.string() })
const folderIdParam = z.object({ folderId: z.string() })
const folderMemberParam = z.object({ folderId: z.string(), assetId: z.string() })

/**
 * Bridges Date-bearing Drizzle rows (whose declared wire shape is the
 * `z.string()` timestamp) to the `.openapi()` inferred typed-response union.
 * Runtime payloads honor the declared schemas; this only relaxes the
 * compile-time check. Mirrors the operator-settings `asRouteResponse` bridge.
 */
// biome-ignore lint/suspicious/noExplicitAny: intentional — bridges Date-bearing rows to the inferred typed-response union (voyant#3555)
function asRouteResponse(response: Promise<Response>): Promise<any> {
  return response
}

// ──────────────────────────────────────────────────────────────────
// Asset route definitions
// ──────────────────────────────────────────────────────────────────

const listAssetsRoute = createRoute({
  method: "get",
  path: "/v1/admin/media-library/assets",
  request: { query: listMediaAssetsQuerySchema },
  responses: {
    200: jsonContent(listResponseSchema(mediaAssetRowSchema), "Paginated media assets"),
  },
})

const getAssetRoute = createRoute({
  method: "get",
  path: "/v1/admin/media-library/assets/{assetId}",
  request: { params: assetIdParam },
  responses: {
    200: jsonContent(dataEnvelope(mediaAssetRowSchema), "A single media asset"),
    404: notFound,
  },
})

const updateAssetRoute = createRoute({
  method: "patch",
  path: "/v1/admin/media-library/assets/{assetId}",
  request: { params: assetIdParam, body: jsonBody(updateMediaAssetSchema) },
  responses: {
    200: jsonContent(dataEnvelope(mediaAssetRowSchema), "The updated media asset"),
    400: invalid,
    404: notFound,
  },
})

const deleteAssetRoute = createRoute({
  method: "delete",
  path: "/v1/admin/media-library/assets/{assetId}",
  request: { params: assetIdParam },
  responses: {
    200: jsonContent(dataEnvelope(mediaAssetRowSchema), "The deleted media asset"),
    404: notFound,
    409: jsonContent(errorResponseSchema, "The asset is in use and cannot be deleted"),
    503: jsonContent(errorResponseSchema, "Object storage is not configured"),
  },
})

// ──────────────────────────────────────────────────────────────────
// Folder route definitions
// ──────────────────────────────────────────────────────────────────

const listFoldersRoute = createRoute({
  method: "get",
  path: "/v1/admin/media-library/folders",
  request: { query: listMediaFoldersQuerySchema },
  responses: {
    200: jsonContent(listResponseSchema(mediaFolderRowSchema), "Paginated folders"),
  },
})

const createFolderRoute = createRoute({
  method: "post",
  path: "/v1/admin/media-library/folders",
  request: { body: jsonBody(createMediaFolderSchema) },
  responses: {
    201: jsonContent(dataEnvelope(mediaFolderRowSchema), "The created folder"),
    400: invalid,
  },
})

const getFolderRoute = createRoute({
  method: "get",
  path: "/v1/admin/media-library/folders/{folderId}",
  request: { params: folderIdParam },
  responses: {
    200: jsonContent(dataEnvelope(mediaFolderRowSchema), "A single folder"),
    404: notFound,
  },
})

const updateFolderRoute = createRoute({
  method: "patch",
  path: "/v1/admin/media-library/folders/{folderId}",
  request: { params: folderIdParam, body: jsonBody(updateMediaFolderSchema) },
  responses: {
    200: jsonContent(dataEnvelope(mediaFolderRowSchema), "The updated folder"),
    400: invalid,
    404: notFound,
  },
})

const deleteFolderRoute = createRoute({
  method: "delete",
  path: "/v1/admin/media-library/folders/{folderId}",
  request: { params: folderIdParam },
  responses: {
    200: jsonContent(dataEnvelope(mediaFolderRowSchema), "The deleted folder"),
    404: notFound,
  },
})

const addFolderMemberRoute = createRoute({
  method: "post",
  path: "/v1/admin/media-library/folders/{folderId}/members",
  request: { params: folderIdParam, body: jsonBody(folderMemberBodySchema) },
  responses: {
    201: jsonContent(dataEnvelope(mediaFolderMemberRowSchema), "The folder membership"),
    400: invalid,
  },
})

const removeFolderMemberRoute = createRoute({
  method: "delete",
  path: "/v1/admin/media-library/folders/{folderId}/members/{assetId}",
  request: { params: folderMemberParam },
  responses: {
    200: jsonContent(dataEnvelope(z.object({ removed: z.boolean() })), "Membership removal result"),
  },
})

// ──────────────────────────────────────────────────────────────────
// Usage route definitions
// ──────────────────────────────────────────────────────────────────

const listUsageRoute = createRoute({
  method: "get",
  path: "/v1/admin/media-library/usage",
  request: { query: listAssetUsageQuerySchema },
  responses: {
    200: jsonContent(listResponseSchema(assetUsageRowSchema), "Paginated asset usage records"),
  },
})

const recordUsageRoute = createRoute({
  method: "post",
  path: "/v1/admin/media-library/usage",
  request: { body: jsonBody(recordAssetUsageSchema) },
  responses: {
    201: jsonContent(dataEnvelope(assetUsageRowSchema), "The recorded usage"),
    400: invalid,
  },
})

/**
 * Build the media-library admin routes. The create (upload) leg is a plain
 * multipart handler + a manually registered OpenAPI path (mirrors the storage
 * upload route); every other leg is a typed `.openapi()` operation.
 */
export function createMediaLibraryRoutes(options: MediaLibraryRoutesOptions) {
  const routes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  if (options.siteClientAuth) {
    routes.route(
      "/",
      createMediaSiteBridgeRoutes({
        auth: options.siteClientAuth,
        resolveStorage: options.resolveStorage,
      }),
    )
  }

  // --- Create (multipart upload → dedup → store → catalogue) ---
  routes.post("/v1/admin/media-library/assets", async (c) => {
    const storage = options.resolveStorage(c)
    if (!storage) return c.json({ error: "Storage not configured" }, 503)

    const form = await c.req.parseBody({ all: true })
    const file = form.file
    if (!(file instanceof File)) {
      return c.json({ error: "Missing file field in multipart body" }, 400)
    }

    const rawTags = form.tags
    const tags = Array.isArray(rawTags)
      ? rawTags.map(String)
      : typeof rawTags === "string" && rawTags.trim()
        ? rawTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined

    const rawFolderIds = form.folderIds
    const folderIds = Array.isArray(rawFolderIds)
      ? rawFolderIds.map(String)
      : typeof rawFolderIds === "string" && rawFolderIds.trim()
        ? rawFolderIds
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined

    const parsed = createMediaAssetSchema.safeParse({
      type: form.type,
      name: (typeof form.name === "string" && form.name.trim()) || file.name,
      altText:
        typeof form.altText === "string"
          ? form.altText
          : typeof form.alt === "string"
            ? form.alt
            : undefined,
      defaultLanguageTag:
        typeof form.defaultLanguageTag === "string" ? form.defaultLanguageTag : undefined,
      altTranslations:
        typeof form.altTranslations === "string"
          ? parseMultipartJson(form.altTranslations)
          : undefined,
      mimeType: (typeof form.mimeType === "string" && form.mimeType) || file.type || undefined,
      tags,
      folderIds,
    })
    if (!parsed.success) {
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    try {
      const result = await createMediaAsset(c.get("db"), storage, parsed.data, bytes)
      return c.json({ data: result.asset, deduped: result.deduped }, result.deduped ? 200 : 201)
    } catch (error) {
      if (error instanceof MediaError && error.code === "invalid_alt_translation") {
        return c.json({ error: error.message }, 400)
      }
      throw error
    }
  })

  routes.openAPIRegistry.registerPath({
    method: "post",
    path: "/v1/admin/media-library/assets",
    summary: "Upload a media asset (content-deduplicated)",
    responses: {
      200: { description: "An existing asset with identical bytes (deduped)." },
      201: { description: "The newly created media asset." },
      400: { description: "The multipart request is invalid." },
      503: { description: "Object storage is not configured." },
    },
  })

  routes
    .openapi(listAssetsRoute, (c) =>
      asRouteResponse(
        (async () => {
          const query = parseQuery(c, listMediaAssetsQuerySchema)
          return c.json(await listMediaAssets(c.get("db"), query), 200)
        })(),
      ),
    )
    .openapi(getAssetRoute, (c) =>
      asRouteResponse(
        (async () => {
          const asset = await getMediaAsset(c.get("db"), c.req.valid("param").assetId)
          if (!asset) return c.json({ error: "Media asset not found" }, 404)
          return c.json({ data: asset }, 200)
        })(),
      ),
    )
    .openapi(updateAssetRoute, (c) =>
      asRouteResponse(
        (async () => {
          const input = await parseJsonBody(c, updateMediaAssetSchema)
          try {
            const asset = await updateMediaAsset(c.get("db"), c.req.valid("param").assetId, input)
            if (!asset) return c.json({ error: "Media asset not found" }, 404)
            return c.json({ data: asset }, 200)
          } catch (error) {
            if (error instanceof MediaError && error.code === "invalid_alt_translation") {
              return c.json({ error: error.message }, 400)
            }
            throw error
          }
        })(),
      ),
    )
    .openapi(deleteAssetRoute, (c) =>
      asRouteResponse(
        (async () => {
          const storage = options.resolveStorage(c)
          if (!storage) return c.json({ error: "Storage not configured" }, 503)
          try {
            const asset = await deleteMediaAsset(c.get("db"), storage, c.req.valid("param").assetId)
            if (!asset) return c.json({ error: "Media asset not found" }, 404)
            return c.json({ data: asset }, 200)
          } catch (error) {
            if (error instanceof MediaError && error.code === "asset_in_use") {
              return c.json({ error: error.message }, 409)
            }
            throw error
          }
        })(),
      ),
    )
    .openapi(listFoldersRoute, (c) =>
      asRouteResponse(
        (async () => {
          const query = parseQuery(c, listMediaFoldersQuerySchema)
          return c.json(await listMediaFolders(c.get("db"), query), 200)
        })(),
      ),
    )
    .openapi(createFolderRoute, (c) =>
      asRouteResponse(
        (async () => {
          const input = await parseJsonBody(c, createMediaFolderSchema)
          return c.json({ data: await createMediaFolder(c.get("db"), input) }, 201)
        })(),
      ),
    )
    .openapi(getFolderRoute, (c) =>
      asRouteResponse(
        (async () => {
          const folder = await getMediaFolder(c.get("db"), c.req.valid("param").folderId)
          if (!folder) return c.json({ error: "Media folder not found" }, 404)
          return c.json({ data: folder }, 200)
        })(),
      ),
    )
    .openapi(updateFolderRoute, (c) =>
      asRouteResponse(
        (async () => {
          const input = await parseJsonBody(c, updateMediaFolderSchema)
          const folder = await updateMediaFolder(c.get("db"), c.req.valid("param").folderId, input)
          if (!folder) return c.json({ error: "Media folder not found" }, 404)
          return c.json({ data: folder }, 200)
        })(),
      ),
    )
    .openapi(deleteFolderRoute, (c) =>
      asRouteResponse(
        (async () => {
          const folder = await deleteMediaFolder(c.get("db"), c.req.valid("param").folderId)
          if (!folder) return c.json({ error: "Media folder not found" }, 404)
          return c.json({ data: folder }, 200)
        })(),
      ),
    )
    .openapi(addFolderMemberRoute, (c) =>
      asRouteResponse(
        (async () => {
          const input = await parseJsonBody(c, folderMemberBodySchema)
          const member = await addAssetToFolder(
            c.get("db"),
            c.req.valid("param").folderId,
            input.assetId,
          )
          return c.json({ data: member }, 201)
        })(),
      ),
    )
    .openapi(removeFolderMemberRoute, (c) =>
      asRouteResponse(
        (async () => {
          const { folderId, assetId } = c.req.valid("param")
          const removed = await removeAssetFromFolder(c.get("db"), folderId, assetId)
          return c.json({ data: { removed } }, 200)
        })(),
      ),
    )
    .openapi(listUsageRoute, (c) =>
      asRouteResponse(
        (async () => {
          const query = parseQuery(c, listAssetUsageQuerySchema)
          return c.json(await listAssetUsage(c.get("db"), query), 200)
        })(),
      ),
    )
    .openapi(recordUsageRoute, (c) =>
      asRouteResponse(
        (async () => {
          const input = await parseJsonBody(c, recordAssetUsageSchema)
          return c.json({ data: await recordAssetUsage(c.get("db"), input) }, 201)
        })(),
      ),
    )

  return routes
}

function parseMultipartJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/**
 * Package-owned media-library ApiModule. A deployment mounts this lazily and
 * injects the resolved `"media"` StorageProvider via `options.resolveStorage`.
 */
export function createMediaLibraryApiModule(options: MediaLibraryRoutesOptions): ApiModule {
  return {
    module: { name: "media-library" },
    ...(options.siteClientAuth
      ? {
          clientAuthenticated: [{ method: "POST", path: "/site-bridge" }] as const,
        }
      : {}),
    lazyRoutes: {
      paths: MEDIA_LIBRARY_ROUTE_PATHS,
      load: async () => createMediaLibraryRoutes(options),
    },
  }
}
