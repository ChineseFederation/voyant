import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { StorageProvider } from "@voyant-travel/storage"
import { and, eq, inArray, lte, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  mediaInquiryAttachmentRuntimePort,
  mediaPreparedAttachmentCleanupRuntimePort,
  type PreparedInquiryAttachment,
} from "./runtime-port.js"
import { mediaAsset, mediaPrivateDocumentDeletion } from "./schema.js"
import { countAssetUsage, recordAssetUsage, removeAssetUsage } from "./service.js"
import { computeChecksum, mediaStorageKey, toBytes } from "./storage-key.js"

const INQUIRY_USAGE_TYPE = "inquiry_attachment"
const SUPPORTED_PRIVATE_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
])

type AttachmentMarker = {
  operationKey?: unknown
  ownerToken?: unknown
  operationTokens?: unknown
  state?: unknown
  preparedAt?: unknown
  claimedAt?: unknown
}

function ownedOperationToken(marker: AttachmentMarker | undefined, operationKey: string) {
  const tokens = marker?.operationTokens
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) return undefined
  const token = (tokens as Record<string, unknown>)[operationKey]
  return typeof token === "string" ? token : undefined
}

function attachmentMarker(
  providerMeta: Record<string, unknown> | null,
): AttachmentMarker | undefined {
  return providerMeta?.inquiryAttachment as AttachmentMarker | undefined
}

function assertSupportedMimeType(mimeType: string | null): string {
  const normalized = mimeType?.toLowerCase().split(";")[0]?.trim() ?? ""
  if (!SUPPORTED_PRIVATE_DOCUMENT_MIME_TYPES.has(normalized)) {
    throw new Error("Unsupported private document MIME type")
  }
  return normalized
}

export function createMediaRuntimePortContribution(host: {
  primitives: VoyantRuntimeHostPrimitives
}) {
  const resolveDb = (bindings: unknown) =>
    host.primitives.database.resolve<PostgresJsDatabase>(bindings)

  async function queuePrivateDocumentPurge(db: PostgresJsDatabase, assetId: string): Promise<void> {
    const [owned] = await db
      .select({ id: mediaAsset.id, storageKey: mediaAsset.storageKey })
      .from(mediaAsset)
      .where(
        and(
          eq(mediaAsset.id, assetId),
          eq(mediaAsset.type, "document"),
          eq(mediaAsset.storageClass, "documents"),
          eq(mediaAsset.dedupScope, "inquiry-private"),
        ),
      )
      .limit(1)
    if (!owned) return
    await db
      .insert(mediaPrivateDocumentDeletion)
      .values({ assetId: owned.id, storageKey: owned.storageKey })
      .onConflictDoUpdate({
        target: mediaPrivateDocumentDeletion.assetId,
        set: { nextAttemptAt: new Date(), lastError: null },
      })
  }

  async function resolvePrivateDocument(db: unknown, assetId: string) {
    const [asset] = await (db as PostgresJsDatabase)
      .select({
        id: mediaAsset.id,
        name: mediaAsset.name,
        mimeType: mediaAsset.mimeType,
        providerMeta: mediaAsset.providerMeta,
      })
      .from(mediaAsset)
      .where(
        and(
          eq(mediaAsset.id, assetId),
          eq(mediaAsset.type, "document"),
          eq(mediaAsset.storageClass, "documents"),
          eq(mediaAsset.dedupScope, "inquiry-private"),
        ),
      )
      .limit(1)
    return asset && attachmentMarker(asset.providerMeta)?.state === "claimed"
      ? { id: asset.id, name: asset.name, mimeType: asset.mimeType }
      : null
  }

  async function preparePrivateDocument(
    bindings: unknown,
    input: {
      operationKey: string
      name: string
      mimeType: string | null
      body: ArrayBuffer
      createdBy: string
    },
  ): Promise<PreparedInquiryAttachment> {
    const mimeType = assertSupportedMimeType(input.mimeType)
    const storage = host.primitives.storage.resolve(bindings, "documents") as StorageProvider | null
    if (!storage) throw new Error("Private document storage is unavailable")
    const db = resolveDb(bindings)
    const bytes = await toBytes(input.body)
    const checksum = await computeChecksum(bytes)
    const storageKey = mediaStorageKey(checksum, mimeType, "inquiry-private")
    const issuedOwnerToken = crypto.randomUUID()
    let [row] = await db
      .select()
      .from(mediaAsset)
      .where(
        and(
          eq(mediaAsset.storageClass, "documents"),
          eq(mediaAsset.dedupScope, "inquiry-private"),
          eq(mediaAsset.checksum, checksum),
        ),
      )
      .limit(1)
    let created = false
    if (!row) {
      try {
        ;[row] = await db
          .insert(mediaAsset)
          .values({
            type: "document",
            storageClass: "documents",
            dedupScope: "inquiry-private",
            name: "Private Inquiry document",
            storageKey,
            mimeType,
            fileSize: bytes.byteLength,
            checksum,
            createdBy: input.createdBy,
            providerMeta: {
              inquiryAttachment: {
                operationKey: input.operationKey,
                ownerToken: issuedOwnerToken,
                operationTokens: { [input.operationKey]: issuedOwnerToken },
                state: "uploading",
                preparedAt: new Date().toISOString(),
              },
            },
          })
          .returning()
        created = Boolean(row)
      } catch (error) {
        ;[row] = await db
          .select()
          .from(mediaAsset)
          .where(
            and(
              eq(mediaAsset.storageClass, "documents"),
              eq(mediaAsset.dedupScope, "inquiry-private"),
              eq(mediaAsset.checksum, checksum),
            ),
          )
          .limit(1)
        if (!row) throw error
      }
    }
    if (!row) throw new Error("Private document preparation could not be persisted")
    const marker = attachmentMarker(row.providerMeta)
    if (marker?.state === "claimed") {
      let ownerToken = ownedOperationToken(marker, input.operationKey)
      if (!ownerToken) {
        ownerToken = issuedOwnerToken
        await db
          .update(mediaAsset)
          .set({
            providerMeta: sql`jsonb_set(
              ${mediaAsset.providerMeta},
              '{inquiryAttachment,operationTokens}',
              COALESCE(${mediaAsset.providerMeta} #> '{inquiryAttachment,operationTokens}', '{}'::jsonb)
                || jsonb_build_object(${input.operationKey}, ${ownerToken}),
              true
            )`,
            updatedAt: new Date(),
          })
          .where(eq(mediaAsset.id, row.id))
      }
      return {
        id: row.id,
        mimeType,
        operationKey: input.operationKey,
        ownerToken,
        created: false,
      }
    }
    if (
      (marker?.state !== "uploading" && marker?.state !== "prepared") ||
      marker.operationKey !== input.operationKey
    ) {
      throw new Error("An identical private document is owned by another operation")
    }
    await storage.upload(bytes, { key: storageKey, contentType: mimeType })
    await db
      .update(mediaAsset)
      .set({
        providerMeta: {
          ...row.providerMeta,
          inquiryAttachment: {
            ...marker,
            state: "prepared",
            preparedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaAsset.id, row.id),
          sql`${mediaAsset.providerMeta} #>> '{inquiryAttachment,operationKey}' = ${input.operationKey}`,
        ),
      )
    const ownerToken = ownedOperationToken(marker, input.operationKey)
    if (!ownerToken) throw new Error("Private document preparation owner token is missing")
    return { id: row.id, mimeType, operationKey: input.operationKey, ownerToken, created }
  }

  const inquiryAttachmentRuntime = {
    preparePrivateDocument,
    async claimPrivateDocument(
      dbValue: unknown,
      prepared: PreparedInquiryAttachment,
      usageId: string,
    ) {
      const db = dbValue as PostgresJsDatabase
      const [row] = await db
        .select({ providerMeta: mediaAsset.providerMeta })
        .from(mediaAsset)
        .where(eq(mediaAsset.id, prepared.id))
        .for("update")
        .limit(1)
      const marker = attachmentMarker(row?.providerMeta ?? null)
      if (!row || (marker?.state !== "prepared" && marker?.state !== "claimed")) {
        throw new Error("Private document is not prepared")
      }
      if (ownedOperationToken(marker, prepared.operationKey) !== prepared.ownerToken) {
        throw new Error("Private document preparation belongs to another operation")
      }
      // A queued purge is only a request until the cleanup worker atomically
      // promotes the asset to `deleting`. Claiming the row lock first lets a
      // new committed use cancel that request without racing object deletion.
      await db
        .delete(mediaPrivateDocumentDeletion)
        .where(eq(mediaPrivateDocumentDeletion.assetId, prepared.id))
      await recordAssetUsage(db, {
        assetId: prepared.id,
        entityType: INQUIRY_USAGE_TYPE,
        entityId: usageId,
      })
    },
    async claimExistingPrivateDocument(dbValue: unknown, assetId: string, usageId: string) {
      const db = dbValue as PostgresJsDatabase
      const [row] = await db
        .select({ providerMeta: mediaAsset.providerMeta })
        .from(mediaAsset)
        .where(eq(mediaAsset.id, assetId))
        .for("update")
        .limit(1)
      if (attachmentMarker(row?.providerMeta ?? null)?.state !== "claimed") {
        throw new Error("Private document is not claimed")
      }
      await db
        .delete(mediaPrivateDocumentDeletion)
        .where(eq(mediaPrivateDocumentDeletion.assetId, assetId))
      await recordAssetUsage(db, {
        assetId,
        entityType: INQUIRY_USAGE_TYPE,
        entityId: usageId,
      })
    },
    async finalizePrivateDocument(bindings: unknown, prepared: PreparedInquiryAttachment) {
      const db = resolveDb(bindings)
      const [row] = await db
        .select({ providerMeta: mediaAsset.providerMeta })
        .from(mediaAsset)
        .where(eq(mediaAsset.id, prepared.id))
        .limit(1)
      const marker = attachmentMarker(row?.providerMeta ?? null)
      if (!row) throw new Error("Private document preparation was not found")
      if (ownedOperationToken(marker, prepared.operationKey) !== prepared.ownerToken) {
        throw new Error("Private document preparation belongs to another operation")
      }
      if (marker?.state === "claimed") {
        return
      }
      if (marker?.state !== "prepared") {
        throw new Error("Private document preparation belongs to another operation")
      }
      if ((await countAssetUsage(db, prepared.id)) === 0) {
        throw new Error("Private document has no committed usage claim")
      }
      await db
        .update(mediaAsset)
        .set({
          providerMeta: {
            ...row.providerMeta,
            inquiryAttachment: { ...marker, state: "claimed", claimedAt: new Date().toISOString() },
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaAsset.id, prepared.id),
            sql`${mediaAsset.providerMeta} #>> '{inquiryAttachment,operationKey}' = ${prepared.operationKey}`,
          ),
        )
    },
    async abortPrivateDocument(bindings: unknown, prepared: PreparedInquiryAttachment) {
      const db = resolveDb(bindings)
      const [row] = await db
        .select({ providerMeta: mediaAsset.providerMeta })
        .from(mediaAsset)
        .where(eq(mediaAsset.id, prepared.id))
        .limit(1)
      if (!row) return
      const marker = attachmentMarker(row.providerMeta)
      if (ownedOperationToken(marker, prepared.operationKey) !== prepared.ownerToken) {
        throw new Error("Private document preparation belongs to another operation")
      }
      if (!prepared.created) return
      if ((await countAssetUsage(db, prepared.id)) > 0) return
      await queuePrivateDocumentPurge(db, prepared.id)
    },
    async releasePrivateDocument(dbValue: unknown, assetId: string, usageId: string) {
      await removeAssetUsage(dbValue as PostgresJsDatabase, {
        assetId,
        entityType: INQUIRY_USAGE_TYPE,
        entityId: usageId,
      })
    },
    requestPrivateDocumentPurge: (dbValue: unknown, assetId: string) =>
      queuePrivateDocumentPurge(dbValue as PostgresJsDatabase, assetId),
    resolvePrivateDocument,
    async downloadPrivateDocument(dbValue: unknown, bindings: unknown, assetId: string) {
      const asset = await resolvePrivateDocument(dbValue, assetId)
      if (!asset) return null
      const [stored] = await (dbValue as PostgresJsDatabase)
        .select({ storageKey: mediaAsset.storageKey })
        .from(mediaAsset)
        .where(eq(mediaAsset.id, assetId))
        .limit(1)
      const storage = host.primitives.storage.resolve(
        bindings,
        "documents",
      ) as StorageProvider | null
      const body = stored ? await storage?.get(stored.storageKey) : null
      return body ? { ...asset, body } : null
    },
  }

  return {
    [mediaInquiryAttachmentRuntimePort.id]: inquiryAttachmentRuntime,
    [mediaPreparedAttachmentCleanupRuntimePort.id]: {
      async cleanup(bindings: unknown, before: Date) {
        const db = resolveDb(bindings)
        const stale = await db
          .select({ id: mediaAsset.id, providerMeta: mediaAsset.providerMeta })
          .from(mediaAsset)
          .where(
            and(
              eq(mediaAsset.type, "document"),
              eq(mediaAsset.storageClass, "documents"),
              eq(mediaAsset.dedupScope, "inquiry-private"),
              inArray(sql<string>`${mediaAsset.providerMeta} #>> '{inquiryAttachment,state}'`, [
                "uploading",
                "prepared",
              ]),
              lte(
                sql<Date>`(${mediaAsset.providerMeta} #>> '{inquiryAttachment,preparedAt}')::timestamptz`,
                before,
              ),
            ),
          )
          .limit(100)
        let processed = 0
        for (const candidate of stale) {
          const marker = attachmentMarker(candidate.providerMeta)
          if ((await countAssetUsage(db, candidate.id)) > 0) {
            await db
              .update(mediaAsset)
              .set({
                providerMeta: {
                  ...candidate.providerMeta,
                  inquiryAttachment: {
                    ...marker,
                    state: "claimed",
                    claimedAt: new Date().toISOString(),
                    reconciledBy: "committed-media-usage",
                  },
                },
                updatedAt: new Date(),
              })
              .where(eq(mediaAsset.id, candidate.id))
          } else {
            await queuePrivateDocumentPurge(db, candidate.id)
          }
          processed += 1
        }

        const deletions = await db
          .select()
          .from(mediaPrivateDocumentDeletion)
          .where(lte(mediaPrivateDocumentDeletion.nextAttemptAt, new Date()))
          .limit(100)
        const storage = host.primitives.storage.resolve(
          bindings,
          "documents",
        ) as StorageProvider | null
        for (const deletion of deletions) {
          const ready = await db.transaction(async (tx) => {
            const [asset] = await tx
              .select({ providerMeta: mediaAsset.providerMeta })
              .from(mediaAsset)
              .where(eq(mediaAsset.id, deletion.assetId))
              .for("update")
              .limit(1)
            if (!asset) {
              await tx
                .delete(mediaPrivateDocumentDeletion)
                .where(eq(mediaPrivateDocumentDeletion.assetId, deletion.assetId))
              return false
            }
            if ((await countAssetUsage(tx, deletion.assetId)) > 0) {
              await tx
                .delete(mediaPrivateDocumentDeletion)
                .where(eq(mediaPrivateDocumentDeletion.assetId, deletion.assetId))
              return false
            }
            const marker = attachmentMarker(asset.providerMeta)
            await tx
              .update(mediaAsset)
              .set({
                providerMeta: {
                  ...asset.providerMeta,
                  inquiryAttachment: { ...marker, state: "deleting" },
                },
                updatedAt: new Date(),
              })
              .where(eq(mediaAsset.id, deletion.assetId))
            return true
          })
          if (!ready) continue
          try {
            if (!storage) throw new Error("Private document storage is unavailable")
            await storage.delete(deletion.storageKey)
            await db.transaction(async (tx) => {
              await tx.delete(mediaAsset).where(eq(mediaAsset.id, deletion.assetId))
              await tx
                .delete(mediaPrivateDocumentDeletion)
                .where(eq(mediaPrivateDocumentDeletion.assetId, deletion.assetId))
            })
            processed += 1
          } catch (error) {
            await db
              .update(mediaPrivateDocumentDeletion)
              .set({
                attempts: deletion.attempts + 1,
                lastError: error instanceof Error ? error.message : "Unknown deletion failure",
                nextAttemptAt: new Date(Date.now() + 60 * 60 * 1_000),
              })
              .where(eq(mediaPrivateDocumentDeletion.assetId, deletion.assetId))
          }
        }
        return processed
      },
    },
  }
}
