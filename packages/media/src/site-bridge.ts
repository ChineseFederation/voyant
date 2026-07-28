/**
 * Server-to-server bridge for a site-owned CMS to use the operator's shared
 * media catalogue. The exact POST endpoint is admitted through Hono's
 * client-authenticated-route seam, and every request is authorized in-band by
 * a host-provided workspace verifier.
 */

import { z } from "@hono/zod-openapi"
import type { StorageProvider } from "@voyant-travel/storage"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { Hono } from "hono"

import type { MediaSiteClientAuthRuntime } from "./runtime-port.js"
import {
  createMediaAsset,
  deleteMediaAsset,
  getMediaAsset,
  listMediaAssets,
  MediaError,
  recordAssetUsage,
  removeAssetUsage,
  updateMediaAsset,
} from "./service.js"
import {
  createMediaAssetSchema,
  listMediaAssetsQuerySchema,
  recordAssetUsageSchema,
  updateMediaAssetSchema,
} from "./validation.js"

export const MEDIA_SITE_BRIDGE_PATH = "/v1/admin/media-library/site-bridge"

type Env = { Variables: { db: PostgresJsDatabase } }

export interface MediaSiteBridgeOptions {
  auth: MediaSiteClientAuthRuntime
  resolveStorage(c: Context): StorageProvider | null
}

const assetIdBodySchema = z.object({ assetId: z.string().trim().min(1) })
const updateBodySchema = assetIdBodySchema.extend({ input: updateMediaAssetSchema })
const actionSchema = z.enum([
  "delete",
  "get",
  "list",
  "record-usage",
  "remove-usage",
  "update",
  "upload",
])

export function createMediaSiteBridgeRoutes(options: MediaSiteBridgeOptions) {
  const routes = new Hono<Env>()

  routes.post(MEDIA_SITE_BRIDGE_PATH, async (c) => {
    c.header("Cache-Control", "no-store")
    if (!(await options.auth.authorize(c.req.raw))) {
      return c.json({ error: "unauthorized" }, 401)
    }

    const action = actionSchema.safeParse(c.req.query("action"))
    if (!action.success) return c.json({ error: "invalid_action" }, 400)

    switch (action.data) {
      case "list": {
        const body = await readJson(c)
        const query = listMediaAssetsQuerySchema.safeParse(body ?? {})
        if (!query.success) return invalid(c, query.error.issues)
        return c.json(
          await listMediaAssets(c.get("db"), query.data, options.resolveStorage(c)),
          200,
        )
      }
      case "get": {
        const body = assetIdBodySchema.safeParse(await readJson(c))
        if (!body.success) return invalid(c, body.error.issues)
        const asset = await getMediaAsset(c.get("db"), body.data.assetId, options.resolveStorage(c))
        return asset
          ? c.json({ data: asset }, 200)
          : c.json({ error: "Media asset not found" }, 404)
      }
      case "update": {
        const body = updateBodySchema.safeParse(await readJson(c))
        if (!body.success) return invalid(c, body.error.issues)
        try {
          const asset = await updateMediaAsset(
            c.get("db"),
            body.data.assetId,
            body.data.input,
            options.resolveStorage(c),
          )
          return asset
            ? c.json({ data: asset }, 200)
            : c.json({ error: "Media asset not found" }, 404)
        } catch (error) {
          if (error instanceof MediaError && error.code === "invalid_alt_translation") {
            return c.json({ error: error.message }, 400)
          }
          throw error
        }
      }
      case "delete": {
        const storage = options.resolveStorage(c)
        if (!storage) return c.json({ error: "Storage not configured" }, 503)
        const body = assetIdBodySchema.safeParse(await readJson(c))
        if (!body.success) return invalid(c, body.error.issues)
        try {
          const asset = await deleteMediaAsset(c.get("db"), storage, body.data.assetId)
          return asset
            ? c.json({ data: asset }, 200)
            : c.json({ error: "Media asset not found" }, 404)
        } catch (error) {
          if (error instanceof MediaError && error.code === "asset_in_use") {
            return c.json({ error: error.message }, 409)
          }
          throw error
        }
      }
      case "record-usage": {
        const body = recordAssetUsageSchema.safeParse(await readJson(c))
        if (!body.success) return invalid(c, body.error.issues)
        return c.json({ data: await recordAssetUsage(c.get("db"), body.data) }, 201)
      }
      case "remove-usage": {
        const body = recordAssetUsageSchema.safeParse(await readJson(c))
        if (!body.success) return invalid(c, body.error.issues)
        return c.json(
          {
            data: {
              removed: await removeAssetUsage(c.get("db"), body.data),
            },
          },
          200,
        )
      }
      case "upload":
        return upload(c, options.resolveStorage(c))
    }
  })

  return routes
}

async function upload(c: Context<Env>, storage: StorageProvider | null) {
  if (!storage) return c.json({ error: "Storage not configured" }, 503)
  const form = await c.req.parseBody({ all: true })
  const file = form.file
  if (!(file instanceof File)) {
    return c.json({ error: "Missing file field in multipart body" }, 400)
  }

  const parsed = createMediaAssetSchema.safeParse({
    type: form.type,
    name: (typeof form.name === "string" && form.name.trim()) || file.name,
    altText: typeof form.altText === "string" ? form.altText : undefined,
    defaultLanguageTag:
      typeof form.defaultLanguageTag === "string" ? form.defaultLanguageTag : undefined,
    altTranslations:
      typeof form.altTranslations === "string"
        ? parseMultipartJson(form.altTranslations)
        : undefined,
    mimeType: (typeof form.mimeType === "string" && form.mimeType) || file.type || undefined,
    tags: stringList(form.tags),
    folderIds: stringList(form.folderIds),
  })
  if (!parsed.success) return invalid(c, parsed.error.issues)

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await createMediaAsset(c.get("db"), storage, parsed.data, bytes)
    return c.json({ data: result.asset, deduped: result.deduped }, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof MediaError && error.code === "invalid_alt_translation") {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

function stringList(value: string | File | (string | File)[] | undefined): string[] | undefined {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== "string" || !value.trim()) return undefined
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseMultipartJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function invalid(c: Context, issues: unknown) {
  return c.json({ error: "invalid_request", issues }, 400)
}
