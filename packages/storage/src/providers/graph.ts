import type { StorageProvider, StorageProviderResolver, VoyantStorageName } from "../types.js"
import { createGatewayStorageProvider } from "./gateway.js"
import { createLocalStorageProvider } from "./local.js"
import { createS3CompatibleStorageProvider } from "./s3-compatible.js"

interface StorageGraphProviderContext {
  getConfig: <T = unknown>(declarationId: string) => T | undefined
  getSecret: <T = unknown>(declarationId: string) => T | undefined
}

const CONFIG = {
  apiBaseUrl: "@voyant-travel/storage#config.api-base-url",
  appUrl: "@voyant-travel/storage#config.app-url",
  region: "@voyant-travel/storage#config.s3-region",
  endpoint: "@voyant-travel/storage#config.s3-endpoint",
  forcePathStyle: "@voyant-travel/storage#config.s3-force-path-style",
  backendIdentity: "@voyant-travel/storage#config.s3-backend-identity",
  documentsBucket: "@voyant-travel/storage#config.documents-bucket",
  mediaBucket: "@voyant-travel/storage#config.media-bucket",
  mediaPublicBaseUrl: "@voyant-travel/storage#config.media-public-base-url",
  gatewayEndpoint: "@voyant-travel/storage#config.gateway-endpoint",
} as const

const SECRET = {
  accessKeyId: "@voyant-travel/storage#secret.s3-access-key-id",
  secretAccessKey: "@voyant-travel/storage#secret.s3-secret-access-key",
  sessionToken: "@voyant-travel/storage#secret.s3-session-token",
  gatewayToken: "@voyant-travel/storage#secret.gateway-token",
} as const

/** In-memory resolver selected by deployment.providers.storage. */
export function createMemoryGraphStorageProvider(
  context: StorageGraphProviderContext,
): StorageProviderResolver {
  const apiBaseUrl = resolveApiBaseUrl(context)
  return fixedStores({
    documents: createLocalStorageProvider({
      name: "memory:documents",
      baseUrl: `${apiBaseUrl}/v1/admin/documents/files/`,
    }),
    media: createLocalStorageProvider({
      name: "memory:media",
      baseUrl: `${apiBaseUrl}/v1/admin/media/`,
    }),
  })
}

/** AWS SDK-backed resolver for S3, R2, GCS XML API, MinIO, and compatible stores. */
export function createS3CompatibleGraphStorageProvider(
  context: StorageGraphProviderContext,
): StorageProviderResolver {
  const endpoint = optionalString(context.getConfig(CONFIG.endpoint), "S3_ENDPOINT")
  const accessKeyId = optionalString(context.getSecret(SECRET.accessKeyId), "S3_ACCESS_KEY_ID")
  const secretAccessKey = optionalString(
    context.getSecret(SECRET.secretAccessKey),
    "S3_SECRET_ACCESS_KEY",
  )
  const sessionToken = optionalString(context.getSecret(SECRET.sessionToken), "S3_SESSION_TOKEN")
  const forcePathStyle = parseOptionalBoolean(
    context.getConfig(CONFIG.forcePathStyle),
    "S3_FORCE_PATH_STYLE",
  )
  const backendIdentity = optionalString(
    context.getConfig(CONFIG.backendIdentity),
    "STORAGE_S3_BACKEND_IDENTITY",
  )
  const shared = {
    region: requiredString(context.getConfig(CONFIG.region), "S3_REGION"),
    ...(endpoint ? { endpoint } : {}),
    ...(accessKeyId ? { accessKeyId } : {}),
    ...(secretAccessKey ? { secretAccessKey } : {}),
    ...(sessionToken ? { sessionToken } : {}),
    ...(forcePathStyle === undefined ? {} : { forcePathStyle }),
    ...(backendIdentity ? { backendIdentity } : {}),
  }
  const mediaPublicBaseUrl =
    optionalString(context.getConfig(CONFIG.mediaPublicBaseUrl), "MEDIA_PUBLIC_BASE_URL") ??
    `${resolveApiBaseUrl(context)}/v1/admin/media`

  return fixedStores({
    documents: createS3CompatibleStorageProvider({
      ...shared,
      name: "s3-compatible:documents",
      bucket: requiredString(context.getConfig(CONFIG.documentsBucket), "STORAGE_DOCUMENTS_BUCKET"),
    }),
    media: createS3CompatibleStorageProvider({
      ...shared,
      name: "s3-compatible:media",
      bucket: requiredString(context.getConfig(CONFIG.mediaBucket), "STORAGE_MEDIA_BUCKET"),
      publicBaseUrl: mediaPublicBaseUrl,
    }),
  })
}

/**
 * HTTP storage-gateway resolver selected by managed deployments. Instead of raw
 * bucket credentials, both stores talk to the platform asset-gateway worker with
 * a workspace-scoped bearer token; the gateway brokers R2 access scoped to the
 * caller's `<jurisdiction>/<org>` prefix. Documents and media share one gateway
 * endpoint + token and differ only by object key.
 */
export function createGatewayGraphStorageProvider(
  context: StorageGraphProviderContext,
): StorageProviderResolver {
  const endpoint = requiredString(
    context.getConfig(CONFIG.gatewayEndpoint),
    "STORAGE_GATEWAY_ENDPOINT",
  )
  const token = requiredString(context.getSecret(SECRET.gatewayToken), "STORAGE_GATEWAY_TOKEN")
  return fixedStores({
    documents: createGatewayStorageProvider({
      endpoint,
      token,
      name: "gateway:documents",
      tier: "documents",
    }),
    media: createGatewayStorageProvider({ endpoint, token, name: "gateway:media", tier: "media" }),
  })
}

function fixedStores(
  stores: Readonly<Record<"documents" | "media", StorageProvider>>,
): StorageProviderResolver {
  return {
    resolve(name: VoyantStorageName) {
      if (name === "documents") return stores.documents
      if (name === "media") return stores.media
      return null
    },
  }
}

function resolveApiBaseUrl(context: StorageGraphProviderContext): string {
  const configured =
    optionalString(context.getConfig(CONFIG.apiBaseUrl), "API_BASE_URL") ??
    optionalString(context.getConfig(CONFIG.appUrl), "APP_URL") ??
    "http://localhost:3300/api"
  const value = configured.replace(/\/+$/, "")
  try {
    const parsed = new URL(value)
    if (parsed.pathname === "" || parsed.pathname === "/") parsed.pathname = "/api"
    return parsed.toString().replace(/\/+$/, "")
  } catch {
    return value
  }
}

function requiredString(value: unknown, name: string): string {
  const result = optionalString(value, name)
  if (!result) throw new TypeError(`${name} must be a non-empty string.`)
  return result
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string when configured.`)
  }
  return value.trim()
}

function parseOptionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (value === true || value === "true") return true
  if (value === false || value === "false") return false
  throw new TypeError(`${name} must be true or false when configured.`)
}
