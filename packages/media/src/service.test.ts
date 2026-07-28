/**
 * `@voyant-travel/media` service tests. These run against a real Postgres engine
 * in-process via PGlite (WASM) — no docker/external DB — so they exercise the
 * genuine unique-constraint / query behaviour the service relies on. The
 * generated baseline migration is applied verbatim, proving schema parity.
 */

import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { PGlite } from "@electric-sql/pglite"
import type { StorageProvider } from "@voyant-travel/storage"
import { createLocalStorageProvider } from "@voyant-travel/storage"
import { drizzle } from "drizzle-orm/pglite"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import * as schema from "./schema.js"
import {
  addAssetToFolder,
  countAssetUsage,
  createMediaAsset,
  createMediaFolder,
  deleteMediaAsset,
  getMediaAsset,
  listAssetFolderIds,
  listAssetUsage,
  listMediaAssets,
  MediaError,
  recordAssetUsage,
  removeAssetFromFolder,
  removeAssetUsage,
  updateMediaAsset,
} from "./service.js"

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url))

function loadBaselineSql(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(new URL(f, `file://${migrationsDir}`), "utf-8"))
    .join("\n")
}

/** Minimal metadata for an image asset under test. */
const imageInput = {
  type: "image",
  name: "beach.jpg",
  mimeType: "image/jpeg",
  defaultLanguageTag: "en",
} as const

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/**
 * Narrow adapter seam bridging the in-process PGlite drizzle instance to the
 * postgres-js surface the service is typed against. Their Drizzle query APIs are
 * identical (both extend `PgDatabase`); the service never touches driver-specific
 * behaviour, so this test-only bridge is safe.
 */
function asServiceDb(db: unknown): PostgresJsDatabase {
  return db as PostgresJsDatabase
}

describe("@voyant-travel/media service (pglite)", () => {
  let client: PGlite
  let db: PostgresJsDatabase
  let storage: StorageProvider

  beforeEach(async () => {
    client = new PGlite()
    await client.exec(loadBaselineSql())
    db = asServiceDb(drizzle(client, { schema }))
    storage = createLocalStorageProvider({
      name: "memory:media",
      baseUrl: "https://cdn.example.test/",
    })
  })

  afterEach(async () => {
    await client.close()
  })

  it("dedups identical bytes to the same asset id and stores bytes only once", async () => {
    const bytes = bytesOf("the-very-same-bytes")

    const first = await createMediaAsset(db, storage, imageInput, bytes)
    expect(first.deduped).toBe(false)

    const second = await createMediaAsset(
      db,
      storage,
      { ...imageInput, name: "beach-copy.jpg" },
      bytes,
    )

    expect(second.deduped).toBe(true)
    expect(second.asset.id).toBe(first.asset.id)
    // Same checksum ⇒ same storage key ⇒ a single stored object.
    expect(second.asset.storageKey).toBe(first.asset.storageKey)
    const stored = await storage.get(first.asset.storageKey)
    expect(stored).not.toBeNull()

    // Different bytes ⇒ a distinct asset.
    const other = await createMediaAsset(db, storage, imageInput, bytesOf("different-bytes"))
    expect(other.deduped).toBe(false)
    expect(other.asset.id).not.toBe(first.asset.id)
  })

  it("blocks deletion while the asset is in use, then allows it once freed", async () => {
    const { asset } = await createMediaAsset(db, storage, imageInput, bytesOf("in-use-asset"))

    await recordAssetUsage(db, {
      assetId: asset.id,
      entityType: "product",
      entityId: "prod_123",
    })
    expect(await countAssetUsage(db, asset.id)).toBe(1)

    await expect(deleteMediaAsset(db, storage, asset.id)).rejects.toMatchObject({
      code: "asset_in_use",
    })
    await expect(deleteMediaAsset(db, storage, asset.id)).rejects.toBeInstanceOf(MediaError)

    // Remove the reference, then deletion succeeds and the bytes are cleaned up.
    expect(
      await removeAssetUsage(db, {
        assetId: asset.id,
        entityType: "product",
        entityId: "prod_123",
      }),
    ).toBe(true)

    const deleted = await deleteMediaAsset(db, storage, asset.id)
    expect(deleted?.id).toBe(asset.id)
    expect(await storage.get(asset.storageKey)).toBeNull()
  })

  it("adds and removes folder membership", async () => {
    const { asset } = await createMediaAsset(db, storage, imageInput, bytesOf("folder-asset"))
    const folder = await createMediaFolder(db, { name: "Summer" })

    const member = await addAssetToFolder(db, folder.id, asset.id)
    expect(member.assetId).toBe(asset.id)
    expect(member.folderId).toBe(folder.id)
    expect(await listAssetFolderIds(db, asset.id)).toEqual([folder.id])

    // Adding again is idempotent (unique on assetId+folderId).
    const again = await addAssetToFolder(db, folder.id, asset.id)
    expect(again.id).toBe(member.id)
    expect(await listAssetFolderIds(db, asset.id)).toEqual([folder.id])

    expect(await removeAssetFromFolder(db, folder.id, asset.id)).toBe(true)
    expect(await listAssetFolderIds(db, asset.id)).toEqual([])
    // Removing a non-member returns false.
    expect(await removeAssetFromFolder(db, folder.id, asset.id)).toBe(false)
  })

  it("records usage idempotently and lists it with filters", async () => {
    const { asset: a } = await createMediaAsset(db, storage, imageInput, bytesOf("usage-a"))
    const { asset: b } = await createMediaAsset(db, storage, imageInput, bytesOf("usage-b"))

    await recordAssetUsage(db, { assetId: a.id, entityType: "product", entityId: "prod_1" })
    // Same tuple again ⇒ no duplicate row.
    await recordAssetUsage(db, { assetId: a.id, entityType: "product", entityId: "prod_1" })
    await recordAssetUsage(db, { assetId: a.id, entityType: "quote", entityId: "quote_9" })
    await recordAssetUsage(db, { assetId: b.id, entityType: "product", entityId: "prod_2" })

    const all = await listAssetUsage(db, { limit: 50, offset: 0 })
    expect(all.total).toBe(3)

    const forA = await listAssetUsage(db, { assetId: a.id, limit: 50, offset: 0 })
    expect(forA.total).toBe(2)

    const products = await listAssetUsage(db, { entityType: "product", limit: 50, offset: 0 })
    expect(products.total).toBe(2)
    expect(products.data.every((row) => row.entityType === "product")).toBe(true)
  })

  it("derives the delivery URL from the provider and stores localized alt text", async () => {
    const { asset } = await createMediaAsset(
      db,
      storage,
      {
        ...imageInput,
        altText: "Plaja la apus",
        defaultLanguageTag: "ro",
        altTranslations: [{ languageTag: "en", altText: "Beach at sunset" }],
      },
      bytesOf("localized-media"),
    )

    expect(asset.url).toBe(`https://cdn.example.test/${asset.storageKey}`)
    expect(asset.altText).toBe("Plaja la apus")
    expect(asset.defaultLanguageTag).toBe("ro")
    expect(asset.altTranslations).toEqual([
      expect.objectContaining({
        assetId: asset.id,
        languageTag: "en",
        altText: "Beach at sunset",
      }),
    ])

    const updated = await updateMediaAsset(
      db,
      asset.id,
      {
        altTranslations: [
          { languageTag: "en", altText: "Sunset beach" },
          { languageTag: "de", altText: "Strand bei Sonnenuntergang" },
        ],
      },
      storage,
    )
    expect(
      updated?.altTranslations.map(({ languageTag, altText }) => ({ languageTag, altText })),
    ).toEqual([
      { languageTag: "de", altText: "Strand bei Sonnenuntergang" },
      { languageTag: "en", altText: "Sunset beach" },
    ])

    expect((await getMediaAsset(db, asset.id, storage))?.altTranslations).toHaveLength(2)
    const listed = await listMediaAssets(db, { limit: 50, offset: 0 }, storage)
    expect(listed.data[0]?.altTranslations).toHaveLength(2)

    await expect(
      updateMediaAsset(db, asset.id, {
        defaultLanguageTag: "en",
      }),
    ).rejects.toMatchObject({ code: "invalid_alt_translation" })
  })

  it("re-derives delivery URLs after the media origin changes (voyant#3845)", async () => {
    const { asset } = await createMediaAsset(db, storage, imageInput, bytesOf("origin-move"))
    expect(asset.url).toBe(`https://cdn.example.test/${asset.storageKey}`)

    // The deployment's media CDN moves to a new hostname. Nothing about the
    // bucket, the object keys or `storage_key` changes — only the origin.
    const movedStorage = createLocalStorageProvider({
      name: "memory:media",
      baseUrl: "https://cdn.moved.test/",
    })

    expect((await getMediaAsset(db, asset.id, movedStorage))?.url).toBe(
      `https://cdn.moved.test/${asset.storageKey}`,
    )
    const listed = await listMediaAssets(db, { limit: 50, offset: 0 }, movedStorage)
    expect(listed.data[0]?.url).toBe(`https://cdn.moved.test/${asset.storageKey}`)
    expect(listed.data[0]?.storageKey).toBe(asset.storageKey)
  })

  it("reports a null URL when the store exposes no public origin", async () => {
    const { asset } = await createMediaAsset(db, storage, imageInput, bytesOf("private-store"))

    // A provider without `publicUrl` (or one whose bucket is private) must not
    // fall back to a stale persisted origin — consumers serve the bytes through
    // the deployment's own media route instead.
    const privateStorage: StorageProvider = {
      ...storage,
      publicUrl: () => null,
    }

    expect((await getMediaAsset(db, asset.id, privateStorage))?.url).toBeNull()
    expect((await getMediaAsset(db, asset.id))?.url).toBeNull()
  })
})
