import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { createLocalStorageProvider } from "@voyant-travel/storage/providers/local"
import type { StorageProviderResolver } from "@voyant-travel/storage/types"
import { afterEach, describe, expect, it } from "vitest"

import { withRequiredDocumentFilesystemPersistence } from "./filesystem-storage.js"

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const result = await mkdtemp(path.join(tmpdir(), "voyant-document-storage-"))
  temporaryDirectories.push(result)
  return result
}

function memoryResolver(): StorageProviderResolver {
  const documents = createLocalStorageProvider({ name: "memory:documents", baseUrl: "/documents/" })
  const media = createLocalStorageProvider({ name: "memory:media", baseUrl: "/media/" })
  return {
    resolve(name) {
      return name === "documents" ? documents : media
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true })))
})

describe("required document filesystem persistence", () => {
  it("reads finalized bytes from a fresh in-memory resolver after restart", async () => {
    const dir = await temporaryDirectory()
    const first = await withRequiredDocumentFilesystemPersistence(memoryResolver(), dir)
    await first.resolve("documents")!.upload(new Uint8Array([1, 2, 3]), {
      key: "legal/final.pdf",
    })

    const restarted = await withRequiredDocumentFilesystemPersistence(memoryResolver(), dir)
    await expect(restarted.resolve("documents")!.get("legal/final.pdf")).resolves.toEqual(
      new Uint8Array([1, 2, 3]).buffer,
    )
  })

  it("fails startup when the durable documents path is unavailable", async () => {
    const dir = await temporaryDirectory()
    const file = path.join(dir, "not-a-directory")
    await writeFile(file, "occupied")

    await expect(
      withRequiredDocumentFilesystemPersistence(memoryResolver(), file),
    ).rejects.toThrow()
  })

  it("fails an upload when durable persistence becomes unavailable", async () => {
    const dir = await temporaryDirectory()
    const resolver = await withRequiredDocumentFilesystemPersistence(memoryResolver(), dir)
    await rm(path.join(dir, "documents"), { recursive: true })
    await writeFile(path.join(dir, "documents"), "occupied")

    await expect(
      resolver.resolve("documents")!.upload(new Uint8Array([1]), { key: "legal/final.pdf" }),
    ).rejects.toThrow()
  })

  it("deletes an already-absent object when its parent directory does not exist", async () => {
    const dir = await temporaryDirectory()
    const resolver = await withRequiredDocumentFilesystemPersistence(memoryResolver(), dir)
    const documents = resolver.resolve("documents")!

    await expect(documents.delete("legal/provider-conformance")).resolves.toBeUndefined()
    await expect(documents.delete("legal/provider-conformance")).resolves.toBeUndefined()
  })
})
