/**
 * `@voyant-travel/media` drizzle schema — the consolidated media library
 * (images/videos/documents) built on the `@voyant-travel/storage` seam.
 *
 * Design notes (see voyant#3555):
 * - NO tenant/org column. Tenancy is enforced at the deployment DB boundary
 *   (docs/adr/0001-tenant-scoping.md). "Org-global dedup" is therefore a plain
 *   UNIQUE index on `checksum` — the managed database is already per-org.
 * - NO cross-package `.references()` FKs. `media_folder.parentId`,
 *   `media_folder_member.assetId/folderId`, and `asset_usage.assetId` are plain
 *   text ids resolved by the service, not database foreign keys. This phase
 *   deliberately does not touch `product_media`.
 * - Folders are modelled as *membership* (`media_folder_member`) so an asset can
 *   live in many folders; there is no `folderId` column on the asset itself.
 * - NO persisted delivery URL. `storage_key` is the durable locator; absolute
 *   URLs are derived on read from the configured storage origin (voyant#3845).
 */

import { typeId } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

/** The kind of asset stored in the library. */
export type MediaAssetType = "image" | "video" | "document"

/**
 * A single stored media asset. Bytes live in the resolved `"media"`
 * StorageProvider under `storageKey`; this row is the catalogued metadata.
 */
export const mediaAsset = pgTable(
  "media_asset",
  {
    id: typeId("media_asset"),
    /** `image | video | document` — kept as text (no pg enum / CREATE TYPE). */
    type: text("type").$type<MediaAssetType>().notNull(),
    /** Logical storage store; sensitive documents never resolve through public media. */
    storageClass: text("storage_class").$type<"media" | "documents">().notNull().default("media"),
    /** Owner-controlled content-deduplication domain. Existing rows remain library-owned. */
    dedupScope: text("dedup_scope")
      .$type<"library" | "inquiry-private">()
      .notNull()
      .default("library"),
    name: text("name").notNull(),
    /** Accessible alternative text in `defaultLanguageTag` — nullable. */
    altText: text("alt"),
    /** Language of the base `altText`; localized alternatives live below. */
    defaultLanguageTag: text("default_language_tag").notNull().default("en"),
    /**
     * Object key inside the resolved `"media"` StorageProvider — the only
     * durable locator for the bytes. The absolute delivery URL is deliberately
     * NOT stored: it is derived per read from the provider's configured origin
     * (`StorageProvider.publicUrl`). A persisted origin is invalidated wholesale
     * by a CDN hostname change and fails silently as broken images
     * (voyant#3845).
     */
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type"),
    /** Size in bytes. */
    fileSize: integer("file_size"),
    /**
     * SHA-256 hex digest of the stored bytes. UNIQUE within the database, which
     * — because the managed database is per-org — is the org-global dedup key.
     */
    checksum: text("checksum").notNull(),
    /** Intrinsic pixel dimensions (images/videos) — nullable. */
    width: integer("width"),
    height: integer("height"),
    /** Duration in milliseconds (video/audio) — nullable. */
    durationMs: integer("duration_ms"),
    /** Free-form labels. Defaults to an empty array. */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /**
     * Provider-specific metadata (e.g. a Cloudflare Stream `uid`) for a future
     * pluggable video/delivery provider. Opaque jsonb.
     */
    providerMeta: jsonb("provider_meta").$type<Record<string, unknown>>(),
    /** Actor id that created the asset (auth-owned id, deliberately no FK). */
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_media_asset_storage_scope_checksum").on(
      table.storageClass,
      table.dedupScope,
      table.checksum,
    ),
  ],
)

export type MediaAsset = typeof mediaAsset.$inferSelect
export type NewMediaAsset = typeof mediaAsset.$inferInsert

/**
 * Localized alternative text for an asset. The base language stays on
 * `media_asset` so existing consumers retain a cheap fallback; every additional
 * language is keyed by `(assetId, languageTag)`.
 */
export const mediaAssetTranslation = pgTable(
  "media_asset_translation",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => mediaAsset.id, { onDelete: "cascade" }),
    languageTag: text("language_tag").notNull(),
    altText: text("alt_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "pk_media_asset_translation",
      columns: [table.assetId, table.languageTag],
    }),
  ],
)

export type MediaAssetTranslation = typeof mediaAssetTranslation.$inferSelect
export type NewMediaAssetTranslation = typeof mediaAssetTranslation.$inferInsert

/**
 * A folder in the library tree. `parentId` is a plain self-referencing text id
 * (NOT a drizzle `.references()` FK) resolved by the service.
 */
export const mediaFolder = pgTable("media_folder", {
  id: typeId("media_folder"),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type MediaFolder = typeof mediaFolder.$inferSelect
export type NewMediaFolder = typeof mediaFolder.$inferInsert

/**
 * Membership join between an asset and a folder. An asset can belong to many
 * folders, so this is a many-to-many membership rather than a `folderId` column
 * on the asset. Unique on (assetId, folderId).
 */
export const mediaFolderMember = pgTable(
  "media_folder_member",
  {
    id: typeId("media_folder_member"),
    assetId: text("asset_id").notNull(),
    folderId: text("folder_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_media_folder_member_asset_folder").on(table.assetId, table.folderId),
  ],
)

export type MediaFolderMember = typeof mediaFolderMember.$inferSelect
export type NewMediaFolderMember = typeof mediaFolderMember.$inferInsert

/**
 * A record of where an asset is referenced ("where used"). The service guards
 * asset deletion while any usage rows exist. Unique on
 * (assetId, entityType, entityId).
 */
export const assetUsage = pgTable(
  "asset_usage",
  {
    id: typeId("asset_usage"),
    assetId: text("asset_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_asset_usage_asset_entity").on(
      table.assetId,
      table.entityType,
      table.entityId,
    ),
  ],
)

export type AssetUsage = typeof assetUsage.$inferSelect
export type NewAssetUsage = typeof assetUsage.$inferInsert

/** Durable owner ledger for idempotent private-object deletion retries. */
export const mediaPrivateDocumentDeletion = pgTable("media_private_document_deletion", {
  assetId: text("asset_id").primaryKey(),
  storageKey: text("storage_key").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
})

export type MediaPrivateDocumentDeletion = typeof mediaPrivateDocumentDeletion.$inferSelect
