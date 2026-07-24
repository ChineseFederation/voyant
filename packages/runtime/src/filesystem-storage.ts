import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import type {
  StorageObject,
  StorageProvider,
  StorageProviderResolver,
  StorageUploadBody,
  UploadOptions,
  VoyantStorageName,
} from "@voyant-travel/storage/types"

/**
 * Node-only filesystem persistence for the local `memory` storage plan.
 *
 * The in-memory storage provider keeps bytes in a per-process `Map`, so uploaded
 * media/documents vanish on restart while their catalogue rows persist in
 * Postgres — leaving dangling references and broken thumbnails. This decorator
 * mirrors every uploaded object to disk under `dir` (namespaced per store) and
 * falls back to disk on read, so a self-hosted operator running without a
 * configured S3/R2 bucket keeps its uploads across restarts. Disk operations are
 * best-effort: a read-only or ephemeral filesystem degrades to memory-only
 * rather than failing the upload.
 *
 * This lives in `@voyant-travel/runtime` (Node-only) on purpose — the
 * `@voyant-travel/storage` package is isomorphic and must not import `node:fs`.
 */

async function toBytes(body: StorageUploadBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  return new Uint8Array(await body.arrayBuffer())
}

/** Resolve a key to an absolute path under `root`, rejecting traversal. */
function safeDiskPath(root: string, key: string): string | null {
  const resolved = path.resolve(root, key)
  const normalizedRoot = path.resolve(root)
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    return null
  }
  return resolved
}

function withDiskProvider(inner: StorageProvider, dir: string): StorageProvider {
  const provider: StorageProvider = {
    name: `${inner.name}+fs`,
    resolveBackendIdentity: async () => {
      const innerIdentity = await inner.resolveBackendIdentity?.()
      if (!innerIdentity) {
        throw new Error("Filesystem persistence requires the wrapped store backend identity.")
      }
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`filesystem:${path.resolve(dir)}:${innerIdentity}`),
      )
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
      )
    },
    async upload(body: StorageUploadBody, options?: UploadOptions): Promise<StorageObject> {
      const bytes = await toBytes(body)
      const result = await inner.upload(bytes, options)
      const filePath = safeDiskPath(dir, result.key)
      if (filePath) {
        try {
          await mkdir(path.dirname(filePath), { recursive: true })
          await writeFile(filePath, bytes)
        } catch {
          // Best-effort: keep the in-memory copy when the filesystem is unwritable.
        }
      }
      return result
    },
    async delete(key: string): Promise<void> {
      await inner.delete(key)
      const filePath = safeDiskPath(dir, key)
      if (filePath) {
        try {
          await rm(filePath, { force: true })
        } catch {
          // Best-effort.
        }
      }
    },
    async get(key: string): Promise<ArrayBuffer | null> {
      const fromMemory = await inner.get(key)
      if (fromMemory) return fromMemory
      const filePath = safeDiskPath(dir, key)
      if (!filePath) return null
      try {
        const buffer = await readFile(filePath)
        return new Uint8Array(buffer).buffer
      } catch {
        return null
      }
    },
  }
  if (inner.signedUrl) {
    provider.signedUrl = (key, expiresIn) => inner.signedUrl!(key, expiresIn)
  }
  return provider
}

async function syncDirectory(dir: string): Promise<void> {
  const handle = await open(dir, "r")
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function writeDurably(filePath: string, bytes: Uint8Array): Promise<void> {
  const parent = path.dirname(filePath)
  await mkdir(parent, { recursive: true })
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`
  try {
    const handle = await open(temporary, "wx")
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, filePath)
    await syncDirectory(parent)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

function withRequiredDiskProvider(inner: StorageProvider, dir: string): StorageProvider {
  const provider: StorageProvider = {
    name: `${inner.name}+required-fs`,
    resolveBackendIdentity: async () => {
      const innerIdentity = await inner.resolveBackendIdentity?.()
      if (!innerIdentity) {
        throw new Error("Durable document storage requires the wrapped store backend identity.")
      }
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`required-filesystem:${path.resolve(dir)}:${innerIdentity}`),
      )
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
      )
    },
    async upload(body: StorageUploadBody, options?: UploadOptions): Promise<StorageObject> {
      const bytes = await toBytes(body)
      const result = await inner.upload(bytes, options)
      const filePath = safeDiskPath(dir, result.key)
      if (!filePath) {
        await inner.delete(result.key).catch(() => undefined)
        throw new Error(`Durable document storage rejected unsafe object key "${result.key}".`)
      }
      try {
        await writeDurably(filePath, bytes)
      } catch (error) {
        await inner.delete(result.key).catch(() => undefined)
        throw error
      }
      return result
    },
    async delete(key: string): Promise<void> {
      const filePath = safeDiskPath(dir, key)
      if (!filePath)
        throw new Error(`Durable document storage rejected unsafe object key "${key}".`)
      await rm(filePath, { force: true })
      try {
        await syncDirectory(path.dirname(filePath))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
      await inner.delete(key)
    },
    async get(key: string): Promise<ArrayBuffer | null> {
      const filePath = safeDiskPath(dir, key)
      if (!filePath)
        throw new Error(`Durable document storage rejected unsafe object key "${key}".`)
      try {
        const buffer = await readFile(filePath)
        const copy = new Uint8Array(buffer.byteLength)
        copy.set(buffer)
        return copy.buffer
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      }
    },
  }
  if (inner.signedUrl) {
    provider.signedUrl = (key, expiresIn) => inner.signedUrl!(key, expiresIn)
  }
  return provider
}

/**
 * Wrap a storage resolver so each resolved store persists uploaded bytes to disk
 * under `${dir}/${name}` and reads fall back to disk. Resolved providers are
 * cached per store name so the disk decorator is stable across requests.
 */
export function withFilesystemPersistence(
  resolver: StorageProviderResolver,
  dir: string,
): StorageProviderResolver {
  const cache = new Map<string, StorageProvider | null>()
  return {
    resolve(name: VoyantStorageName): StorageProvider | null {
      const cached = cache.get(name)
      if (cached !== undefined) return cached
      const inner = resolver.resolve(name)
      const wrapped = inner ? withDiskProvider(inner, path.join(dir, name)) : null
      cache.set(name, wrapped)
      return wrapped
    },
  }
}

/**
 * Require restart-safe filesystem persistence for the documents store while
 * retaining the existing best-effort behavior for other local stores.
 */
export async function withRequiredDocumentFilesystemPersistence(
  resolver: StorageProviderResolver,
  dir: string,
): Promise<StorageProviderResolver> {
  const root = path.join(dir, "documents")
  await mkdir(root, { recursive: true })
  const probe = path.join(root, `.voyant-storage-probe-${crypto.randomUUID()}`)
  const probeBytes = new TextEncoder().encode("voyant-durable-document-storage")
  try {
    await writeDurably(probe, probeBytes)
    const persisted = await readFile(probe)
    if (!persisted.equals(probeBytes)) {
      throw new Error("Durable document storage startup probe returned different bytes.")
    }
  } finally {
    await rm(probe, { force: true })
  }
  await syncDirectory(root)

  const bestEffort = withFilesystemPersistence(resolver, dir)
  let documents: StorageProvider | null | undefined
  return {
    resolve(name: VoyantStorageName): StorageProvider | null {
      if (name !== "documents") return bestEffort.resolve(name)
      if (documents !== undefined) return documents
      const inner = resolver.resolve("documents")
      if (!inner) {
        throw new Error("Durable document storage requires a documents store.")
      }
      documents = withRequiredDiskProvider(inner, root)
      return documents
    },
  }
}

/**
 * Resolve the on-disk root for local storage persistence. Honors
 * `STORAGE_LOCAL_DIR`; otherwise defaults to `<cwd>/.voyant/storage`.
 */
export function resolveLocalStorageDir(env: Record<string, unknown>): string {
  const explicit = typeof env.STORAGE_LOCAL_DIR === "string" ? env.STORAGE_LOCAL_DIR.trim() : ""
  return explicit ? path.resolve(explicit) : path.resolve(process.cwd(), ".voyant", "storage")
}
