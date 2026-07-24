import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import type { StorageObject, StorageProvider, StorageUploadBody, UploadOptions } from "../types.js"

export interface S3CompatibleProviderOptions {
  bucket: string
  region: string
  endpoint?: string
  forcePathStyle?: boolean
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  publicBaseUrl?: string
  name?: string
  backendIdentity?: string
  generateKey?: () => string
  client?: S3Client
}

async function opaqueBackendIdentity(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Build an AWS SDK v3-backed provider for S3 and S3-compatible object stores.
 * Endpoint and path-style options cover R2, GCS XML API, MinIO, and similar
 * implementations without leaking those vendors into Voyant's storage port.
 */
export function createS3CompatibleStorageProvider(
  options: S3CompatibleProviderOptions,
): StorageProvider {
  assertCredentialPair(options)
  const backendIdentity = resolveConfiguredBackendIdentity(options)
  const client = options.client ?? new S3Client(clientConfig(options))
  const publicBaseUrl = normalizeBaseUrl(options.publicBaseUrl)
  const generateKey = options.generateKey ?? defaultKey

  return {
    name: options.name ?? "s3-compatible",
    resolveBackendIdentity: () =>
      opaqueBackendIdentity(
        JSON.stringify({
          endpoint: options.endpoint ?? "aws",
          region: options.region,
          bucket: options.bucket,
          forcePathStyle: options.forcePathStyle ?? false,
          backendIdentity,
        }),
      ),
    async upload(
      body: StorageUploadBody,
      uploadOptions: UploadOptions = {},
    ): Promise<StorageObject> {
      const key = uploadOptions.key ?? generateKey()
      await client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: key,
          Body: await toBytes(body),
          ...(uploadOptions.contentType ? { ContentType: uploadOptions.contentType } : {}),
          ...(uploadOptions.metadata ? { Metadata: uploadOptions.metadata } : {}),
        }),
      )
      return { key, url: publicBaseUrl ? `${publicBaseUrl}/${encodeKey(key)}` : "" }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }))
    },
    signedUrl(key, expiresIn) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: options.bucket, Key: key }), {
        expiresIn,
      })
    },
    async get(key) {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: options.bucket, Key: key }),
        )
        if (!response.Body) return new ArrayBuffer(0)
        const bytes = await response.Body.transformToByteArray()
        const copy = new Uint8Array(bytes.byteLength)
        copy.set(bytes)
        return copy.buffer
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },
  }
}

function resolveConfiguredBackendIdentity(options: S3CompatibleProviderOptions): string {
  const explicit = options.backendIdentity?.trim()
  if (explicit) return explicit
  if (options.client) {
    throw new Error(
      "S3-compatible storage backendIdentity is required when a custom client is supplied.",
    )
  }
  if (!options.accessKeyId || !options.secretAccessKey) {
    throw new Error(
      "S3-compatible storage backendIdentity is required when using the default credential chain.",
    )
  }
  return JSON.stringify({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    sessionToken: options.sessionToken ?? null,
  })
}

function clientConfig(options: S3CompatibleProviderOptions): S3ClientConfig {
  return {
    region: options.region,
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    ...(options.forcePathStyle === undefined
      ? options.endpoint
        ? { forcePathStyle: true }
        : {}
      : { forcePathStyle: options.forcePathStyle }),
    ...(options.accessKeyId && options.secretAccessKey
      ? {
          credentials: {
            accessKeyId: options.accessKeyId,
            secretAccessKey: options.secretAccessKey,
            ...(options.sessionToken ? { sessionToken: options.sessionToken } : {}),
          },
        }
      : {}),
  }
}

function assertCredentialPair(options: S3CompatibleProviderOptions): void {
  if (Boolean(options.accessKeyId) !== Boolean(options.secretAccessKey)) {
    throw new Error("S3-compatible storage requires both accessKeyId and secretAccessKey")
  }
}

function normalizeBaseUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? ""
}

function defaultKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return candidate.name === "NoSuchKey" || candidate.$metadata?.httpStatusCode === 404
}

async function toBytes(body: StorageUploadBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  return new Uint8Array(await body.arrayBuffer())
}
