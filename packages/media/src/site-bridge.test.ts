import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { PGlite } from "@electric-sql/pglite"
import { createLocalStorageProvider } from "@voyant-travel/storage"
import { drizzle } from "drizzle-orm/pglite"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import * as schema from "./schema.js"
import { createMediaSiteBridgeRoutes } from "./site-bridge.js"

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url))

function loadMigrations(): string {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(new URL(file, `file://${migrationsDir}`), "utf-8"))
    .join("\n")
}

describe("media site bridge", () => {
  let client: PGlite
  let db: PostgresJsDatabase

  beforeEach(async () => {
    client = new PGlite()
    await client.exec(loadMigrations())
    db = drizzle(client, { schema }) as unknown as PostgresJsDatabase
  })

  afterEach(async () => {
    await client.close()
  })

  function app(authorized: boolean) {
    const root = new Hono()
    root.use("*", async (context, next) => {
      context.set("db" as never, db as never)
      await next()
    })
    root.route(
      "/",
      createMediaSiteBridgeRoutes({
        auth: { authorize: async () => authorized },
        resolveStorage: () =>
          createLocalStorageProvider({
            name: "site-bridge-test",
            baseUrl: "https://cdn.example.test/",
          }),
      }),
    )
    return root
  }

  it("fails closed before reading an unauthenticated request", async () => {
    const response = await app(false).request(
      "http://test/v1/admin/media-library/site-bridge?action=list",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" })
  })

  it("uploads and lists shared assets for an authenticated site", async () => {
    const form = new FormData()
    form.set("file", new File(["image bytes"], "sunset.jpg", { type: "image/jpeg" }))
    form.set("type", "image")
    form.set("altText", "Plaja la apus")
    form.set("defaultLanguageTag", "ro")
    form.set("altTranslations", JSON.stringify([{ languageTag: "en", altText: "Beach at sunset" }]))

    const upload = await app(true).request(
      "http://test/v1/admin/media-library/site-bridge?action=upload",
      {
        method: "POST",
        body: form,
      },
    )
    expect(upload.status).toBe(201)
    const uploaded = (await upload.json()) as {
      data: {
        id: string
        url: string
        altText: string
        altTranslations: unknown[]
      }
    }
    expect(uploaded.data.url).toMatch(/^https:\/\/cdn\.example\.test\//)
    expect(uploaded.data.altText).toBe("Plaja la apus")
    expect(uploaded.data.altTranslations).toHaveLength(1)

    const list = await app(true).request(
      "http://test/v1/admin/media-library/site-bridge?action=list",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 20, offset: 0 }),
      },
    )
    expect(list.status).toBe(200)
    await expect(list.json()).resolves.toMatchObject({
      total: 1,
      data: [{ altText: "Plaja la apus" }],
    })

    const usage = {
      assetId: uploaded.data.id,
      entityType: "payload.media",
      entityId: "local-media-1",
    }
    const recorded = await app(true).request(
      "http://test/v1/admin/media-library/site-bridge?action=record-usage",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(usage),
      },
    )
    expect(recorded.status).toBe(201)

    const removed = await app(true).request(
      "http://test/v1/admin/media-library/site-bridge?action=remove-usage",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(usage),
      },
    )
    expect(removed.status).toBe(200)
    await expect(removed.json()).resolves.toEqual({
      data: { removed: true },
    })
  })
})
