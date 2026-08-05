// agent-quality: file-size exception -- owner: legal; existing route module stays co-located until a dedicated split preserves behavior and tests.
//
// Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 —
// legal contracts batch). The plain `.get/.post(...)` handlers became
// `createRoute(...).openapi(...)` definitions grouped into several per-resource
// child `OpenAPIHono` sub-chains, composed onto the returned factory parent via
// `.route("/", child)` so the `.openapi()` operations propagate up through the
// legal admin/public parent registries while keeping type-inference cost bounded
// (one flat `.openapi().openapi()...` chain has O(n²) inference cost).
//
// Request schemas reuse the exported `@voyant-travel/legal-contracts` validation
// insert/update/list-query schemas the handlers already parse; response row
// schemas are authored here from the Drizzle `$inferSelect` shapes (§17 dates →
// strings). The contract LIST left-joins `people` + the `person_directory`
// view, so the contract list row extends the base contract schema with the four
// nullable joined columns. Routes that parse an optional/empty body
// (`parseOptionalJsonBody`) declare no forcing OpenAPI request body and parse
// in-handler; multipart upload + redirect download legs declare their non-JSON
// shapes explicitly. The factory/provider wiring + business logic are unchanged.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { bookingsService, shouldRevealBookingPii } from "@voyant-travel/bookings"
import type { EventBus, ModuleContainer } from "@voyant-travel/core"
import {
  idempotencyKey,
  openApiValidationHook,
  parseJsonBody,
  parseOptionalJsonBody,
  resolveStoredDocumentDownload,
} from "@voyant-travel/hono"
import { legalTargetKindSchema } from "@voyant-travel/legal-contracts/targets/validation"
import {
  createDrizzlePublicDocumentDeliveryGrantStore,
  resolvePublicDocumentDeliveryGrant,
} from "@voyant-travel/public-document-delivery"
import type { StorageProvider } from "@voyant-travel/storage"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import {
  hasManagedBookingWorkflow,
  redactManagedBookingContractForGenericDetail,
} from "../contract-dto.js"
import type { ContractLifecycleHook } from "./lifecycle.js"
import {
  buildContractsRouteRuntime,
  CONTRACTS_ROUTE_RUNTIME_CONTAINER_KEY,
  type ContractsRouteRuntime,
} from "./route-runtime.js"
import { renderPreviewResponse } from "./route-template-preview.js"
import type { Contract, ContractSignature } from "./schema.js"
import { contractsService, DurableContractDocumentAttachmentMutationError } from "./service.js"
import {
  contractBodyFormatSchema,
  contractListQuerySchema,
  contractNumberResetStrategySchema,
  contractNumberSeriesListQuerySchema,
  contractScopeSchema,
  contractSignatureMethodSchema,
  contractStageHistoryEntrySchema,
  contractStatusSchema,
  contractTemplateDefaultQuerySchema,
  contractTemplateListQuerySchema,
  insertContractAttachmentSchema,
  insertContractNumberSeriesSchema,
  insertContractSchema,
  insertContractSignatureSchema,
  insertContractTemplateSchema,
  insertContractTemplateVersionSchema,
  publicRenderTemplatePreviewInputSchema,
  renderTemplateInputSchema,
  sendContractInputSchema,
  updateContractAttachmentSchema,
  updateContractNumberSeriesSchema,
  updateContractSchema,
  updateContractTemplateSchema,
} from "./validation.js"

function shouldRevealBookingPiiForRoute(c: Context<Env>): boolean {
  return shouldRevealBookingPii({
    actor: c.get("actor"),
    scopes: c.get("scopes"),
    callerType: c.get("callerType"),
    isInternalRequest: c.get("isInternalRequest"),
    enforceRbac: true,
  })
}

function routeActorId(c: Context<Env>): string | null {
  return c.get("userId") ?? c.get("agentId") ?? c.get("workflowPrincipalId") ?? null
}

async function auditManagedBookingAttachmentDelivery(
  c: Context<Env>,
  input: {
    bookingId: string
    contractId: string
    attachmentId: string
    outcome: "allowed" | "denied"
    reason: "contract_document_delivery_reveal" | "insufficient_scope"
  },
) {
  await bookingsService.recordPiiAccess(c.get("db"), {
    bookingId: input.bookingId,
    travelerId: null,
    actorId: routeActorId(c),
    actorType: c.get("actor") ?? null,
    callerType: c.get("callerType") ?? null,
    action: "read",
    outcome: input.outcome,
    reason: input.reason,
    metadata:
      input.outcome === "denied"
        ? {
            contractId: input.contractId,
            attachmentId: input.attachmentId,
            reveal: false,
            requiredScopes: ["legal:read", "bookings-pii:read"],
          }
        : {
            contractId: input.contractId,
            attachmentId: input.attachmentId,
            reveal: true,
          },
  })
}

type Env = {
  Bindings: Record<string, unknown>
  Variables: {
    container: ModuleContainer
    db: PostgresJsDatabase
    userId?: string
    agentId?: string
    workflowPrincipalId?: string
    principalSubtype?: string
    sessionId?: string
    apiTokenId?: string
    apiKeyId?: string
    callerType?: string
    actor?: string
    scopes?: string[]
    isInternalRequest?: boolean
    organizationId?: string
    workflowRunId?: string
    workflowStepId?: string
  }
}

const PUBLIC_LEGAL_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600"
const PRIVATE_NO_STORE_CACHE_CONTROL = "private, no-store"

function cachePublicLegalRead(c: Context) {
  c.header("Cache-Control", PUBLIC_LEGAL_CACHE_CONTROL)
}

function preventSharedCache(c: Context) {
  c.header("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL)
}

function getClientIp(c: Context) {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    null
  )
}

export interface ContractsRouteOptions {
  resolveDocumentDownloadUrl?: (
    bindings: Record<string, unknown>,
    storageKey: string,
  ) => Promise<string | null> | string | null
  documentStorage?: StorageProvider | null
  resolveDocumentStorage?: (bindings: Record<string, unknown>) => StorageProvider | null | undefined
  eventBus?: EventBus
  resolveEventBus?: (bindings: Record<string, unknown>) => EventBus | undefined
  lifecycleHooks?: readonly ContractLifecycleHook[]
  resolveLifecycleHooks?: (
    bindings: Record<string, unknown>,
  ) => readonly ContractLifecycleHook[] | undefined
}

function getRuntime(
  options: ContractsRouteOptions | undefined,
  bindings: Record<string, unknown>,
  resolveFromContainer?: (key: string) => ContractsRouteRuntime | undefined,
) {
  return (
    resolveFromContainer?.(CONTRACTS_ROUTE_RUNTIME_CONTAINER_KEY) ??
    buildContractsRouteRuntime(bindings, options)
  )
}

function getMultipartString(value: unknown) {
  const resolved = Array.isArray(value) ? value[0] : value
  return typeof resolved === "string" ? resolved : null
}

function sanitizeStorageFileName(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
  return normalized || "document"
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function sha256Checksum(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer.slice(0))
  return `sha256:${toHex(digest)}`
}

async function buildUploadedAttachmentInput({
  storage,
  contractId,
  form,
  file,
}: {
  storage: StorageProvider
  contractId: string
  form: Record<string, unknown>
  file: File
}) {
  const originalName = file.name || "document"
  const name = getMultipartString(form.name)?.trim() || originalName
  const kind = getMultipartString(form.kind)?.trim() || "appendix"
  if (kind === "document" || kind === "document-history") {
    throw new DurableContractDocumentAttachmentMutationError()
  }
  const mimeType = file.type || "application/octet-stream"
  const body = await file.arrayBuffer()
  const checksum = await sha256Checksum(body)
  const storageName = sanitizeStorageFileName(originalName)
  const key = `contracts/${contractId}/attachments/${crypto.randomUUID()}-${storageName}`
  const uploaded = await storage.upload(body, {
    key,
    contentType: mimeType,
    metadata: {
      checksum,
      contractId,
      kind,
      name,
      originalName,
    },
  })

  return {
    kind,
    name,
    mimeType,
    fileSize: file.size,
    storageKey: uploaded.key,
    checksum,
    metadata: {
      originalName,
      uploadedAt: new Date().toISOString(),
      ...(uploaded.url ? { url: uploaded.url } : {}),
    },
  }
}

async function parseAttachmentUploadRequest(c: Context<Env>): Promise<
  | { error: Response; form?: undefined; file?: undefined }
  | {
      error?: undefined
      form: Record<string, unknown>
      file: File
    }
> {
  const form = (await c.req.parseBody()) as Record<string, unknown>
  const file = Array.isArray(form.file) ? form.file[0] : form.file
  if (!(file instanceof File)) {
    return { error: c.json({ error: "Missing file field in multipart body" }, 400) }
  }
  return { form, file }
}

/**
 * Bridge a helper's plain `Promise<Response>` to the typed-response shape
 * `.openapi()` infers per route. The runtime value already honors the declared
 * schemas; this only relaxes the compile-time union (mirrors the catalog
 * booking-engine backfill, voyant#2114).
 */
// biome-ignore lint/suspicious/noExplicitAny: intentional — bridges bare Response to the inferred typed-response union (voyant#2114)
function asRouteResponse(response: Promise<Response>): Promise<any> {
  return response
}

async function renderAdminTemplatePreview(c: Context<Env>): Promise<Response> {
  const id = c.req.param("id")
  if (!id) return c.json({ error: "Template not found" }, 404)
  const input = await parseJsonBody(c, renderTemplateInputSchema)
  const template = await contractsService.getTemplateById(c.get("db"), id)
  if (!template) return c.json({ error: "Template not found" }, 404)
  const body = input.body ?? template.body
  return renderPreviewResponse(c, { ...input, body })
}

async function renderPublicTemplatePreview(c: Context<Env>): Promise<Response> {
  const id = c.req.param("id")
  if (!id) return c.json({ error: "Template not found" }, 404)
  const input = await parseJsonBody(c, publicRenderTemplatePreviewInputSchema)
  const template = await contractsService.getTemplateById(c.get("db"), id)
  if (!template?.active) return c.json({ error: "Template not found" }, 404)
  return renderPreviewResponse(c, {
    variables: input.variables,
    body: template.body,
  })
}

async function renderPublicTemplatePreviewBySlug(c: Context<Env>): Promise<Response> {
  const slug = c.req.param("slug")
  if (!slug) return c.json({ error: "Template not found" }, 404)
  const input = await parseJsonBody(c, publicRenderTemplatePreviewInputSchema)
  const template = await contractsService.findTemplateBySlug(c.get("db"), slug)
  if (!template?.active) return c.json({ error: "Template not found" }, 404)
  return renderPreviewResponse(
    c,
    {
      variables: input.variables,
      body: template.body,
    },
    {
      template: {
        id: template.id,
        slug: template.slug,
        name: template.name,
        language: template.language,
        scope: template.scope,
      },
    },
  )
}

async function uploadContractAttachment(
  c: Context<Env>,
  options: ContractsRouteOptions,
  contractId: string,
): Promise<Response> {
  const runtime = getRuntime(options, c.env, (key) => c.var.container?.resolve(key))
  const storage = runtime.documentStorage
  if (!storage) {
    return c.json({ error: "Contract document storage is not configured" }, 501)
  }

  const contract = await contractsService.getContractById(c.get("db"), contractId)
  if (!contract) return c.json({ error: "Contract not found" }, 404)

  const parsed = await parseAttachmentUploadRequest(c)
  if (parsed.error) return parsed.error

  let row: Awaited<ReturnType<typeof contractsService.createAttachment>>
  try {
    row = await contractsService.createAttachment(
      c.get("db"),
      contractId,
      await buildUploadedAttachmentInput({
        storage,
        contractId,
        form: parsed.form,
        file: parsed.file,
      }),
    )
  } catch (error) {
    if (error instanceof DurableContractDocumentAttachmentMutationError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
  if (!row) return c.json({ error: "Contract not found" }, 404)
  return c.json({ data: row }, 201)
}

async function replaceContractAttachmentUpload(
  c: Context<Env>,
  options: ContractsRouteOptions,
): Promise<Response> {
  const attachmentId = c.req.param("attachmentId")!
  const runtime = getRuntime(options, c.env, (key) => c.var.container?.resolve(key))
  const storage = runtime.documentStorage
  if (!storage) {
    return c.json({ error: "Contract document storage is not configured" }, 501)
  }

  const existing = await contractsService.getAttachmentById(c.get("db"), attachmentId)
  if (!existing) return c.json({ error: "Attachment not found" }, 404)
  if (existing.kind === "document" || existing.kind === "document-history") {
    return c.json(
      { error: "Canonical and historical contract documents cannot be replaced here." },
      409,
    )
  }

  const parsed = await parseAttachmentUploadRequest(c)
  if (parsed.error) return parsed.error

  let row: Awaited<ReturnType<typeof contractsService.updateAttachment>>
  try {
    row = await contractsService.updateAttachment(
      c.get("db"),
      attachmentId,
      await buildUploadedAttachmentInput({
        storage,
        contractId: existing.contractId,
        form: parsed.form,
        file: parsed.file,
      }),
    )
  } catch (error) {
    if (error instanceof DurableContractDocumentAttachmentMutationError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
  if (!row) return c.json({ error: "Attachment not found" }, 404)
  if (existing.storageKey && existing.storageKey !== row.storageKey) {
    try {
      await storage.delete(existing.storageKey)
    } catch (error) {
      console.warn(
        `[legal] failed to delete replaced contract attachment object ${existing.storageKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
  return c.json({ data: row }, 200)
}

async function deleteContractAttachment(
  c: Context<Env>,
  options: ContractsRouteOptions,
): Promise<Response> {
  const attachmentId = c.req.param("attachmentId")!
  let row: Awaited<ReturnType<typeof contractsService.deleteAttachment>>
  try {
    row = await contractsService.deleteAttachment(c.get("db"), attachmentId)
  } catch (error) {
    if (error instanceof DurableContractDocumentAttachmentMutationError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
  if (!row) return c.json({ error: "Attachment not found" }, 404)

  const runtime = getRuntime(options, c.env, (key) => c.var.container?.resolve(key))
  const storage = runtime.documentStorage
  if (storage && row.storageKey) {
    try {
      await storage.delete(row.storageKey)
    } catch (error) {
      console.warn(
        `[legal] failed to delete contract attachment object ${row.storageKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  return c.json({ success: true } as const, 200)
}

// --- shared response building blocks ----------------------------------------

const errorResponseSchema = z.object({ error: z.string() })
const successResponseSchema = z.object({ success: z.literal(true) })
const idSchema = z.string()
const idParamSchema = z.object({ id: idSchema })
const isoTimestamp = z.string()
const jsonRecord = z.record(z.string(), z.unknown())
// Open jsonb columns (`variables`, `metadata`, `variableSchema`) are typed as
// `unknown` by Drizzle's `$inferSelect`, so the wire schema must accept any JSON
// value rather than force a record shape.
const jsonValue = z.unknown()

const dataEnvelope = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema })

const invalidRequestResponse = {
  description: "invalid_request: request body failed validation",
  content: { "application/json": { schema: errorResponseSchema } },
} as const

const notFoundResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorResponseSchema } },
})

const conflictResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorResponseSchema } },
})

// §17: timestamps/dates are serialized to ISO strings on the wire.

const contractTemplateSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  scope: contractScopeSchema,
  language: z.string(),
  description: z.string().nullable(),
  body: z.string(),
  variableSchema: jsonValue,
  currentVersionId: z.string().nullable(),
  channelId: z.string().nullable(),
  isDefault: z.boolean(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const contractTemplateVersionSchema = z.object({
  id: idSchema,
  templateId: z.string(),
  version: z.number().int(),
  body: z.string(),
  variableSchema: jsonValue,
  changelog: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: isoTimestamp,
})

const contractNumberSeriesSchema = z.object({
  id: idSchema,
  name: z.string(),
  prefix: z.string(),
  separator: z.string(),
  padLength: z.number().int(),
  currentSequence: z.number().int(),
  resetStrategy: contractNumberResetStrategySchema,
  resetAt: isoTimestamp.nullable(),
  scope: contractScopeSchema,
  isDefault: z.boolean(),
  externalProvider: z.string().nullable(),
  externalConfigKey: z.string().nullable(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const contractSchema = z.object({
  id: idSchema,
  contractNumber: z.string().nullable(),
  scope: contractScopeSchema,
  status: contractStatusSchema,
  stageHistory: z.array(contractStageHistoryEntrySchema),
  title: z.string(),
  templateVersionId: z.string().nullable(),
  seriesId: z.string().nullable(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  supplierId: z.string().nullable(),
  channelId: z.string().nullable(),
  bookingId: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable(),
  targetId: z.string().nullable(),
  targetProvider: z.string().nullable(),
  targetSourceRef: z.string().nullable(),
  legacyTransactionOfferId: z.string().nullable(),
  legacyTransactionOrderId: z.string().nullable(),
  issuedAt: isoTimestamp.nullable(),
  sentAt: isoTimestamp.nullable(),
  executedAt: isoTimestamp.nullable(),
  expiresAt: isoTimestamp.nullable(),
  voidedAt: isoTimestamp.nullable(),
  language: z.string(),
  renderedBodyFormat: contractBodyFormatSchema,
  renderedBody: z.string().nullable(),
  variables: jsonValue,
  metadata: jsonValue,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// The contract LIST left-joins `people` + the `person_directory` view, so the
// list row carries four extra nullable columns absent from the base
// `contracts.$inferSelect` shape.
const contractListRowSchema = contractSchema.extend({
  personFirstName: z.string().nullable(),
  personLastName: z.string().nullable(),
  personEmail: z.string().nullable(),
  personPhone: z.string().nullable(),
})

const contractSignatureSchema = z.object({
  id: idSchema,
  contractId: z.string(),
  signerName: z.string(),
  signerEmail: z.string().nullable(),
  signerRole: z.string().nullable(),
  personId: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable(),
  targetId: z.string().nullable(),
  targetProvider: z.string().nullable(),
  targetSourceRef: z.string().nullable(),
  legacyTransactionOfferId: z.string().nullable(),
  legacyTransactionOrderId: z.string().nullable(),
  method: contractSignatureMethodSchema,
  provider: z.string().nullable(),
  externalReference: z.string().nullable(),
  signatureData: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  signedAt: isoTimestamp,
  metadata: jsonValue,
  createdAt: isoTimestamp,
})

const contractAttachmentSchema = z.object({
  id: idSchema,
  contractId: z.string(),
  kind: z.string(),
  name: z.string(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  storageKey: z.string().nullable(),
  checksum: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable(),
  targetId: z.string().nullable(),
  targetProvider: z.string().nullable(),
  targetSourceRef: z.string().nullable(),
  legacyTransactionOfferId: z.string().nullable(),
  legacyTransactionOrderId: z.string().nullable(),
  metadata: jsonValue,
  createdAt: isoTimestamp,
})

const publicContractAccessQuerySchema = z.object({
  token: z.string().optional(),
})

const publicContractSchema = contractSchema.pick({
  contractNumber: true,
  scope: true,
  status: true,
  title: true,
  issuedAt: true,
  sentAt: true,
  executedAt: true,
  expiresAt: true,
  voidedAt: true,
  language: true,
  renderedBodyFormat: true,
  renderedBody: true,
})

const publicInsertContractSignatureSchema = insertContractSignatureSchema.omit({
  personId: true,
  targetKind: true,
  targetId: true,
  targetProvider: true,
  targetSourceRef: true,
  legacyTransactionOfferId: true,
  legacyTransactionOrderId: true,
  provider: true,
  externalReference: true,
  ipAddress: true,
  userAgent: true,
  metadata: true,
})

const publicContractSignatureSchema = contractSignatureSchema.pick({
  signerName: true,
  signerEmail: true,
  signerRole: true,
  method: true,
  signedAt: true,
})

function nullableIsoTimestamp(value: Date | null) {
  return value ? value.toISOString() : null
}

function toPublicContract(contract: Contract): z.infer<typeof publicContractSchema> {
  return {
    contractNumber: contract.contractNumber,
    scope: contract.scope,
    status: contract.status,
    title: contract.title,
    issuedAt: nullableIsoTimestamp(contract.issuedAt),
    sentAt: nullableIsoTimestamp(contract.sentAt),
    executedAt: nullableIsoTimestamp(contract.executedAt),
    expiresAt: nullableIsoTimestamp(contract.expiresAt),
    voidedAt: nullableIsoTimestamp(contract.voidedAt),
    language: contract.language,
    renderedBodyFormat: contract.renderedBodyFormat,
    renderedBody: contract.renderedBody,
  }
}

function toGenericAdminContract<T extends { variables: unknown; metadata: unknown }>(
  contract: T,
): T {
  return redactManagedBookingContractForGenericDetail(contract)
}

function isGenericContractRenderAllowed(contract: Pick<Contract, "metadata">): boolean {
  return !hasManagedBookingWorkflow(contract.metadata)
}

function toPublicSignature(
  signature: ContractSignature,
): z.infer<typeof publicContractSignatureSchema> {
  return {
    signerName: signature.signerName,
    signerEmail: signature.signerEmail,
    signerRole: signature.signerRole,
    method: signature.method,
    signedAt: signature.signedAt.toISOString(),
  }
}

async function authorizePublicContractAccess(
  c: Context<Env>,
  contractId: string,
  token: string | undefined,
  capability: "read" | "sign",
): Promise<"ready" | "not_found" | "gone"> {
  if (!token) return "not_found"

  const store = createDrizzlePublicDocumentDeliveryGrantStore(c.get("db"))
  const resolution = await resolvePublicDocumentDeliveryGrant(store, token)
  if (resolution.status === "not_found") return "not_found"
  if (resolution.status === "expired" || resolution.status === "revoked") return "gone"

  const grant = resolution.grant
  if (grant.sourceModule !== "legal") return "not_found"

  if (grant.sourceEntity === "contract" && grant.sourceId === contractId) {
    await store.recordAccess(grant.id, {
      accessedAt: new Date(),
      ip: getClientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    })
    return "ready"
  }

  if (capability === "sign") {
    return "not_found"
  }

  if (grant.sourceEntity !== "contract_attachment" || !grant.sourceId) {
    return "not_found"
  }

  const attachment = await contractsService.getAttachmentById(c.get("db"), grant.sourceId)
  if (!attachment || attachment.contractId !== contractId) {
    return "not_found"
  }

  await store.recordAccess(grant.id, {
    accessedAt: new Date(),
    ip: getClientIp(c),
    userAgent: c.req.header("user-agent") ?? null,
  })
  return "ready"
}

// `renderPreviewResponse` serializes `{ data: { rendered, ...extra } }` — the
// rendered payload + optional template descriptor are loosely typed (handler
// composes them dynamically), so the envelope's `data` is an open record.
const renderPreviewEnvelopeSchema = z.object({ data: jsonRecord })

// The document-generate envelope is `{ data: <contract+attachment+download> }`
// composed by `attachDownloadEnvelope`; the dynamic download/publicDownload
// fields keep it an open record.

export function createContractsAdminRoutes(options: ContractsRouteOptions = {}) {
  // --- templates + preview --------------------------------------------------

  const listTemplatesRoute = createRoute({
    method: "get",
    path: "/templates",
    request: { query: contractTemplateListQuerySchema },
    responses: {
      200: {
        description: "Paginated contract templates",
        content: { "application/json": { schema: listResponseSchema(contractTemplateSchema) } },
      },
    },
  })

  const getDefaultTemplateRoute = createRoute({
    method: "get",
    path: "/templates/default",
    request: { query: contractTemplateDefaultQuerySchema },
    responses: {
      200: {
        description: "The resolved default contract template for the scope/language",
        content: { "application/json": { schema: dataEnvelope(contractTemplateSchema) } },
      },
      404: notFoundResponse("Template not found"),
    },
  })

  const createTemplateRoute = createRoute({
    method: "post",
    path: "/templates",
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: insertContractTemplateSchema } },
      },
    },
    responses: {
      201: {
        description: "The created contract template",
        content: { "application/json": { schema: dataEnvelope(contractTemplateSchema) } },
      },
      400: invalidRequestResponse,
    },
  })

  const getTemplateRoute = createRoute({
    method: "get",
    path: "/templates/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "A contract template by id",
        content: { "application/json": { schema: dataEnvelope(contractTemplateSchema) } },
      },
      404: notFoundResponse("Template not found"),
    },
  })

  const updateTemplateRoute = createRoute({
    method: "patch",
    path: "/templates/{id}",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateContractTemplateSchema } },
      },
    },
    responses: {
      200: {
        description: "The updated contract template",
        content: { "application/json": { schema: dataEnvelope(contractTemplateSchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Template not found"),
    },
  })

  const deleteTemplateRoute = createRoute({
    method: "delete",
    path: "/templates/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "Contract template deleted",
        content: { "application/json": { schema: successResponseSchema } },
      },
      404: notFoundResponse("Template not found"),
    },
  })

  const previewTemplateRoute = createRoute({
    method: "post",
    path: "/templates/{id}/preview",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: renderTemplateInputSchema } },
      },
    },
    responses: {
      200: {
        description: "The rendered template preview",
        content: { "application/json": { schema: renderPreviewEnvelopeSchema } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Template not found"),
    },
  })

  const renderPreviewTemplateRoute = createRoute({
    method: "post",
    path: "/templates/{id}/render-preview",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: renderTemplateInputSchema } },
      },
    },
    responses: {
      200: {
        description: "The rendered template preview",
        content: { "application/json": { schema: renderPreviewEnvelopeSchema } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Template not found"),
    },
  })

  const templateRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listTemplatesRoute, async (c) =>
      c.json(await contractsService.listTemplates(c.get("db"), c.req.valid("query")), 200),
    )
    .openapi(getDefaultTemplateRoute, async (c) => {
      const row = await contractsService.getDefaultTemplate(c.get("db"), c.req.valid("query"))
      return row ? c.json({ data: row }, 200) : c.json({ error: "Template not found" }, 404)
    })
    .openapi(createTemplateRoute, async (c) => {
      const row = await contractsService.createTemplate(c.get("db"), c.req.valid("json"))
      return c.json({ data: row! }, 201)
    })
    .openapi(getTemplateRoute, async (c) => {
      const row = await contractsService.getTemplateById(c.get("db"), c.req.valid("param").id)
      return row ? c.json({ data: row }, 200) : c.json({ error: "Template not found" }, 404)
    })
    .openapi(updateTemplateRoute, async (c) => {
      const row = await contractsService.updateTemplate(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Template not found" }, 404)
    })
    .openapi(deleteTemplateRoute, async (c) => {
      const row = await contractsService.deleteTemplate(c.get("db"), c.req.valid("param").id)
      return row
        ? c.json({ success: true } as const, 200)
        : c.json({ error: "Template not found" }, 404)
    })
    .openapi(previewTemplateRoute, (c) => asRouteResponse(renderAdminTemplatePreview(c)))
    .openapi(renderPreviewTemplateRoute, (c) => asRouteResponse(renderAdminTemplatePreview(c)))

  // --- template versions ----------------------------------------------------

  const listTemplateVersionsRoute = createRoute({
    method: "get",
    path: "/templates/{id}/versions",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "The template's versions",
        content: {
          "application/json": {
            schema: z.object({ data: z.array(contractTemplateVersionSchema) }),
          },
        },
      },
    },
  })

  const createTemplateVersionRoute = createRoute({
    method: "post",
    path: "/templates/{id}/versions",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: insertContractTemplateVersionSchema } },
      },
    },
    responses: {
      201: {
        description: "The created template version",
        content: { "application/json": { schema: dataEnvelope(contractTemplateVersionSchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Template not found"),
    },
  })

  const getTemplateVersionRoute = createRoute({
    method: "get",
    path: "/template-versions/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "A template version by id",
        content: { "application/json": { schema: dataEnvelope(contractTemplateVersionSchema) } },
      },
      404: notFoundResponse("Template version not found"),
    },
  })

  const templateVersionRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listTemplateVersionsRoute, async (c) => {
      const rows = await contractsService.listTemplateVersions(c.get("db"), c.req.valid("param").id)
      return c.json({ data: rows }, 200)
    })
    .openapi(createTemplateVersionRoute, async (c) => {
      const version = await contractsService.createTemplateVersion(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return version ? c.json({ data: version }, 201) : c.json({ error: "Template not found" }, 404)
    })
    .openapi(getTemplateVersionRoute, async (c) => {
      const row = await contractsService.getTemplateVersionById(
        c.get("db"),
        c.req.valid("param").id,
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Template version not found" }, 404)
    })

  // --- number series --------------------------------------------------------

  const listSeriesRoute = createRoute({
    method: "get",
    path: "/number-series",
    request: { query: contractNumberSeriesListQuerySchema },
    responses: {
      200: {
        description: "Contract number series",
        content: {
          "application/json": { schema: z.object({ data: z.array(contractNumberSeriesSchema) }) },
        },
      },
    },
  })

  const createSeriesRoute = createRoute({
    method: "post",
    path: "/number-series",
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: insertContractNumberSeriesSchema } },
      },
    },
    responses: {
      201: {
        description: "The created contract number series",
        content: { "application/json": { schema: dataEnvelope(contractNumberSeriesSchema) } },
      },
      400: invalidRequestResponse,
    },
  })

  const getSeriesRoute = createRoute({
    method: "get",
    path: "/number-series/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "A contract number series by id",
        content: { "application/json": { schema: dataEnvelope(contractNumberSeriesSchema) } },
      },
      404: notFoundResponse("Series not found"),
    },
  })

  const updateSeriesRoute = createRoute({
    method: "patch",
    path: "/number-series/{id}",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateContractNumberSeriesSchema } },
      },
    },
    responses: {
      200: {
        description: "The updated contract number series",
        content: { "application/json": { schema: dataEnvelope(contractNumberSeriesSchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Series not found"),
    },
  })

  const deleteSeriesRoute = createRoute({
    method: "delete",
    path: "/number-series/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "Contract number series deleted",
        content: { "application/json": { schema: successResponseSchema } },
      },
      404: notFoundResponse("Series not found"),
    },
  })

  const numberSeriesRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listSeriesRoute, async (c) => {
      const rows = await contractsService.listSeries(c.get("db"), c.req.valid("query"))
      return c.json({ data: rows }, 200)
    })
    .openapi(createSeriesRoute, async (c) => {
      const row = await contractsService.createSeries(c.get("db"), c.req.valid("json"))
      return c.json({ data: row! }, 201)
    })
    .openapi(getSeriesRoute, async (c) => {
      const row = await contractsService.getSeriesById(c.get("db"), c.req.valid("param").id)
      return row ? c.json({ data: row }, 200) : c.json({ error: "Series not found" }, 404)
    })
    .openapi(updateSeriesRoute, async (c) => {
      const row = await contractsService.updateSeries(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Series not found" }, 404)
    })
    .openapi(deleteSeriesRoute, async (c) => {
      const row = await contractsService.deleteSeries(c.get("db"), c.req.valid("param").id)
      return row
        ? c.json({ success: true } as const, 200)
        : c.json({ error: "Series not found" }, 404)
    })

  // --- contracts CRUD --------------------------------------------------------

  const listContractsRoute = createRoute({
    method: "get",
    path: "/",
    request: { query: contractListQuerySchema },
    responses: {
      200: {
        description: "Paginated contracts (with joined person summary columns)",
        content: { "application/json": { schema: listResponseSchema(contractListRowSchema) } },
      },
    },
  })

  const createContractRoute = createRoute({
    method: "post",
    path: "/",
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: insertContractSchema } },
      },
    },
    responses: {
      201: {
        description: "The created contract",
        content: { "application/json": { schema: dataEnvelope(contractSchema) } },
      },
      400: invalidRequestResponse,
    },
  })

  const getContractRoute = createRoute({
    method: "get",
    path: "/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "A contract by id",
        content: { "application/json": { schema: dataEnvelope(contractSchema) } },
      },
      404: notFoundResponse("Contract not found"),
    },
  })

  const updateContractRoute = createRoute({
    method: "patch",
    path: "/{id}",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateContractSchema } },
      },
    },
    responses: {
      200: {
        description: "The updated contract",
        content: { "application/json": { schema: dataEnvelope(contractSchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Contract not found"),
    },
  })

  const deleteContractRoute = createRoute({
    method: "delete",
    path: "/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "Contract deleted",
        content: { "application/json": { schema: successResponseSchema } },
      },
      404: notFoundResponse("Contract not found"),
      409: conflictResponse("Contract cannot be deleted"),
    },
  })

  const contractRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listContractsRoute, async (c) => {
      const result = await contractsService.listContracts(c.get("db"), c.req.valid("query"))
      return c.json({ ...result, data: result.data.map(toGenericAdminContract) }, 200)
    })
    .openapi(createContractRoute, async (c) => {
      const row = await contractsService.createContract(c.get("db"), c.req.valid("json"))
      return c.json({ data: toGenericAdminContract(row!) }, 201)
    })
    .openapi(getContractRoute, async (c) => {
      const row = await contractsService.getContractById(c.get("db"), c.req.valid("param").id)
      return row
        ? c.json({ data: toGenericAdminContract(row) }, 200)
        : c.json({ error: "Contract not found" }, 404)
    })
    .openapi(updateContractRoute, async (c) => {
      const row = await contractsService.updateContract(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return row
        ? c.json({ data: toGenericAdminContract(row) }, 200)
        : c.json({ error: "Contract not found" }, 404)
    })
    .openapi(deleteContractRoute, async (c) => {
      const result = await contractsService.deleteContract(c.get("db"), c.req.valid("param").id)
      if (result.status === "not_found") return c.json({ error: "Contract not found" }, 404)
      if (result.status === "not_deletable") {
        return c.json({ error: "Only draft or void contracts can be deleted" }, 409)
      }
      if (result.status === "immutable_revision") {
        return c.json({ error: "Immutable contract revisions cannot be deleted" }, 409)
      }
      return c.json({ success: true } as const, 200)
    })

  // --- contract lifecycle transitions ---------------------------------------

  const issueContractRoute = createRoute({
    method: "post",
    path: "/{id}/issue",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "The issued contract",
        content: { "application/json": { schema: dataEnvelope(contractSchema) } },
      },
      404: notFoundResponse("Contract not found"),
      409: conflictResponse("Only draft contracts can be issued"),
    },
  })

  const sendContractRoute = createRoute({
    method: "post",
    path: "/{id}/send",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "The sent contract",
        content: { "application/json": { schema: dataEnvelope(contractSchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Contract not found"),
      409: conflictResponse("Only issued/sent contracts can be sent"),
    },
  })

  const signContractRoute = createRoute({
    method: "post",
    path: "/{id}/sign",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: insertContractSignatureSchema } },
      },
    },
    responses: {
      200: {
        description: "The signed contract + signature",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({ contract: contractSchema, signature: contractSignatureSchema }),
            }),
          },
        },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Contract not found"),
      409: conflictResponse("Contract is not in a signable state"),
    },
  })

  const executeContractRoute = createRoute({
    method: "post",
    path: "/{id}/execute",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "The executed contract",
        content: { "application/json": { schema: dataEnvelope(contractSchema) } },
      },
      404: notFoundResponse("Contract not found"),
      409: conflictResponse("Only signed contracts can be executed"),
    },
  })

  const voidContractRoute = createRoute({
    method: "post",
    path: "/{id}/void",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "The voided contract",
        content: { "application/json": { schema: dataEnvelope(contractSchema) } },
      },
      404: notFoundResponse("Contract not found"),
      409: conflictResponse("Contract is already void"),
    },
  })

  const renderContractRoute = createRoute({
    method: "post",
    path: "/{id}/render",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: renderTemplateInputSchema } },
      },
    },
    responses: {
      200: {
        description: "The rendered contract preview",
        content: { "application/json": { schema: renderPreviewEnvelopeSchema } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Contract not found"),
    },
  })

  const lifecycleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(issueContractRoute, async (c) => {
      const runtime = getRuntime(options, c.env, (key) => c.var.container?.resolve(key))
      const result = await contractsService.issueContract(
        c.get("db"),
        c.req.valid("param").id,
        runtime,
      )
      if (result.status === "not_found") return c.json({ error: "Contract not found" }, 404)
      if (result.status === "not_draft") {
        return c.json({ error: "Only draft contracts can be issued" }, 409)
      }
      return c.json({ data: toGenericAdminContract(result.contract!) }, 200)
    })
    .openapi(sendContractRoute, async (c) => {
      const runtime = getRuntime(options, c.env, (key) => c.var.container?.resolve(key))
      // Body is optional — older callers POST without one and the
      // service falls back to defaults. The Send-contract dialog POSTs
      // `{ recipientEmail, subject, message }` so the notification
      // subscriber can deliver the operator's customised copy.
      const input = await parseOptionalJsonBody(c, sendContractInputSchema)
      const result = await contractsService.sendContract(
        c.get("db"),
        c.req.valid("param").id,
        runtime,
        input ?? undefined,
      )
      if (result.status === "not_found") return c.json({ error: "Contract not found" }, 404)
      if (result.status === "not_issued") {
        return c.json({ error: "Only issued/sent contracts can be sent" }, 409)
      }
      return c.json({ data: toGenericAdminContract(result.contract!) }, 200)
    })
    .openapi(signContractRoute, async (c) => {
      const runtime = getRuntime(options, c.env, (key) => c.var.container?.resolve(key))
      const result = await contractsService.signContract(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        runtime,
      )
      if (result.status === "not_found") return c.json({ error: "Contract not found" }, 404)
      if (result.status === "not_signable") {
        return c.json({ error: "Contract is not in a signable state" }, 409)
      }
      return c.json(
        {
          data: {
            contract: toGenericAdminContract(result.contract!),
            signature: result.signature!,
          },
        },
        200,
      )
    })
    .openapi(executeContractRoute, async (c) => {
      const runtime = getRuntime(options, c.env, (key) => c.var.container?.resolve(key))
      const result = await contractsService.executeContract(
        c.get("db"),
        c.req.valid("param").id,
        runtime,
      )
      if (result.status === "not_found") return c.json({ error: "Contract not found" }, 404)
      if (result.status === "not_signed") {
        return c.json({ error: "Only signed contracts can be executed" }, 409)
      }
      return c.json({ data: toGenericAdminContract(result.contract!) }, 200)
    })
    .openapi(voidContractRoute, async (c) => {
      const runtime = getRuntime(options, c.env, (key) => c.var.container?.resolve(key))
      const result = await contractsService.voidContract(
        c.get("db"),
        c.req.valid("param").id,
        runtime,
      )
      if (result.status === "not_found") return c.json({ error: "Contract not found" }, 404)
      if (result.status === "already_void") {
        return c.json({ error: "Contract is already void" }, 409)
      }
      return c.json({ data: toGenericAdminContract(result.contract!) }, 200)
    })
    .openapi(renderContractRoute, (c) =>
      asRouteResponse(
        (async (): Promise<Response> => {
          const input = c.req.valid("json")
          const contract = await contractsService.getContractById(
            c.get("db"),
            c.req.valid("param").id,
          )
          if (!contract) return c.json({ error: "Contract not found" }, 404)
          if (!isGenericContractRenderAllowed(contract)) {
            return c.json({ error: "Contract not found" }, 404)
          }
          return renderPreviewResponse(c, input)
        })(),
      ),
    )

  // --- signatures + attachments ---------------------------------------------

  const attachmentParamSchema = z.object({ attachmentId: idSchema })
  const multipartUploadBody = {
    content: { "multipart/form-data": { schema: z.object({ file: z.unknown() }) } },
  } as const

  const listSignaturesRoute = createRoute({
    method: "get",
    path: "/{id}/signatures",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "The contract's signatures",
        content: {
          "application/json": { schema: z.object({ data: z.array(contractSignatureSchema) }) },
        },
      },
    },
  })

  const listAttachmentsRoute = createRoute({
    method: "get",
    path: "/{id}/attachments",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "The contract's attachments",
        content: {
          "application/json": { schema: z.object({ data: z.array(contractAttachmentSchema) }) },
        },
      },
    },
  })

  const createAttachmentRoute = createRoute({
    method: "post",
    path: "/{id}/attachments",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: insertContractAttachmentSchema } },
      },
    },
    responses: {
      201: {
        description: "The created contract attachment",
        content: { "application/json": { schema: dataEnvelope(contractAttachmentSchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Contract not found"),
      409: conflictResponse("Durable contract document kinds cannot be created here"),
    },
  })

  const uploadAttachmentRoute = createRoute({
    method: "post",
    path: "/{id}/attachments/upload",
    request: { params: idParamSchema, body: multipartUploadBody },
    responses: {
      201: {
        description: "The uploaded contract attachment",
        content: { "application/json": { schema: dataEnvelope(contractAttachmentSchema) } },
      },
      400: notFoundResponse("Missing file field in multipart body"),
      404: notFoundResponse("Contract not found"),
      409: conflictResponse("Durable contract document kinds cannot be uploaded here"),
      501: notFoundResponse("Contract document storage is not configured"),
    },
  })

  const updateAttachmentRoute = createRoute({
    method: "patch",
    path: "/attachments/{attachmentId}",
    request: {
      params: attachmentParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateContractAttachmentSchema } },
      },
    },
    responses: {
      200: {
        description: "The updated contract attachment",
        content: { "application/json": { schema: dataEnvelope(contractAttachmentSchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Attachment not found"),
      409: conflictResponse("Durable contract documents cannot be mutated here"),
    },
  })

  const updateAttachmentUploadRoute = createRoute({
    method: "patch",
    path: "/attachments/{attachmentId}/upload",
    request: { params: attachmentParamSchema, body: multipartUploadBody },
    responses: {
      200: {
        description: "The replaced contract attachment",
        content: { "application/json": { schema: dataEnvelope(contractAttachmentSchema) } },
      },
      400: notFoundResponse("Missing file field in multipart body"),
      404: notFoundResponse("Attachment not found"),
      409: conflictResponse("Durable contract documents cannot be replaced here"),
      501: notFoundResponse("Contract document storage is not configured"),
    },
  })

  const downloadAttachmentRoute = createRoute({
    method: "get",
    path: "/attachments/{attachmentId}/download",
    request: { params: attachmentParamSchema },
    responses: {
      302: { description: "Redirect to the resolved attachment download URL" },
      404: notFoundResponse("Attachment file is not available"),
      501: notFoundResponse("Document download resolver is not configured"),
    },
  })

  const deleteAttachmentRoute = createRoute({
    method: "delete",
    path: "/attachments/{attachmentId}",
    request: { params: attachmentParamSchema },
    responses: {
      200: {
        description: "Attachment deleted",
        content: { "application/json": { schema: successResponseSchema } },
      },
      404: notFoundResponse("Attachment not found"),
      409: conflictResponse("Durable contract documents cannot be deleted here"),
    },
  })

  const signatureAttachmentRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listSignaturesRoute, async (c) => {
      const rows = await contractsService.listSignatures(c.get("db"), c.req.valid("param").id)
      return c.json({ data: rows }, 200)
    })
    .openapi(listAttachmentsRoute, async (c) => {
      const rows = await contractsService.listAttachments(c.get("db"), c.req.valid("param").id)
      return c.json({ data: rows }, 200)
    })
    .openapi(createAttachmentRoute, async (c) => {
      let row: Awaited<ReturnType<typeof contractsService.createAttachment>>
      try {
        row = await contractsService.createAttachment(
          c.get("db"),
          c.req.valid("param").id,
          c.req.valid("json"),
        )
      } catch (error) {
        if (error instanceof DurableContractDocumentAttachmentMutationError) {
          return c.json({ error: error.message }, 409)
        }
        throw error
      }
      return row ? c.json({ data: row }, 201) : c.json({ error: "Contract not found" }, 404)
    })
    .openapi(uploadAttachmentRoute, (c) =>
      asRouteResponse(uploadContractAttachment(c, options, c.req.valid("param").id)),
    )
    .openapi(updateAttachmentRoute, async (c) => {
      let row: Awaited<ReturnType<typeof contractsService.updateAttachment>>
      try {
        row = await contractsService.updateAttachment(
          c.get("db"),
          c.req.valid("param").attachmentId,
          c.req.valid("json"),
        )
      } catch (error) {
        if (error instanceof DurableContractDocumentAttachmentMutationError) {
          return c.json({ error: error.message }, 409)
        }
        throw error
      }
      return row ? c.json({ data: row }, 200) : c.json({ error: "Attachment not found" }, 404)
    })
    .openapi(updateAttachmentUploadRoute, (c) =>
      asRouteResponse(replaceContractAttachmentUpload(c, options)),
    )
    .openapi(downloadAttachmentRoute, async (c) => {
      const row = await contractsService.getAttachmentWithContractById(
        c.get("db"),
        c.req.valid("param").attachmentId,
      )
      if (!row) return c.json({ error: "Attachment not found" }, 404)
      const attachment = row.attachment
      if (
        row.contract.bookingId &&
        hasManagedBookingWorkflow(row.contract.metadata) &&
        !shouldRevealBookingPiiForRoute(c)
      ) {
        await auditManagedBookingAttachmentDelivery(c, {
          bookingId: row.contract.bookingId,
          contractId: row.contract.id,
          attachmentId: attachment.id,
          outcome: "denied",
          reason: "insufficient_scope",
        })
        return c.json({ error: "Attachment not found" }, 404)
      }

      const runtime = getRuntime(options, c.env, (key) => c.var.container?.resolve(key))
      const download = await resolveStoredDocumentDownload(
        { ...attachment, filename: attachment.name },
        {
          bindings: c.env,
          resolveDocumentDownloadUrl: runtime.resolveDocumentDownloadUrl,
        },
      )
      if (download.status === "resolver_not_configured") {
        return c.json({ error: "Document download resolver is not configured" }, 501)
      }
      if (download.status !== "ready") {
        return c.json({ error: "Attachment file is not available" }, 404)
      }
      if (row.contract.bookingId && hasManagedBookingWorkflow(row.contract.metadata)) {
        await auditManagedBookingAttachmentDelivery(c, {
          bookingId: row.contract.bookingId,
          contractId: row.contract.id,
          attachmentId: attachment.id,
          outcome: "allowed",
          reason: "contract_document_delivery_reveal",
        })
      }

      return c.redirect(download.download.url, 302)
    })
    .openapi(deleteAttachmentRoute, (c) => asRouteResponse(deleteContractAttachment(c, options)))

  const parent = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  // Preserve the original per-route idempotency guard on `POST /`. The
  // middleware no-ops without an `Idempotency-Key` header (so list GET / is
  // unaffected); mounted on the literal `/` path it only fires for the
  // create-contract request.
  parent.use("/", idempotencyKey({ scope: "POST /v1/admin/legal/contracts" }))
  return parent
    .route("/", templateRoutes)
    .route("/", templateVersionRoutes)
    .route("/", numberSeriesRoutes)
    .route("/", contractRoutes)
    .route("/", lifecycleRoutes)
    .route("/", signatureAttachmentRoutes)
}

export const contractsAdminRoutes = createContractsAdminRoutes()

export function createContractsPublicRoutes(options: ContractsRouteOptions = {}) {
  const getDefaultTemplateRoute = createRoute({
    method: "get",
    path: "/templates/default",
    request: { query: contractTemplateDefaultQuerySchema },
    responses: {
      200: {
        description: "The resolved default contract template for the scope/language",
        content: { "application/json": { schema: dataEnvelope(contractTemplateSchema) } },
      },
      404: notFoundResponse("Template not found"),
    },
  })

  const previewTemplateRoute = createRoute({
    method: "post",
    path: "/templates/{id}/preview",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: publicRenderTemplatePreviewInputSchema } },
      },
    },
    responses: {
      200: {
        description: "The rendered template preview",
        content: { "application/json": { schema: renderPreviewEnvelopeSchema } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Template not found"),
    },
  })

  const renderPreviewTemplateRoute = createRoute({
    method: "post",
    path: "/templates/{id}/render-preview",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: publicRenderTemplatePreviewInputSchema } },
      },
    },
    responses: {
      200: {
        description: "The rendered template preview",
        content: { "application/json": { schema: renderPreviewEnvelopeSchema } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Template not found"),
    },
  })

  const previewTemplateBySlugRoute = createRoute({
    method: "post",
    path: "/templates/by-slug/{slug}/preview",
    request: {
      params: z.object({ slug: z.string() }),
      body: {
        required: true,
        content: { "application/json": { schema: publicRenderTemplatePreviewInputSchema } },
      },
    },
    responses: {
      200: {
        description: "The rendered template preview (with template descriptor)",
        content: { "application/json": { schema: renderPreviewEnvelopeSchema } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Template not found"),
    },
  })

  const renderPreviewTemplateBySlugRoute = createRoute({
    method: "post",
    path: "/templates/by-slug/{slug}/render-preview",
    request: {
      params: z.object({ slug: z.string() }),
      body: {
        required: true,
        content: { "application/json": { schema: publicRenderTemplatePreviewInputSchema } },
      },
    },
    responses: {
      200: {
        description: "The rendered template preview (with template descriptor)",
        content: { "application/json": { schema: renderPreviewEnvelopeSchema } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Template not found"),
    },
  })

  const getContractRoute = createRoute({
    method: "get",
    path: "/{id}",
    request: { params: idParamSchema, query: publicContractAccessQuerySchema },
    responses: {
      200: {
        description: "A token-authorized public-safe contract",
        content: {
          "application/json": { schema: dataEnvelope(publicContractSchema) },
        },
      },
      404: notFoundResponse("Contract not found"),
      410: notFoundResponse("Contract access grant is no longer available"),
    },
  })

  const signContractRoute = createRoute({
    method: "post",
    path: "/{id}/sign",
    request: {
      params: idParamSchema,
      query: publicContractAccessQuerySchema,
      body: {
        required: true,
        content: { "application/json": { schema: publicInsertContractSignatureSchema } },
      },
    },
    responses: {
      200: {
        description: "The recorded signature",
        content: {
          "application/json": {
            schema: z.object({ data: z.object({ signature: publicContractSignatureSchema }) }),
          },
        },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Contract not found"),
      410: notFoundResponse("Contract access grant is no longer available"),
      409: conflictResponse("Contract is not in a signable state"),
    },
  })

  const templatePreviewRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(getDefaultTemplateRoute, async (c) => {
      const row = await contractsService.getDefaultTemplate(c.get("db"), c.req.valid("query"))
      if (!row) return c.json({ error: "Template not found" }, 404)
      cachePublicLegalRead(c)
      return c.json({ data: row }, 200)
    })
    .openapi(previewTemplateRoute, (c) => asRouteResponse(renderPublicTemplatePreview(c)))
    .openapi(renderPreviewTemplateRoute, (c) => asRouteResponse(renderPublicTemplatePreview(c)))
    .openapi(previewTemplateBySlugRoute, (c) =>
      asRouteResponse(renderPublicTemplatePreviewBySlug(c)),
    )
    .openapi(renderPreviewTemplateBySlugRoute, (c) =>
      asRouteResponse(renderPublicTemplatePreviewBySlug(c)),
    )

  const contractRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(getContractRoute, async (c) => {
      preventSharedCache(c)
      const contractId = c.req.valid("param").id
      const authorization = await authorizePublicContractAccess(
        c,
        contractId,
        c.req.valid("query").token,
        "read",
      )
      if (authorization === "gone") {
        return c.json({ error: "Contract access grant is no longer available" }, 410)
      }
      if (authorization !== "ready") return c.json({ error: "Contract not found" }, 404)

      const row = await contractsService.getContractById(c.get("db"), contractId)
      if (!row) return c.json({ error: "Contract not found" }, 404)
      return c.json({ data: toPublicContract(row) }, 200)
    })
    .openapi(signContractRoute, async (c) => {
      preventSharedCache(c)
      const contractId = c.req.valid("param").id
      const authorization = await authorizePublicContractAccess(
        c,
        contractId,
        c.req.valid("query").token,
        "sign",
      )
      if (authorization === "gone") {
        return c.json({ error: "Contract access grant is no longer available" }, 410)
      }
      if (authorization !== "ready") return c.json({ error: "Contract not found" }, 404)

      const runtime = getRuntime(options, c.env, (key) => c.var.container?.resolve(key))
      const result = await contractsService.signContract(
        c.get("db"),
        contractId,
        {
          ...c.req.valid("json"),
          ipAddress: getClientIp(c),
          userAgent: c.req.header("user-agent") ?? null,
        },
        runtime,
      )
      if (result.status === "not_found") return c.json({ error: "Contract not found" }, 404)
      if (result.status === "not_signable") {
        return c.json({ error: "Contract is not in a signable state" }, 409)
      }
      return c.json({ data: { signature: toPublicSignature(result.signature!) } }, 200)
    })

  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .route("/", templatePreviewRoutes)
    .route("/", contractRoutes)
}

export const contractsPublicRoutes = createContractsPublicRoutes()

export type ContractsAdminRoutes = typeof contractsAdminRoutes
export type ContractsPublicRoutes = typeof contractsPublicRoutes
