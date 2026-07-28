import type { StorageProvider } from "./types.js"

export interface StorageProviderConformanceOptions {
  createProvider: () => StorageProvider | Promise<StorageProvider>
  key?: string
}

/** Exercise the portable object-storage contract against a provider instance. */
export async function assertStorageProviderConformance(
  options: StorageProviderConformanceOptions,
): Promise<void> {
  const provider = await options.createProvider()
  const key = options.key ?? `voyant-conformance/${globalThis.crypto.randomUUID()}`
  const expected = new Uint8Array([0, 1, 2, 127, 255])

  // Derivation must be pure: same key in, same URL out (voyant#3845). Sampled
  // before the upload so the post-upload comparison below can prove it does not
  // depend on the object existing — a provider that only derives for objects it
  // has already seen would otherwise pass by returning `null` twice.
  const publicUrlBeforeUpload = provider.publicUrl?.(key) ?? null
  if (provider.publicUrl) {
    assert(
      publicUrlBeforeUpload === provider.publicUrl(key),
      "publicUrl is not stable for the same key",
    )
    if (publicUrlBeforeUpload !== null) {
      assert(
        publicUrlBeforeUpload.trim().length > 0,
        "publicUrl returned an empty URL instead of null",
      )
    }
  }

  const uploaded = await provider.upload(expected, {
    key,
    contentType: "application/octet-stream",
    metadata: { conformance: "true" },
  })
  assert(uploaded.key === key, `upload returned key ${uploaded.key}; expected ${key}`)

  if (provider.publicUrl) {
    const publicUrlAfterUpload = provider.publicUrl(key)
    assert(
      publicUrlAfterUpload === publicUrlBeforeUpload,
      `publicUrl changed once the object existed (${publicUrlBeforeUpload} -> ${publicUrlAfterUpload}); it must derive from configuration, not from object state`,
    )
  }

  const stored = await provider.get(key)
  assert(stored !== null, "get returned null after upload")
  assert(equalBytes(new Uint8Array(stored), expected), "get returned different bytes than upload")

  if (provider.signedUrl) {
    const signedUrl = await provider.signedUrl(key, 60)
    assert(signedUrl.trim().length > 0, "signedUrl returned an empty URL")
  }

  await provider.delete(key)
  assert((await provider.get(key)) === null, "get returned an object after delete")
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Storage provider conformance failed: ${message}`)
}
