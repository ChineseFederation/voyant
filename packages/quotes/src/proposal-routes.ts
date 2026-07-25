/**
 * Quote-version proposal + Trip-snapshot HTTP routes, owned by the quotes
 * module.
 *
 * agent-quality: file-size exception -- the proposal lifecycle (admin send,
 * public get/accept/decline) plus the Trip-snapshot freeze form one cohesive
 * route family backed by the same quotes/trips services; splitting it would
 * scatter a single accept-under-lock contract.
 *
 *   Admin proposal (mount at /v1/admin/quote-versions):
 *     POST   /:quoteVersionId/send
 *   Public proposal (mount at /v1/public/proposals):
 *     GET    /:quoteVersionId
 *     POST   /:quoteVersionId/accept
 *     POST   /:quoteVersionId/decline
 *     POST   /:quoteVersionId/request-edits
 *   Admin snapshot (mount at /v1/admin/trips):
 *     POST   /:envelopeId/quote-versions/:quoteVersionId/snapshot
 *
 * These shapes (validation, status codes, the accept-under-advisory-lock flow,
 * the snapshot↔proposal equivalence checks, and the pure
 * `tripSnapshotToQuoteVersionApply` mapper) are framework logic and live here.
 *
 * The deployment supplies the concrete db resolver, public proposal base URL,
 * public operator profile, and optional CRM feedback hook via
 * `QuoteProposalRoutesOptions` — all generic / structural so this package
 * stays free of operator types and CloudflareBindings.
 */
import { OpenAPIHono } from "@hono/zod-openapi"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { parseJsonBody, parseOptionalJsonBody } from "@voyant-travel/hono"
import type { ApiExtension } from "@voyant-travel/hono/module"
import {
  type TripSnapshot,
  type TripSnapshotProposalLine,
  TripsInvariantError,
  tripsService,
} from "@voyant-travel/trips"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { type Context, Hono } from "hono"
import { z } from "zod"
import { quotesProposalRuntimePort, quotesSnapshotRuntimePort } from "./runtime-port.js"
import type { QuoteVersion, QuoteVersionLine } from "./schema.js"
import { QuoteVersionConflictError, quotesService } from "./service/index.js"
import { sendQuoteVersionSchema } from "./validation.js"

/**
 * Deployment-supplied dependencies for the quote proposal + snapshot routes.
 *
 * Generic / structural types keep the quotes package free of operator types and
 * CloudflareBindings — the deployment casts `c.get("db")` to its own concrete
 * type inside `resolveDb` and supplies the public operator profile.
 */
export interface QuoteProposalRoutesOptions {
  /** Resolve the concrete transactional db for a request. */
  resolveDb(c: Context): PostgresJsDatabase
  /**
   * Resolve the public base URL for proposal links (e.g. the customer dashboard
   * origin). Returns `null` to emit a root-relative path.
   */
  resolvePublicProposalBaseUrl(c: Context): string | null
  /**
   * Resolve the deployment's public operator profile, surfaced on the public
   * proposal payload. Returns `null` when no profile is configured.
   */
  resolveOperatorProfile(db: PostgresJsDatabase): Promise<unknown | null>
  /**
   * Optional deployment hook for public customer feedback. Deployments can use
   * this to write CRM activity rows, trigger notifications/workflows, or both.
   */
  recordPublicProposalFeedback?(
    db: PostgresJsDatabase,
    input: PublicProposalFeedbackInput,
    c: Context,
  ): Promise<PublicProposalFeedbackRecord | null>
}

export const QUOTE_PROPOSAL_OPENAPI_API_IDS = {
  admin: "@voyant-travel/quotes#proposal-extension.api.admin",
  public: "@voyant-travel/quotes#proposal-extension.api.public",
} as const

export const QUOTE_VERSION_SNAPSHOT_OPENAPI_API_ID =
  "@voyant-travel/quotes#quote-version-snapshot-extension.api"

const PUBLIC_PROPOSAL_OPENAPI_OPERATIONS = [
  ["get", "/{quoteVersionId}", "Get a public quote proposal"],
  ["post", "/{quoteVersionId}/accept", "Accept a public quote proposal"],
  ["post", "/{quoteVersionId}/decline", "Decline a public quote proposal"],
  ["post", "/{quoteVersionId}/request-edits", "Request quote proposal edits"],
] as const

export interface QuoteVersionSnapshotRoutesOptions {
  /** Resolve the concrete transactional db for a request. */
  resolveDb(c: Context): PostgresJsDatabase
}

type OperatorProposalRouteEnv = {
  Bindings: Record<string, unknown>
  Variables: {
    db: unknown
    userId?: string
  }
}

type OperatorQuoteVersionSnapshotRouteEnv = {
  Variables: {
    db: unknown
    userId?: string
  }
}

export interface PublicQuoteVersionProposal {
  title: string
  status: QuoteVersion["status"]
  currency: string
  subtotalAmountCents: number
  taxAmountCents: number
  totalAmountCents: number
  validUntil: string | null
  notes: string | null
  lines: PublicQuoteVersionProposalLine[]
  media: PublicQuoteVersionProposalMedia[]
  operator: unknown | null
  proposalUrl: string
}

export interface PublicQuoteVersionProposalMedia {
  url: string
  name: string
  altText: string | null
  mediaType: string
}

export interface PublicQuoteVersionProposalLine {
  description: string
  quantity: number
  unitPriceAmountCents: number
  totalAmountCents: number
  currency: string
}

export interface SendQuoteVersionResult {
  quoteVersion: QuoteVersion
  proposalUrl: string
}

export interface DeclinePublicProposalResult {
  status: QuoteVersion["status"]
}

export interface PublicProposalFeedbackInput {
  quoteId: string
  quoteVersionId: string
  message: string
  proposalUrl: string
}

export interface PublicProposalFeedbackRecord {
  id: string
}

export interface RequestPublicProposalEditsResult {
  status: Extract<QuoteVersion["status"], "sent">
  feedbackId: string | null
}

export interface AcceptPublicProposalResult {
  status: Extract<QuoteVersion["status"], "accepted">
  currency: string
  totalAmountCents: number
}

export type ApplyTripSnapshotToQuoteVersionResult = {
  snapshot: TripSnapshot
  quoteVersion: QuoteVersion
  lines: QuoteVersionLine[]
}

type ApplyTripSnapshotPayload = Parameters<typeof quotesService.applyTripSnapshotToQuoteVersion>[2]

type QuoteVersionProposalReadModel = NonNullable<
  Awaited<ReturnType<typeof quotesService.getQuoteVersionProposal>>
>
const requestPublicProposalEditsSchema = z.object({
  message: z.string().trim().min(1).max(4000),
})

const freezeQuoteVersionSnapshotBodySchema = z.object({
  createdBy: z.string().min(1).nullable().optional(),
})

/** Build a proposal URL — absolute when a base URL is supplied, else root-relative. */
export function buildQuoteVersionProposalUrl(
  quoteVersionId: string,
  options: { baseUrl?: string | null } = {},
) {
  const path = `/proposal/${encodeURIComponent(quoteVersionId)}`
  const baseUrl = options.baseUrl?.trim().replace(/\/+$/, "")
  return baseUrl ? `${baseUrl}${path}` : path
}

function toPublicQuoteVersionProposal(
  proposal: QuoteVersionProposalReadModel,
  options: {
    quoteVersion?: QuoteVersion | null
    operator: unknown | null
    proposalUrl: string
    media?: ReadonlyArray<{
      url: string
      name: string
      altText: string | null
      mediaType: string
    }>
  },
): PublicQuoteVersionProposal {
  const quoteVersion = options.quoteVersion ?? proposal.quoteVersion

  return {
    title: proposal.quote.title,
    status: quoteVersion.status,
    currency: quoteVersion.currency,
    subtotalAmountCents: quoteVersion.subtotalAmountCents,
    taxAmountCents: quoteVersion.taxAmountCents,
    totalAmountCents: quoteVersion.totalAmountCents,
    validUntil: quoteVersion.validUntil,
    notes: quoteVersion.notes,
    lines: proposal.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceAmountCents: line.unitPriceAmountCents,
      totalAmountCents: line.totalAmountCents,
      currency: line.currency,
    })),
    media: (options.media ?? []).map((item) => ({
      url: item.url,
      name: item.name,
      altText: item.altText,
      mediaType: item.mediaType,
    })),
    operator: options.operator,
    proposalUrl: options.proposalUrl,
  }
}

/** Build the admin proposal routes (relative paths; mount at `/v1/admin/quote-versions`). */
export function createQuoteProposalAdminRoutes(
  options: QuoteProposalRoutesOptions,
): Hono<OperatorProposalRouteEnv> {
  const app = new Hono<OperatorProposalRouteEnv>()
  app.post("/:quoteVersionId/send", (c) => handleSendQuoteVersion(c, options))
  app.get("/:quoteVersionId/proposal-link", (c) => handleGetQuoteVersionProposalLink(c, options))
  return app
}

/** Build the public proposal routes (relative paths; mount at `/v1/public/proposals`). */
export function createQuoteProposalPublicRoutes(
  options: QuoteProposalRoutesOptions,
): OpenAPIHono<OperatorProposalRouteEnv> {
  const app = new OpenAPIHono<OperatorProposalRouteEnv>()
  app.get("/:quoteVersionId", (c) => handleGetPublicProposal(c, options))
  app.post("/:quoteVersionId/accept", (c) => handleAcceptPublicProposal(c, options))
  app.post("/:quoteVersionId/decline", (c) => handleDeclinePublicProposal(c, options))
  app.post("/:quoteVersionId/request-edits", (c) => handleRequestPublicProposalEdits(c, options))
  for (const [method, path, summary] of PUBLIC_PROPOSAL_OPENAPI_OPERATIONS) {
    app.openAPIRegistry.registerPath({
      method,
      path,
      summary,
      responses: { 200: { description: "Successful response." } },
      "x-voyant-api-id": QUOTE_PROPOSAL_OPENAPI_API_IDS.public,
    })
  }
  return app
}

/** Build the Trip-snapshot freeze route (relative path; mount at `/v1/admin/trips`). */
export function createQuoteVersionSnapshotRoutes(
  options: QuoteVersionSnapshotRoutesOptions,
): OpenAPIHono<OperatorQuoteVersionSnapshotRouteEnv> {
  const app = new OpenAPIHono<OperatorQuoteVersionSnapshotRouteEnv>()
  app.post("/:envelopeId/quote-versions/:quoteVersionId/snapshot", (c) =>
    handleFreezeQuoteVersionSnapshot(c, options),
  )
  app.openAPIRegistry.registerPath({
    method: "post",
    path: "/{envelopeId}/quote-versions/{quoteVersionId}/snapshot",
    summary: "Freeze a Trip snapshot into a Quote Version",
    responses: { 200: { description: "The updated Quote Version and frozen Trip snapshot." } },
    "x-voyant-api-id": QUOTE_VERSION_SNAPSHOT_OPENAPI_API_ID,
  })
  return app
}

/** Package-owned proposal extension descriptor; deployments inject cross-module readers. */
export function createQuoteProposalApiExtension(options: QuoteProposalRoutesOptions): ApiExtension {
  return {
    extension: { name: "proposal", module: "quote-versions" },
    lazyAdminRoutes: async () => createQuoteProposalAdminRoutes(options),
    lazyPublicRoutes: async () => createQuoteProposalPublicRoutes(options),
    publicPath: "proposals",
    anonymous: true,
  }
}

/** Package-owned Trip snapshot extension descriptor; deployments inject the db resolver. */
export function createQuoteVersionSnapshotApiExtension(
  options: QuoteVersionSnapshotRoutesOptions,
): ApiExtension {
  return {
    extension: { name: "quote-version-snapshot", module: "trips" },
    lazyAdminRoutes: async () => createQuoteVersionSnapshotRoutes(options),
  }
}

/** Package-owned graph adapter for the proposal extension. */
export const createQuoteProposalVoyantRuntime = defineGraphRuntimeFactory(async ({ getPort }) =>
  createQuoteProposalApiExtension(await getPort(quotesProposalRuntimePort)),
)

/** Package-owned graph adapter for the quote-version snapshot extension. */
export const createQuoteVersionSnapshotVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort }) =>
    createQuoteVersionSnapshotApiExtension(await getPort(quotesSnapshotRuntimePort)),
)

async function handleSendQuoteVersion(
  c: Context<OperatorProposalRouteEnv>,
  options: QuoteProposalRoutesOptions,
) {
  const quoteVersionId = c.req.param("quoteVersionId")
  if (!quoteVersionId) return c.json({ error: "Quote Version id is required" }, 400)

  try {
    const quoteVersion = await quotesService.sendQuoteVersion(
      options.resolveDb(c),
      quoteVersionId,
      await parseOptionalJsonBody(c, sendQuoteVersionSchema),
    )
    if (!quoteVersion) return c.json({ error: "Quote Version not found" }, 404)

    return c.json({
      data: {
        quoteVersion,
        proposalUrl: buildQuoteVersionProposalUrl(quoteVersion.id, {
          baseUrl: options.resolvePublicProposalBaseUrl(c),
        }),
      } satisfies SendQuoteVersionResult,
    })
  } catch (error) {
    if (error instanceof QuoteVersionConflictError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
}

async function handleGetQuoteVersionProposalLink(
  c: Context<OperatorProposalRouteEnv>,
  options: QuoteProposalRoutesOptions,
) {
  const quoteVersionId = c.req.param("quoteVersionId")
  if (!quoteVersionId) return c.json({ error: "Quote Version id is required" }, 400)

  // Resolve the deployment's public proposal URL without any side effects
  // (no view tracking, no status change) so operators can re-copy the link.
  return c.json({
    data: {
      proposalUrl: buildQuoteVersionProposalUrl(quoteVersionId, {
        baseUrl: options.resolvePublicProposalBaseUrl(c),
      }),
    },
  })
}

async function handleGetPublicProposal(
  c: Context<OperatorProposalRouteEnv>,
  options: QuoteProposalRoutesOptions,
) {
  const quoteVersionId = c.req.param("quoteVersionId")
  if (!quoteVersionId) return c.json({ error: "Quote Version id is required" }, 400)

  const db = options.resolveDb(c)
  await quotesService.expireQuoteVersionIfPastValidUntil(db, quoteVersionId)
  const proposal = await quotesService.getQuoteVersionProposal(db, quoteVersionId)

  if (!proposal) return c.json({ error: "Proposal not found" }, 404)
  if (proposal.quoteVersion.status === "draft") return c.json({ error: "Proposal not found" }, 404)
  if (proposal.quoteVersion.status === "superseded") {
    return c.json({ error: "Proposal has been superseded" }, 410)
  }

  const viewedQuoteVersion =
    proposal.quoteVersion.status === "sent"
      ? await quotesService.markQuoteVersionViewed(db, quoteVersionId)
      : proposal.quoteVersion
  const operator = await options.resolveOperatorProfile(db)
  const media = await quotesService.listQuoteMedia(db, proposal.quote.id)

  return c.json({
    data: toPublicQuoteVersionProposal(proposal, {
      quoteVersion: viewedQuoteVersion,
      operator: operator ?? null,
      media,
      proposalUrl: buildQuoteVersionProposalUrl(quoteVersionId, {
        baseUrl: options.resolvePublicProposalBaseUrl(c),
      }),
    }),
  })
}

async function handleDeclinePublicProposal(
  c: Context<OperatorProposalRouteEnv>,
  options: QuoteProposalRoutesOptions,
) {
  const quoteVersionId = c.req.param("quoteVersionId")
  if (!quoteVersionId) return c.json({ error: "Quote Version id is required" }, 400)

  const db = options.resolveDb(c)
  await quotesService.expireQuoteVersionIfPastValidUntil(db, quoteVersionId)
  const proposal = await quotesService.getQuoteVersionProposal(db, quoteVersionId)

  if (!proposal) return c.json({ error: "Proposal not found" }, 404)
  if (proposal.quoteVersion.status === "draft") return c.json({ error: "Proposal not found" }, 404)
  if (proposal.quoteVersion.status === "superseded") {
    return c.json({ error: "Proposal has been superseded" }, 410)
  }

  try {
    const quoteVersion = await quotesService.declineQuoteVersion(db, quoteVersionId)
    if (!quoteVersion) return c.json({ error: "Proposal not found" }, 404)
    return c.json({
      data: { status: quoteVersion.status } satisfies DeclinePublicProposalResult,
    })
  } catch (error) {
    if (error instanceof QuoteVersionConflictError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
}

async function handleRequestPublicProposalEdits(
  c: Context<OperatorProposalRouteEnv>,
  options: QuoteProposalRoutesOptions,
) {
  const quoteVersionId = c.req.param("quoteVersionId")
  if (!quoteVersionId) return c.json({ error: "Quote Version id is required" }, 400)

  const body = await parseJsonBody(c, requestPublicProposalEditsSchema)
  const db = options.resolveDb(c)
  await quotesService.expireQuoteVersionIfPastValidUntil(db, quoteVersionId)
  const proposal = await quotesService.getQuoteVersionProposal(db, quoteVersionId)

  if (!proposal) return c.json({ error: "Proposal not found" }, 404)
  if (proposal.quoteVersion.status === "draft") return c.json({ error: "Proposal not found" }, 404)
  if (proposal.quoteVersion.status === "superseded") {
    return c.json({ error: "Proposal has been superseded" }, 410)
  }
  if (proposal.quoteVersion.status !== "sent") {
    return c.json({ error: "Proposal can no longer receive edit requests" }, 409)
  }

  const feedback =
    (await options.recordPublicProposalFeedback?.(
      db,
      {
        quoteId: proposal.quote.id,
        quoteVersionId,
        message: body.message,
        proposalUrl: buildQuoteVersionProposalUrl(quoteVersionId, {
          baseUrl: options.resolvePublicProposalBaseUrl(c),
        }),
      },
      c,
    )) ?? null

  return c.json({
    data: {
      status: "sent",
      feedbackId: feedback?.id ?? null,
    } satisfies RequestPublicProposalEditsResult,
  })
}

async function handleAcceptPublicProposal(
  c: Context<OperatorProposalRouteEnv>,
  options: QuoteProposalRoutesOptions,
) {
  const quoteVersionId = c.req.param("quoteVersionId")
  if (!quoteVersionId) return c.json({ error: "Quote Version id is required" }, 400)

  const db = options.resolveDb(c)
  const proposalForLock = await quotesService.getQuoteVersionProposal(db, quoteVersionId)

  if (!proposalForLock) return c.json({ error: "Proposal not found" }, 404)
  const quoteId = proposalForLock.quote.id

  try {
    const accepted = await db.transaction(async (tx) => {
      const transactionalDb = tx as PostgresJsDatabase
      await lockQuoteAccept(transactionalDb, quoteId)
      await quotesService.expireQuoteVersionIfPastValidUntil(transactionalDb, quoteVersionId)
      const proposal = await quotesService.getQuoteVersionProposal(transactionalDb, quoteVersionId)

      if (!proposal || proposal.quoteVersion.status === "draft") {
        return { kind: "response" as const, response: c.json({ error: "Proposal not found" }, 404) }
      }
      if (proposal.quoteVersion.status === "superseded") {
        return {
          kind: "response" as const,
          response: c.json({ error: "Proposal has been superseded" }, 410),
        }
      }
      const isAcceptedReplay =
        proposal.quoteVersion.status === "accepted" &&
        proposal.quote.acceptedVersionId === proposal.quoteVersion.id
      if (proposal.quoteVersion.status !== "sent" && !isAcceptedReplay) {
        return {
          kind: "response" as const,
          response: c.json({ error: "Proposal can no longer be accepted" }, 409),
        }
      }

      if (proposal.quoteVersion.tripSnapshotId) {
        const snapshot = await tripsService.getTripSnapshotById(
          transactionalDb,
          proposal.quoteVersion.tripSnapshotId,
        )
        if (!snapshot) {
          return {
            kind: "response" as const,
            response: c.json({ error: "Proposal Trip snapshot not found" }, 409),
          }
        }
        assertProposalMatchesTripSnapshot(proposal, snapshot)
      }

      const result = await quotesService.acceptQuoteVersion(transactionalDb, quoteVersionId, {})
      if (!result) {
        return { kind: "response" as const, response: c.json({ error: "Proposal not found" }, 404) }
      }
      return { kind: "accepted" as const, result }
    })
    if (accepted.kind === "response") return accepted.response

    return c.json({
      data: {
        status: "accepted",
        currency: accepted.result.quoteVersion.currency,
        totalAmountCents: accepted.result.quoteVersion.totalAmountCents,
      } satisfies AcceptPublicProposalResult,
    })
  } catch (error) {
    if (error instanceof QuoteVersionConflictError) {
      return c.json({ error: error.message }, 409)
    }
    if (error instanceof TripsInvariantError) {
      return c.json({ error: error.message }, error.message.includes("was not found") ? 404 : 409)
    }
    throw error
  }
}

function lockQuoteAccept(db: PostgresJsDatabase, quoteId: string) {
  return db.execute(
    // agent-quality: raw-sql reviewed -- owner: quotes; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${quoteAcceptLockKey(quoteId)}, 0))`,
  )
}

function quoteAcceptLockKey(quoteId: string) {
  return `quote-accept:${quoteId}`
}

function assertProposalMatchesTripSnapshot(
  proposal: QuoteVersionProposalReadModel,
  snapshot: TripSnapshot,
) {
  const expected = tripSnapshotToQuoteVersionApply(snapshot)
  const actual = proposal.quoteVersion

  if (
    actual.tripSnapshotId !== snapshot.id ||
    actual.currency !== expected.currency ||
    actual.subtotalAmountCents !== expected.subtotalAmountCents ||
    actual.taxAmountCents !== expected.taxAmountCents ||
    actual.totalAmountCents !== expected.totalAmountCents ||
    proposal.lines.length !== expected.lines.length
  ) {
    throw new QuoteVersionConflictError("Proposal does not match its frozen Trip snapshot")
  }

  for (const [index, expectedLine] of expected.lines.entries()) {
    const actualLine = proposal.lines[index]
    if (
      !actualLine ||
      actualLine.description !== expectedLine.description ||
      actualLine.quantity !== expectedLine.quantity ||
      actualLine.unitPriceAmountCents !== expectedLine.unitPriceAmountCents ||
      actualLine.totalAmountCents !== expectedLine.totalAmountCents ||
      actualLine.currency !== expectedLine.currency
    ) {
      throw new QuoteVersionConflictError("Proposal does not match its frozen Trip snapshot")
    }
  }
}

async function handleFreezeQuoteVersionSnapshot(
  c: Context<OperatorQuoteVersionSnapshotRouteEnv>,
  options: QuoteVersionSnapshotRoutesOptions,
) {
  const envelopeId = c.req.param("envelopeId")
  const quoteVersionId = c.req.param("quoteVersionId")
  if (!envelopeId) return c.json({ error: "Trip envelope id is required" }, 400)
  if (!quoteVersionId) return c.json({ error: "Quote version id is required" }, 400)

  const db = options.resolveDb(c)
  const body = await parseJsonBody(c, freezeQuoteVersionSnapshotBodySchema)

  try {
    const quoteVersion = await quotesService.getQuoteVersionById(db, quoteVersionId)
    if (!quoteVersion) return c.json({ error: "Quote version not found" }, 404)
    if (quoteVersion.status !== "draft") {
      return c.json({ error: "Trip snapshots can only be applied to draft Quote Versions" }, 409)
    }

    const userId = c.get("userId")
    const snapshot = await tripsService.freezeTripSnapshot(db, {
      envelopeId,
      createdBy: typeof userId === "string" ? userId : (body.createdBy ?? undefined),
    })
    const applied = await quotesService.applyTripSnapshotToQuoteVersion(
      db,
      quoteVersionId,
      tripSnapshotToQuoteVersionApply(snapshot),
    )

    if (!applied) return c.json({ error: "Quote version not found" }, 404)

    return c.json(
      {
        data: {
          snapshot,
          quoteVersion: applied.quoteVersion,
          lines: applied.lines,
        } satisfies ApplyTripSnapshotToQuoteVersionResult,
      },
      201,
    )
  } catch (error) {
    if (error instanceof TripsInvariantError) {
      return c.json({ error: error.message }, error.message.includes("was not found") ? 404 : 409)
    }
    if (error instanceof QuoteVersionConflictError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
}

/** Map a frozen Trip snapshot's proposal into a quote-version apply payload. */
export function tripSnapshotToQuoteVersionApply(snapshot: TripSnapshot): ApplyTripSnapshotPayload {
  const proposal = snapshot.proposal
  return {
    tripSnapshotId: snapshot.id,
    currency: proposal.currency,
    subtotalAmountCents: proposal.subtotalAmountCents,
    taxAmountCents: proposal.taxAmountCents,
    totalAmountCents: proposal.totalAmountCents,
    lines: proposal.lines.map(tripSnapshotLineToQuoteVersionLine),
  }
}

function tripSnapshotLineToQuoteVersionLine(line: TripSnapshotProposalLine) {
  return {
    componentId: line.componentId,
    productId: line.entityModule === "products" ? line.entityId : null,
    supplierServiceId: line.entityModule === "supplier_services" ? line.entityId : null,
    description: line.description,
    quantity: 1,
    unitPriceAmountCents: line.subtotalAmountCents,
    totalAmountCents: line.totalAmountCents,
    currency: line.currency,
  }
}
