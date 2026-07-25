/**
 * `@voyant-travel/media` data access + domain logic. Transport-agnostic: every
 * function takes the Drizzle `db` as its first argument (repo convention), and
 * byte-bearing operations take a resolved `"media"` StorageProvider. The HTTP
 * routes in `./routes` are thin wrappers over these.
 *
 * Bytes always flow through the injected `StorageProvider` — this package never
 * talks to R2/S3/Stream directly.
 */

import type { StorageProvider, StorageUploadBody } from "@voyant-travel/storage"
import { listResponse } from "@voyant-travel/types"
import { and, arrayContains, desc, eq, ilike, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type AssetUsage,
  assetUsage,
  type MediaAsset,
  type MediaAssetTranslation,
  type MediaFolder,
  type MediaFolderMember,
  mediaAsset,
  mediaAssetTranslation,
  mediaFolder,
  mediaFolderMember,
} from "./schema.js"
import type {
  CreateMediaAssetInput,
  CreateMediaFolderInput,
  ListAssetUsageQuery,
  ListMediaAssetsQuery,
  ListMediaFoldersQuery,
  RecordAssetUsageInput,
  UpdateMediaAssetInput,
  UpdateMediaFolderInput,
} from "./validation.js"

/** Stable, machine-readable failure codes surfaced by the service. */
export type MediaErrorCode = "asset_in_use" | "invalid_alt_translation" | "not_found"

/** Domain error with a stable `code` the routes map to HTTP status codes. */
export class MediaError extends Error {
  readonly code: MediaErrorCode
  constructor(code: MediaErrorCode, message: string) {
    super(message)
    this.name = "MediaError"
    this.code = code
  }
}

/** Result of {@link createMediaAsset}. `deduped` is true on a checksum hit. */
export interface CreateMediaAssetResult {
  asset: MediaAssetWithTranslations
  deduped: boolean
}

export type MediaAssetWithTranslations = MediaAsset & {
  altTranslations: MediaAssetTranslation[]
}

/** All object keys minted by the library live under this servable prefix. */
const MEDIA_STORAGE_KEY_PREFIX = "uploads/media/"

/**
 * Storage keys are content-addressed by checksum. Append the file extension so
 * the byte-serving route (`@voyant-travel/storage`, which sends
 * `X-Content-Type-Options: nosniff`) can infer the correct `Content-Type` from
 * the key and browsers render the asset instead of downloading octet-stream.
 */
const MEDIA_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
}

function storageKeyExtension(mimeType: string | null | undefined): string {
  const normalized = (mimeType ?? "").toLowerCase().split(";")[0]?.trim() ?? ""
  const ext = MEDIA_EXTENSION_BY_MIME[normalized]
  return ext ? `.${ext}` : ""
}

async function toBytes(body: StorageUploadBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  return new Uint8Array(await body.arrayBuffer())
}

/** SHA-256 hex digest of the given bytes (org-global dedup key). */
export async function computeChecksum(body: StorageUploadBody): Promise<string> {
  const bytes = await toBytes(body)
  // Copy into a fresh ArrayBuffer-backed view so the digest arg is a concrete
  // BufferSource (Uint8Array<ArrayBufferLike>` isn't assignable under TS 6).
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function findAssetByChecksum(
  db: PostgresJsDatabase,
  checksum: string,
): Promise<MediaAssetWithTranslations | null> {
  const [row] = await db.select().from(mediaAsset).where(eq(mediaAsset.checksum, checksum)).limit(1)
  return row ? attachTranslations(db, [row]).then((assets) => assets[0] ?? null) : null
}

async function attachTranslations(
  db: PostgresJsDatabase,
  assets: MediaAsset[],
): Promise<MediaAssetWithTranslations[]> {
  if (assets.length === 0) return []

  const translations = await db
    .select()
    .from(mediaAssetTranslation)
    .where(
      inArray(
        mediaAssetTranslation.assetId,
        assets.map((asset) => asset.id),
      ),
    )
    .orderBy(mediaAssetTranslation.languageTag)

  const byAssetId = new Map<string, MediaAssetTranslation[]>()
  for (const translation of translations) {
    const current = byAssetId.get(translation.assetId) ?? []
    current.push(translation)
    byAssetId.set(translation.assetId, current)
  }

  return assets.map((asset) => ({
    ...asset,
    altTranslations: byAssetId.get(asset.id) ?? [],
  }))
}

async function replaceAltTranslations(
  db: PostgresJsDatabase,
  assetId: string,
  translations: CreateMediaAssetInput["altTranslations"],
): Promise<void> {
  await db.delete(mediaAssetTranslation).where(eq(mediaAssetTranslation.assetId, assetId))
  if (!translations?.length) return

  await db.insert(mediaAssetTranslation).values(
    translations.map((translation) => ({
      assetId,
      languageTag: translation.languageTag,
      altText: translation.altText,
    })),
  )
}

function assertAltTranslationsExcludeDefault(
  defaultLanguageTag: string,
  translations: readonly { languageTag: string }[] | undefined,
): void {
  const normalizedDefault = defaultLanguageTag.toLowerCase()
  if (
    translations?.some((translation) => translation.languageTag.toLowerCase() === normalizedDefault)
  ) {
    throw new MediaError(
      "invalid_alt_translation",
      "The default language belongs in altText, not altTranslations",
    )
  }
}

/**
 * Create an asset with org-global dedup. Computes the content checksum; if an
 * asset with that checksum already exists it is returned as-is and NO bytes are
 * stored. On a miss the bytes are uploaded via the resolved `"media"`
 * StorageProvider and a new row is inserted.
 */
export async function createMediaAsset(
  db: PostgresJsDatabase,
  storage: StorageProvider,
  input: CreateMediaAssetInput,
  body: StorageUploadBody,
): Promise<CreateMediaAssetResult> {
  const defaultLanguageTag = input.defaultLanguageTag ?? "en"
  assertAltTranslationsExcludeDefault(defaultLanguageTag, input.altTranslations)

  const bytes = await toBytes(body)
  const checksum = await computeChecksum(bytes)

  const existing = await findAssetByChecksum(db, checksum)
  if (existing) {
    return { asset: existing, deduped: true }
  }

  const storageKey = `${MEDIA_STORAGE_KEY_PREFIX}${checksum}${storageKeyExtension(input.mimeType)}`
  const stored = await storage.upload(bytes, {
    key: storageKey,
    ...(input.mimeType ? { contentType: input.mimeType } : {}),
  })

  try {
    const [created] = await db
      .insert(mediaAsset)
      .values({
        type: input.type,
        name: input.name,
        altText: input.altText ?? null,
        defaultLanguageTag,
        storageKey,
        url: stored.url || null,
        mimeType: input.mimeType ?? null,
        fileSize: bytes.byteLength,
        checksum,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        ...(input.tags ? { tags: input.tags } : {}),
        providerMeta: input.providerMeta ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning()

    if (!created) throw new MediaError("not_found", "Failed to create media asset")

    if (input.folderIds?.length) {
      await addAssetToFolders(db, created.id, input.folderIds)
    }
    await replaceAltTranslations(db, created.id, input.altTranslations)

    const [asset] = await attachTranslations(db, [created])
    if (!asset) throw new MediaError("not_found", "Failed to load created media asset")
    return { asset, deduped: false }
  } catch (error) {
    // Lost a race with a concurrent identical upload: the unique checksum index
    // rejected our insert. Fall back to the row the winner created.
    const raced = await findAssetByChecksum(db, checksum)
    if (raced) return { asset: raced, deduped: true }
    throw error
  }
}

export async function getMediaAsset(
  db: PostgresJsDatabase,
  id: string,
): Promise<MediaAssetWithTranslations | null> {
  const [row] = await db.select().from(mediaAsset).where(eq(mediaAsset.id, id)).limit(1)
  if (!row) return null
  const [asset] = await attachTranslations(db, [row])
  return asset ?? null
}

/** Paginated list/search over assets. Filters combine with AND. */
export async function listMediaAssets(db: PostgresJsDatabase, query: ListMediaAssetsQuery) {
  const conditions = []
  if (query.type) conditions.push(eq(mediaAsset.type, query.type))
  if (query.mimeType) conditions.push(eq(mediaAsset.mimeType, query.mimeType))
  if (query.name) conditions.push(ilike(mediaAsset.name, `%${query.name}%`))
  if (query.tag) conditions.push(arrayContains(mediaAsset.tags, [query.tag]))
  if (query.folderId) {
    conditions.push(
      inArray(
        mediaAsset.id,
        db
          .select({ id: mediaFolderMember.assetId })
          .from(mediaFolderMember)
          .where(eq(mediaFolderMember.folderId, query.folderId)),
      ),
    )
  }
  const where = conditions.length ? and(...conditions) : undefined

  const [rows, [counted]] = await Promise.all([
    db
      .select()
      .from(mediaAsset)
      .where(where)
      .orderBy(desc(mediaAsset.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(mediaAsset).where(where),
  ])

  return listResponse(await attachTranslations(db, rows), {
    total: counted?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  })
}

/**
 * Update editable asset fields. When `folderIds` is provided it *replaces* the
 * asset's folder membership set. Returns the updated row, or `null` if absent.
 */
export async function updateMediaAsset(
  db: PostgresJsDatabase,
  id: string,
  patch: UpdateMediaAssetInput,
): Promise<MediaAssetWithTranslations | null> {
  const existing = await getMediaAsset(db, id)
  if (!existing) return null
  const defaultLanguageTag = patch.defaultLanguageTag ?? existing.defaultLanguageTag
  const altTranslations = patch.altTranslations ?? existing.altTranslations
  assertAltTranslationsExcludeDefault(defaultLanguageTag, altTranslations)

  const values: Partial<typeof mediaAsset.$inferInsert> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.altText !== undefined) values.altText = patch.altText ?? null
  if (patch.defaultLanguageTag !== undefined) {
    values.defaultLanguageTag = patch.defaultLanguageTag
  }
  if (patch.tags !== undefined) values.tags = patch.tags

  let updated: MediaAsset = existing
  if (Object.keys(values).length > 0) {
    const [row] = await db
      .update(mediaAsset)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(mediaAsset.id, id))
      .returning()
    if (row) updated = row
  }

  if (patch.folderIds !== undefined) {
    await setAssetFolders(db, id, patch.folderIds)
  }
  if (patch.altTranslations !== undefined) {
    await replaceAltTranslations(db, id, patch.altTranslations)
  }

  const [asset] = await attachTranslations(db, [updated])
  return asset ?? null
}

/**
 * Delete an asset. Refuses (throws {@link MediaError} `asset_in_use`) while any
 * `asset_usage` rows reference it. On success the folder membership rows and the
 * stored bytes are removed too. Returns the deleted row, or `null` if absent.
 */
export async function deleteMediaAsset(
  db: PostgresJsDatabase,
  storage: StorageProvider,
  id: string,
): Promise<MediaAssetWithTranslations | null> {
  const existing = await getMediaAsset(db, id)
  if (!existing) return null

  const usageCount = await countAssetUsage(db, id)
  if (usageCount > 0) {
    throw new MediaError(
      "asset_in_use",
      `Cannot delete media asset ${id}: it is referenced by ${usageCount} usage record(s). Remove those references first.`,
    )
  }

  await db.delete(mediaFolderMember).where(eq(mediaFolderMember.assetId, id))
  await db.delete(mediaAsset).where(eq(mediaAsset.id, id))
  await storage.delete(existing.storageKey)
  return existing
}

// ──────────────────────────────────────────────────────────────────
// Folders
// ──────────────────────────────────────────────────────────────────

export async function createMediaFolder(
  db: PostgresJsDatabase,
  input: CreateMediaFolderInput,
): Promise<MediaFolder> {
  const [created] = await db
    .insert(mediaFolder)
    .values({ name: input.name, parentId: input.parentId ?? null })
    .returning()
  if (!created) throw new MediaError("not_found", "Failed to create media folder")
  return created
}

export async function getMediaFolder(
  db: PostgresJsDatabase,
  id: string,
): Promise<MediaFolder | null> {
  const [row] = await db.select().from(mediaFolder).where(eq(mediaFolder.id, id)).limit(1)
  return row ?? null
}

export async function listMediaFolders(db: PostgresJsDatabase, query: ListMediaFoldersQuery) {
  const where = query.parentId ? eq(mediaFolder.parentId, query.parentId) : undefined
  const [rows, [counted]] = await Promise.all([
    db
      .select()
      .from(mediaFolder)
      .where(where)
      .orderBy(desc(mediaFolder.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(mediaFolder).where(where),
  ])
  return listResponse(rows, {
    total: counted?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  })
}

export async function updateMediaFolder(
  db: PostgresJsDatabase,
  id: string,
  patch: UpdateMediaFolderInput,
): Promise<MediaFolder | null> {
  const existing = await getMediaFolder(db, id)
  if (!existing) return null

  const values: Partial<typeof mediaFolder.$inferInsert> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.parentId !== undefined) values.parentId = patch.parentId ?? null
  if (Object.keys(values).length === 0) return existing

  const [updated] = await db
    .update(mediaFolder)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(mediaFolder.id, id))
    .returning()
  return updated ?? null
}

/** Delete a folder and clear any membership rows pointing at it. */
export async function deleteMediaFolder(
  db: PostgresJsDatabase,
  id: string,
): Promise<MediaFolder | null> {
  const existing = await getMediaFolder(db, id)
  if (!existing) return null
  await db.delete(mediaFolderMember).where(eq(mediaFolderMember.folderId, id))
  const [deleted] = await db.delete(mediaFolder).where(eq(mediaFolder.id, id)).returning()
  return deleted ?? null
}

// ──────────────────────────────────────────────────────────────────
// Folder membership
// ──────────────────────────────────────────────────────────────────

/** Add one asset to one folder (idempotent). Returns the membership row. */
export async function addAssetToFolder(
  db: PostgresJsDatabase,
  folderId: string,
  assetId: string,
): Promise<MediaFolderMember> {
  const [created] = await db
    .insert(mediaFolderMember)
    .values({ assetId, folderId })
    .onConflictDoNothing()
    .returning()
  if (created) return created
  const [existing] = await db
    .select()
    .from(mediaFolderMember)
    .where(and(eq(mediaFolderMember.assetId, assetId), eq(mediaFolderMember.folderId, folderId)))
    .limit(1)
  if (!existing) throw new MediaError("not_found", "Failed to add asset to folder")
  return existing
}

/** Remove an asset from a folder. Returns true when a row was removed. */
export async function removeAssetFromFolder(
  db: PostgresJsDatabase,
  folderId: string,
  assetId: string,
): Promise<boolean> {
  const removed = await db
    .delete(mediaFolderMember)
    .where(and(eq(mediaFolderMember.assetId, assetId), eq(mediaFolderMember.folderId, folderId)))
    .returning()
  return removed.length > 0
}

/** Add one asset to several folders at once (idempotent). */
export async function addAssetToFolders(
  db: PostgresJsDatabase,
  assetId: string,
  folderIds: readonly string[],
): Promise<void> {
  if (!folderIds.length) return
  await db
    .insert(mediaFolderMember)
    .values(folderIds.map((folderId) => ({ assetId, folderId })))
    .onConflictDoNothing()
}

/** Replace an asset's entire folder membership set. */
export async function setAssetFolders(
  db: PostgresJsDatabase,
  assetId: string,
  folderIds: readonly string[],
): Promise<void> {
  await db.delete(mediaFolderMember).where(eq(mediaFolderMember.assetId, assetId))
  await addAssetToFolders(db, assetId, folderIds)
}

/** List the folder ids an asset belongs to. */
export async function listAssetFolderIds(
  db: PostgresJsDatabase,
  assetId: string,
): Promise<string[]> {
  const rows = await db
    .select({ folderId: mediaFolderMember.folderId })
    .from(mediaFolderMember)
    .where(eq(mediaFolderMember.assetId, assetId))
  return rows.map((r) => r.folderId)
}

// ──────────────────────────────────────────────────────────────────
// Usage tracking
// ──────────────────────────────────────────────────────────────────

/** Record that an entity references an asset (idempotent on the unique tuple). */
export async function recordAssetUsage(
  db: PostgresJsDatabase,
  input: RecordAssetUsageInput,
): Promise<AssetUsage> {
  const [created] = await db.insert(assetUsage).values(input).onConflictDoNothing().returning()
  if (created) return created
  const [existing] = await db
    .select()
    .from(assetUsage)
    .where(
      and(
        eq(assetUsage.assetId, input.assetId),
        eq(assetUsage.entityType, input.entityType),
        eq(assetUsage.entityId, input.entityId),
      ),
    )
    .limit(1)
  if (!existing) throw new MediaError("not_found", "Failed to record asset usage")
  return existing
}

/** Remove a single usage record. Returns true when a row was removed. */
export async function removeAssetUsage(
  db: PostgresJsDatabase,
  input: RecordAssetUsageInput,
): Promise<boolean> {
  const removed = await db
    .delete(assetUsage)
    .where(
      and(
        eq(assetUsage.assetId, input.assetId),
        eq(assetUsage.entityType, input.entityType),
        eq(assetUsage.entityId, input.entityId),
      ),
    )
    .returning()
  return removed.length > 0
}

export async function countAssetUsage(db: PostgresJsDatabase, assetId: string): Promise<number> {
  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assetUsage)
    .where(eq(assetUsage.assetId, assetId))
  return counted?.count ?? 0
}

/** Paginated "where used" list. */
export async function listAssetUsage(db: PostgresJsDatabase, query: ListAssetUsageQuery) {
  const conditions = []
  if (query.assetId) conditions.push(eq(assetUsage.assetId, query.assetId))
  if (query.entityType) conditions.push(eq(assetUsage.entityType, query.entityType))
  const where = conditions.length ? and(...conditions) : undefined

  const [rows, [counted]] = await Promise.all([
    db
      .select()
      .from(assetUsage)
      .where(where)
      .orderBy(desc(assetUsage.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(assetUsage).where(where),
  ])
  return listResponse(rows, {
    total: counted?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  })
}
