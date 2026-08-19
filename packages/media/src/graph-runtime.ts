/**
 * `@voyant-travel/media` graph runtime — the package-owned adapter from the
 * deployment port registry to the media-library admin route factory.
 *
 * A deployment selects this module; the framework resolves the `"media"`
 * object-storage provider through the storage runtime port
 * (`storageMediaRuntimePort` → `resolveStorage`) and this factory injects it
 * into `createMediaLibraryApiModule`. Mirrors the storage
 * `createStorageVoyantRuntime` seam (routes stay absolute + lazy; only the
 * resolved provider is threaded in).
 */

import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import {
  storageMediaRuntimePort,
  storageObjectRuntimePort,
} from "@voyant-travel/storage/runtime-port"

import { createMediaLibraryApiModule } from "./routes.js"
import { mediaSiteClientAuthRuntimePort } from "./runtime-port.js"

/** Adapter from the graph port registry to the media-library route factory. */
export const createMediaVoyantRuntime = defineGraphRuntimeFactory(async ({ getPort, hasPort }) => {
  const storage = await getPort(storageMediaRuntimePort)
  const objectStorage = await getPort(storageObjectRuntimePort)
  return createMediaLibraryApiModule({
    resolveStorage: storage.resolveStorage,
    resolveDocumentStorage: () => objectStorage.resolve("documents"),
    siteClientAuth: hasPort(mediaSiteClientAuthRuntimePort)
      ? await getPort(mediaSiteClientAuthRuntimePort)
      : undefined,
  })
})
