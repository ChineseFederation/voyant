import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { PGlite } from "@electric-sql/pglite"
import { createLocalStorageProvider } from "@voyant-travel/storage"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createMediaRuntimePortContribution } from "./runtime-contributor.js"
import { createMediaAsset } from "./service.js"
import {
  type MediaInquiryAttachmentRuntime,
  type MediaPreparedAttachmentCleanupRuntime,
  mediaInquiryAttachmentRuntimePort,
  mediaPreparedAttachmentCleanupRuntimePort,
} from "./runtime-port.js"
import * as schema from "./schema.js"

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url))
const migrations = () =>
  readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(new URL(file, `file://${migrationsDir}`), "utf8"))
    .join("\n")

describe("Media Inquiry attachment owner runtime", () => {
  let client: PGlite
  let db: PostgresJsDatabase
  const documents = createLocalStorageProvider({ name: "memory:documents" })
  let attachments: MediaInquiryAttachmentRuntime
  let cleanup: MediaPreparedAttachmentCleanupRuntime

  beforeEach(async () => {
    client = new PGlite()
    await client.exec(migrations())
    db = drizzle(client, { schema }) as unknown as PostgresJsDatabase
    const contribution = createMediaRuntimePortContribution({
      primitives: {
        env: () => ({}),
        database: {
          resolve: <TDatabase>() => db as unknown as TDatabase,
          fromContext: <TDatabase>() => db as unknown as TDatabase,
          transaction: async (_bindings, operation) => operation(db),
        },
        storage: {
          resolve: () => documents,
          read: async () => null,
          downloadUrl: async () => null,
        },
        events: { deliver: async () => undefined },
        jobs: { wakeAt: () => undefined },
        config: { read: () => undefined },
      },
    })
    attachments = contribution[
      mediaInquiryAttachmentRuntimePort.id
    ] as MediaInquiryAttachmentRuntime
    cleanup = contribution[
      mediaPreparedAttachmentCleanupRuntimePort.id
    ] as MediaPreparedAttachmentCleanupRuntime
  })

  afterEach(async () => client.close())

  it("hides and removes an unclaimed preparation after its bounded TTL", async () => {
    const prepared = await attachments.preparePrivateDocument({}, {
      operationKey: "test_cleanup_operation",
      name: "brief.pdf",
      mimeType: "application/pdf",
      body: new TextEncoder().encode("cleanup").buffer,
      createdBy: "user_1",
    })
    expect(await attachments.resolvePrivateDocument(db, prepared.id)).toBeNull()
    expect(await cleanup.cleanup({}, new Date(Date.now() + 1_000))).toBeGreaterThan(0)
    expect(await attachments.resolvePrivateDocument(db, prepared.id)).toBeNull()
  })

  it("recovers a commit-before-finalize retry and finalizes idempotently", async () => {
    const input = {
      operationKey: "test_finalize_operation",
      name: "brief.pdf",
      mimeType: "application/pdf",
      body: new TextEncoder().encode("same-content").buffer,
      createdBy: "user_1",
    }
    const prepared = await attachments.preparePrivateDocument({}, input)
    const retry = await attachments.preparePrivateDocument({}, input)
    expect(retry.id).toBe(prepared.id)
    expect(retry.operationKey).toBe(prepared.operationKey)
    await attachments.claimPrivateDocument(db, retry, "test_usage_one")
    await attachments.finalizePrivateDocument({}, retry)
    await attachments.finalizePrivateDocument({}, retry)
    const foreign = {
      ...retry,
      operationKey: "test_foreign_claimed_operation",
      ownerToken: "test_foreign_owner_token",
    }
    await expect(attachments.finalizePrivateDocument({}, foreign)).rejects.toThrow(
      "another operation",
    )
    await expect(attachments.abortPrivateDocument({}, foreign)).rejects.toThrow(
      "another operation",
    )
    expect(await attachments.resolvePrivateDocument(db, prepared.id)).toMatchObject({
      id: prepared.id,
      name: "Private Inquiry document",
    })
    expect((await attachments.downloadPrivateDocument(db, {}, prepared.id))?.body).toBeInstanceOf(
      ArrayBuffer,
    )
  })

  it("reconciles a committed Media usage claim when finalize was lost", async () => {
    const prepared = await attachments.preparePrivateDocument({}, {
      operationKey: "test_linked_operation",
      name: "linked-brief.pdf",
      mimeType: "application/pdf",
      body: new TextEncoder().encode("linked-cleanup").buffer,
      createdBy: "user_1",
    })
    await attachments.claimPrivateDocument(db, prepared, "test_committed_link")

    expect(await cleanup.cleanup({}, new Date(Date.now() + 1_000))).toBe(1)
    expect(await attachments.resolvePrivateDocument(db, prepared.id)).toMatchObject({
      id: prepared.id,
      name: "Private Inquiry document",
    })
    expect((await attachments.downloadPrivateDocument(db, {}, prepared.id))?.body).toBeInstanceOf(
      ArrayBuffer,
    )
  })

  it("isolates library dedup while retrying only the owning Inquiry preparation", async () => {
    const body = new TextEncoder().encode("library-document").buffer
    const direct = await createMediaAsset(
      db,
      documents,
      {
        type: "document",
        storageClass: "documents",
        name: "library.pdf",
        mimeType: "application/pdf",
        defaultLanguageTag: "en",
        createdBy: "user_1",
      },
      body,
    )
    const prepared = await attachments.preparePrivateDocument({}, {
      operationKey: "test_dedup_operation",
      name: "library.pdf",
      mimeType: "application/pdf",
      body,
      createdBy: "user_1",
    })
    expect(prepared.id).not.toBe(direct.asset.id)
    expect(prepared.created).toBe(true)
    const rows = await db
      .select({ id: schema.mediaAsset.id, dedupScope: schema.mediaAsset.dedupScope })
      .from(schema.mediaAsset)
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: direct.asset.id, dedupScope: "library" },
        { id: prepared.id, dedupScope: "inquiry-private" },
      ]),
    )
    const retry = await attachments.preparePrivateDocument({}, {
      operationKey: "test_dedup_operation",
      name: "library.pdf",
      mimeType: "application/pdf",
      body,
      createdBy: "user_1",
    })
    expect(retry).toMatchObject({ id: prepared.id, created: false })
    await attachments.claimPrivateDocument(db, retry, "test_dedup_usage")
    await attachments.finalizePrivateDocument({}, retry)
    expect(await attachments.resolvePrivateDocument(db, retry.id)).not.toBeNull()

    const pending = await attachments.preparePrivateDocument({}, {
      operationKey: "test_owner_operation",
      name: "pending.pdf",
      mimeType: "application/pdf",
      body: new TextEncoder().encode("pending-document").buffer,
      createdBy: "user_1",
    })
    await expect(
      attachments.preparePrivateDocument({}, {
        operationKey: "test_foreign_operation",
        name: "pending.pdf",
        mimeType: "application/pdf",
        body: new TextEncoder().encode("pending-document").buffer,
        createdBy: "user_2",
      }),
    ).rejects.toThrow("another operation")
    await attachments.abortPrivateDocument({}, pending)
  })

  it("durably purges released documents and never age-deletes claimed documents", async () => {
    const unreferenced = await attachments.preparePrivateDocument({}, {
      operationKey: "test_purge_operation",
      name: "free.pdf",
      mimeType: "application/pdf",
      body: new TextEncoder().encode("free").buffer,
      createdBy: "user_1",
    })
    await attachments.claimPrivateDocument(db, unreferenced, "test_purge_usage")
    await attachments.finalizePrivateDocument({}, unreferenced)
    await attachments.releasePrivateDocument(db, unreferenced.id, "test_purge_usage")
    await attachments.requestPrivateDocumentPurge(db, unreferenced.id)
    expect(await cleanup.cleanup({}, new Date(Date.now() + 1_000))).toBeGreaterThan(0)
    expect(await attachments.resolvePrivateDocument(db, unreferenced.id)).toBeNull()

    const linked = await attachments.preparePrivateDocument({}, {
      operationKey: "test_retained_operation",
      name: "retained.pdf",
      mimeType: "application/pdf",
      body: new TextEncoder().encode("retained").buffer,
      createdBy: "user_1",
    })
    await attachments.claimPrivateDocument(db, linked, "test_retained_usage")
    await attachments.finalizePrivateDocument({}, linked)
    expect(await cleanup.cleanup({}, new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000))).toBe(0)
    expect(await attachments.resolvePrivateDocument(db, linked.id)).not.toBeNull()
  })

  it("cancels a queued purge when a new usage is claimed before deletion starts", async () => {
    const prepared = await attachments.preparePrivateDocument({}, {
      operationKey: "test_reclaim_operation",
      name: "reclaimed.pdf",
      mimeType: "application/pdf",
      body: new TextEncoder().encode("reclaimed").buffer,
      createdBy: "user_1",
    })
    await attachments.claimPrivateDocument(db, prepared, "test_old_usage")
    await attachments.finalizePrivateDocument({}, prepared)
    await attachments.releasePrivateDocument(db, prepared.id, "test_old_usage")
    await attachments.requestPrivateDocumentPurge(db, prepared.id)

    await attachments.claimPrivateDocument(db, prepared, "test_new_usage")
    expect(await cleanup.cleanup({}, new Date())).toBe(0)
    expect(await attachments.resolvePrivateDocument(db, prepared.id)).not.toBeNull()
    expect(
      await db
        .select()
        .from(schema.mediaPrivateDocumentDeletion)
        .where(eq(schema.mediaPrivateDocumentDeletion.assetId, prepared.id)),
    ).toEqual([])
  })

  it("retries durable deletion after object storage fails", async () => {
    const prepared = await attachments.preparePrivateDocument({}, {
      operationKey: "test_storage_retry",
      name: "retry.pdf",
      mimeType: "application/pdf",
      body: new TextEncoder().encode("retry-delete").buffer,
      createdBy: "user_1",
    })
    await attachments.claimPrivateDocument(db, prepared, "test_storage_usage")
    await attachments.finalizePrivateDocument({}, prepared)
    await attachments.releasePrivateDocument(db, prepared.id, "test_storage_usage")
    await attachments.requestPrivateDocumentPurge(db, prepared.id)

    vi.spyOn(documents, "delete").mockRejectedValueOnce(new Error("storage unavailable"))
    expect(await cleanup.cleanup({}, new Date())).toBe(0)
    // Once deletion has been claimed by the owner job, new readers and usage
    // claims cannot race the object removal. The durable ledger drives retry.
    expect(await attachments.resolvePrivateDocument(db, prepared.id)).toBeNull()
    await db
      .update(schema.mediaPrivateDocumentDeletion)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(schema.mediaPrivateDocumentDeletion.assetId, prepared.id))
    expect(await cleanup.cleanup({}, new Date())).toBe(1)
    expect(await attachments.resolvePrivateDocument(db, prepared.id)).toBeNull()
  })
})
