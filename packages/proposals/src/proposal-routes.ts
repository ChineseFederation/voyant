/**
 * Proposal-version proposal + Trip-snapshot HTTP routes, owned by the proposals
 * module.
 *
 * agent-quality: file-size exception -- the proposal lifecycle (admin send,
 * public get/accept/decline) plus the Trip-snapshot freeze form one cohesive
 * route family backed by the same proposals/trips services; splitting it would
 * scatter a single accept-under-lock contract.
 *
 *   Admin proposal (mount at /v1/admin/proposal-versions):
 *     POST   /:proposalVersionId/send
 *   Public proposal (mount at /v1/public/proposals):
 *     GET    /:proposalVersionId
 *     POST   /:proposalVersionId/accept
 *     POST   /:proposalVersionId/decline
 *     POST   /:proposalVersionId/request-edits
 *   Admin snapshot (mount at /v1/admin/trips):
 *     POST   /:envelopeId/proposal-versions/:proposalVersionId/snapshot
 *
 * These shapes (validation, status codes, the accept-under-advisory-lock flow,
 * the snapshot↔proposal equivalence checks, and the pure
 * `tripSnapshotToProposalVersionApply` mapper) are framework logic and live here.
 *
 * The deployment supplies the concrete db resolver, public proposal base URL,
 * public operator profile, and optional CRM feedback hook via
 * `ProposalPresentationRoutesOptions` — all generic / structural so this package
 * stays free of operator types and CloudflareBindings.
 */
import { OpenAPIHono } from "@hono/zod-openapi"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { parseJsonBody, parseOptionalJsonBody } from "@voyant-travel/hono"
import type { ApiExtension } from "@voyant-travel/hono/module"
import { type TripSnapshot, TripsInvariantError, tripsService } from "@voyant-travel/trips"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { type Context, Hono } from "hono"
import { z } from "zod"
import { proposalsPresentationRuntimePort, proposalsSnapshotRuntimePort } from "./runtime-port.js"
import type { ProposalVersion, ProposalVersionLine } from "./schema.js"
import { ProposalVersionConflictError, proposalsService } from "./service/index.js"
import {
  type AcceptedProposalBookingSession,
  type AcceptedProposalBookingSessionSeed,
  type AcceptedProposalBookingSessionSeedResult,
  acceptProposalAndPrepareBooking,
  ProposalAcceptanceError,
  tripSnapshotToProposalVersionApply,
} from "./service/proposal-acceptance.js"
import { sendProposalVersionSchema } from "./validation.js"

/**
 * Deployment-supplied dependencies for the proposal + snapshot routes.
 *
 * Generic / structural types keep the proposals package free of operator types and
 * CloudflareBindings — the deployment casts `c.get("db")` to its own concrete
 * type inside `resolveDb` and supplies the public operator profile.
 */
export interface ProposalPresentationRoutesOptions {
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
  seedAcceptedProposalBookingSession(
    db: PostgresJsDatabase,
    input: AcceptedProposalBookingSessionSeed,
    c: Context,
  ): Promise<AcceptedProposalBookingSessionSeedResult>
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

export const PROPOSAL_PROPOSAL_OPENAPI_API_IDS = {
  admin: "@voyant-travel/proposals#presentation-extension.api.admin",
  public: "@voyant-travel/proposals#presentation-extension.api.public",
} as const

export const PROPOSAL_VERSION_SNAPSHOT_OPENAPI_API_ID =
  "@voyant-travel/proposals#proposal-version-snapshot-extension.api"

const PUBLIC_PROPOSAL_OPENAPI_OPERATIONS = [
  ["get", "/{proposalVersionId}", "Get a public proposal"],
  ["post", "/{proposalVersionId}/accept", "Accept a public proposal"],
  ["post", "/{proposalVersionId}/decline", "Decline a public proposal"],
  ["post", "/{proposalVersionId}/request-edits", "Request proposal edits"],
] as const

export interface ProposalVersionSnapshotRoutesOptions {
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

type OperatorProposalVersionSnapshotRouteEnv = {
  Variables: {
    db: unknown
    userId?: string
  }
}

export interface PublicProposalVersionProposal {
  title: string
  status: ProposalVersion["status"]
  currency: string
  subtotalAmountCents: number
  taxAmountCents: number
  totalAmountCents: number
  validUntil: string | null
  notes: string | null
  lines: PublicProposalVersionProposalLine[]
  media: PublicProposalVersionProposalMedia[]
  operator: unknown | null
  proposalUrl: string
}

export interface PublicProposalVersionProposalMedia {
  url: string
  name: string
  altText: string | null
  mediaType: string
}

export interface PublicProposalVersionProposalLine {
  description: string
  quantity: number
  unitPriceAmountCents: number
  totalAmountCents: number
  currency: string
}

export interface SendProposalVersionResult {
  proposalVersion: ProposalVersion
  proposalUrl: string
}

export interface DeclinePublicProposalResult {
  status: ProposalVersion["status"]
}

export interface PublicProposalFeedbackInput {
  proposalId: string
  proposalVersionId: string
  message: string
  proposalUrl: string
}

export interface PublicProposalFeedbackRecord {
  id: string
}

export interface RequestPublicProposalEditsResult {
  status: Extract<ProposalVersion["status"], "sent">
  feedbackId: string | null
}

export interface AcceptPublicProposalResult {
  status: Extract<ProposalVersion["status"], "accepted">
  currency: string
  totalAmountCents: number
  bookingSession: AcceptedProposalBookingSession
}

export type {
  AcceptedProposalBookingSession,
  AcceptedProposalBookingSessionSeed,
  AcceptedProposalBookingSessionSeedResult,
} from "./service/proposal-acceptance.js"

export type ApplyTripSnapshotToProposalVersionResult = {
  snapshot: TripSnapshot
  proposalVersion: ProposalVersion
  lines: ProposalVersionLine[]
}

type ProposalVersionProposalReadModel = NonNullable<
  Awaited<ReturnType<typeof proposalsService.getProposalVersionProposal>>
>
const requestPublicProposalEditsSchema = z.object({
  message: z.string().trim().min(1).max(4000),
})

const freezeProposalVersionSnapshotBodySchema = z.object({
  createdBy: z.string().min(1).nullable().optional(),
})

/** Build a proposal URL — absolute when a base URL is supplied, else root-relative. */
export function buildProposalVersionProposalUrl(
  proposalVersionId: string,
  options: { baseUrl?: string | null } = {},
) {
  const path = `/proposal/${encodeURIComponent(proposalVersionId)}`
  const baseUrl = options.baseUrl?.trim().replace(/\/+$/, "")
  return baseUrl ? `${baseUrl}${path}` : path
}

function toPublicProposalVersionProposal(
  proposal: ProposalVersionProposalReadModel,
  options: {
    proposalVersion?: ProposalVersion | null
    operator: unknown | null
    proposalUrl: string
    media?: ReadonlyArray<{
      url: string
      name: string
      altText: string | null
      mediaType: string
    }>
  },
): PublicProposalVersionProposal {
  const proposalVersion = options.proposalVersion ?? proposal.proposalVersion

  return {
    title: proposal.proposal.title,
    status: proposalVersion.status,
    currency: proposalVersion.currency,
    subtotalAmountCents: proposalVersion.subtotalAmountCents,
    taxAmountCents: proposalVersion.taxAmountCents,
    totalAmountCents: proposalVersion.totalAmountCents,
    validUntil: proposalVersion.validUntil,
    notes: proposalVersion.notes,
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

/** Build the admin proposal routes (relative paths; mount at `/v1/admin/proposal-versions`). */
export function createProposalPresentationAdminRoutes(
  options: ProposalPresentationRoutesOptions,
): Hono<OperatorProposalRouteEnv> {
  const app = new Hono<OperatorProposalRouteEnv>()
  app.post("/:proposalVersionId/send", (c) => handleSendProposalVersion(c, options))
  app.get("/:proposalVersionId/proposal-link", (c) =>
    handleGetProposalVersionProposalLink(c, options),
  )
  return app
}

/** Build the public proposal routes (relative paths; mount at `/v1/public/proposals`). */
export function createProposalPresentationPublicRoutes(
  options: ProposalPresentationRoutesOptions,
): OpenAPIHono<OperatorProposalRouteEnv> {
  const app = new OpenAPIHono<OperatorProposalRouteEnv>()
  app.get("/:proposalVersionId", (c) => handleGetPublicProposal(c, options))
  app.post("/:proposalVersionId/accept", (c) => handleAcceptPublicProposal(c, options))
  app.post("/:proposalVersionId/decline", (c) => handleDeclinePublicProposal(c, options))
  app.post("/:proposalVersionId/request-edits", (c) => handleRequestPublicProposalEdits(c, options))
  for (const [method, path, summary] of PUBLIC_PROPOSAL_OPENAPI_OPERATIONS) {
    app.openAPIRegistry.registerPath({
      method,
      path,
      summary,
      responses: { 200: { description: "Successful response." } },
      "x-voyant-api-id": PROPOSAL_PROPOSAL_OPENAPI_API_IDS.public,
    })
  }
  return app
}

/** Build the Trip-snapshot freeze route (relative path; mount at `/v1/admin/trips`). */
export function createProposalVersionSnapshotRoutes(
  options: ProposalVersionSnapshotRoutesOptions,
): OpenAPIHono<OperatorProposalVersionSnapshotRouteEnv> {
  const app = new OpenAPIHono<OperatorProposalVersionSnapshotRouteEnv>()
  app.post("/:envelopeId/proposal-versions/:proposalVersionId/snapshot", (c) =>
    handleFreezeProposalVersionSnapshot(c, options),
  )
  app.openAPIRegistry.registerPath({
    method: "post",
    path: "/{envelopeId}/proposal-versions/{proposalVersionId}/snapshot",
    summary: "Freeze a Trip snapshot into a Proposal Version",
    responses: { 200: { description: "The updated Proposal Version and frozen Trip snapshot." } },
    "x-voyant-api-id": PROPOSAL_VERSION_SNAPSHOT_OPENAPI_API_ID,
  })
  return app
}

/** Package-owned proposal extension descriptor; deployments inject cross-module readers. */
export function createProposalPresentationApiExtension(
  options: ProposalPresentationRoutesOptions,
): ApiExtension {
  return {
    extension: { name: "proposal", module: "proposal-versions" },
    lazyAdminRoutes: async () => createProposalPresentationAdminRoutes(options),
    lazyPublicRoutes: async () => createProposalPresentationPublicRoutes(options),
    publicPath: "proposals",
    anonymous: true,
  }
}

/** Package-owned Trip snapshot extension descriptor; deployments inject the db resolver. */
export function createProposalVersionSnapshotApiExtension(
  options: ProposalVersionSnapshotRoutesOptions,
): ApiExtension {
  return {
    extension: { name: "proposal-version-snapshot", module: "trips" },
    lazyAdminRoutes: async () => createProposalVersionSnapshotRoutes(options),
  }
}

/** Package-owned graph adapter for the proposal extension. */
export const createProposalPresentationVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort }) =>
    createProposalPresentationApiExtension(await getPort(proposalsPresentationRuntimePort)),
)

/** Package-owned graph adapter for the proposal-version snapshot extension. */
export const createProposalVersionSnapshotVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort }) =>
    createProposalVersionSnapshotApiExtension(await getPort(proposalsSnapshotRuntimePort)),
)

async function handleSendProposalVersion(
  c: Context<OperatorProposalRouteEnv>,
  options: ProposalPresentationRoutesOptions,
) {
  const proposalVersionId = c.req.param("proposalVersionId")
  if (!proposalVersionId) return c.json({ error: "Proposal Version id is required" }, 400)

  try {
    const proposalVersion = await proposalsService.sendProposalVersion(
      options.resolveDb(c),
      proposalVersionId,
      await parseOptionalJsonBody(c, sendProposalVersionSchema),
    )
    if (!proposalVersion) return c.json({ error: "Proposal Version not found" }, 404)

    return c.json({
      data: {
        proposalVersion,
        proposalUrl: buildProposalVersionProposalUrl(proposalVersion.id, {
          baseUrl: options.resolvePublicProposalBaseUrl(c),
        }),
      } satisfies SendProposalVersionResult,
    })
  } catch (error) {
    if (error instanceof ProposalVersionConflictError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
}

async function handleGetProposalVersionProposalLink(
  c: Context<OperatorProposalRouteEnv>,
  options: ProposalPresentationRoutesOptions,
) {
  const proposalVersionId = c.req.param("proposalVersionId")
  if (!proposalVersionId) return c.json({ error: "Proposal Version id is required" }, 400)

  // Resolve the deployment's public proposal URL without any side effects
  // (no view tracking, no status change) so operators can re-copy the link.
  return c.json({
    data: {
      proposalUrl: buildProposalVersionProposalUrl(proposalVersionId, {
        baseUrl: options.resolvePublicProposalBaseUrl(c),
      }),
    },
  })
}

async function handleGetPublicProposal(
  c: Context<OperatorProposalRouteEnv>,
  options: ProposalPresentationRoutesOptions,
) {
  const proposalVersionId = c.req.param("proposalVersionId")
  if (!proposalVersionId) return c.json({ error: "Proposal Version id is required" }, 400)

  const db = options.resolveDb(c)
  await proposalsService.expireProposalVersionIfPastValidUntil(db, proposalVersionId)
  const proposal = await proposalsService.getProposalVersionProposal(db, proposalVersionId)

  if (!proposal) return c.json({ error: "Proposal not found" }, 404)
  if (proposal.proposalVersion.status === "draft")
    return c.json({ error: "Proposal not found" }, 404)
  if (proposal.proposalVersion.status === "superseded") {
    return c.json({ error: "Proposal has been superseded" }, 410)
  }

  const viewedProposalVersion =
    proposal.proposalVersion.status === "sent"
      ? await proposalsService.markProposalVersionViewed(db, proposalVersionId)
      : proposal.proposalVersion
  const operator = await options.resolveOperatorProfile(db)
  const media = await proposalsService.listProposalMedia(db, proposal.proposal.id)

  return c.json({
    data: toPublicProposalVersionProposal(proposal, {
      proposalVersion: viewedProposalVersion,
      operator: operator ?? null,
      media,
      proposalUrl: buildProposalVersionProposalUrl(proposalVersionId, {
        baseUrl: options.resolvePublicProposalBaseUrl(c),
      }),
    }),
  })
}

async function handleDeclinePublicProposal(
  c: Context<OperatorProposalRouteEnv>,
  options: ProposalPresentationRoutesOptions,
) {
  const proposalVersionId = c.req.param("proposalVersionId")
  if (!proposalVersionId) return c.json({ error: "Proposal Version id is required" }, 400)

  const db = options.resolveDb(c)
  await proposalsService.expireProposalVersionIfPastValidUntil(db, proposalVersionId)
  const proposal = await proposalsService.getProposalVersionProposal(db, proposalVersionId)

  if (!proposal) return c.json({ error: "Proposal not found" }, 404)
  if (proposal.proposalVersion.status === "draft")
    return c.json({ error: "Proposal not found" }, 404)
  if (proposal.proposalVersion.status === "superseded") {
    return c.json({ error: "Proposal has been superseded" }, 410)
  }

  try {
    const proposalVersion = await proposalsService.declineProposalVersion(db, proposalVersionId)
    if (!proposalVersion) return c.json({ error: "Proposal not found" }, 404)
    return c.json({
      data: { status: proposalVersion.status } satisfies DeclinePublicProposalResult,
    })
  } catch (error) {
    if (error instanceof ProposalVersionConflictError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
}

async function handleRequestPublicProposalEdits(
  c: Context<OperatorProposalRouteEnv>,
  options: ProposalPresentationRoutesOptions,
) {
  const proposalVersionId = c.req.param("proposalVersionId")
  if (!proposalVersionId) return c.json({ error: "Proposal Version id is required" }, 400)

  const body = await parseJsonBody(c, requestPublicProposalEditsSchema)
  const db = options.resolveDb(c)
  await proposalsService.expireProposalVersionIfPastValidUntil(db, proposalVersionId)
  const proposal = await proposalsService.getProposalVersionProposal(db, proposalVersionId)

  if (!proposal) return c.json({ error: "Proposal not found" }, 404)
  if (proposal.proposalVersion.status === "draft")
    return c.json({ error: "Proposal not found" }, 404)
  if (proposal.proposalVersion.status === "superseded") {
    return c.json({ error: "Proposal has been superseded" }, 410)
  }
  if (proposal.proposalVersion.status !== "sent") {
    return c.json({ error: "Proposal can no longer receive edit requests" }, 409)
  }

  const feedback =
    (await options.recordPublicProposalFeedback?.(
      db,
      {
        proposalId: proposal.proposal.id,
        proposalVersionId,
        message: body.message,
        proposalUrl: buildProposalVersionProposalUrl(proposalVersionId, {
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
  options: ProposalPresentationRoutesOptions,
) {
  const proposalVersionId = c.req.param("proposalVersionId")
  if (!proposalVersionId) return c.json({ error: "Proposal Version id is required" }, 400)

  const db = options.resolveDb(c)
  try {
    const accepted = await acceptProposalAndPrepareBooking(
      db,
      proposalVersionId,
      (transactionalDb, input) =>
        options.seedAcceptedProposalBookingSession(transactionalDb, input, c),
    )
    return c.json({ data: accepted satisfies AcceptPublicProposalResult })
  } catch (error) {
    if (error instanceof ProposalAcceptanceError) {
      if (error.code === "not_found") return c.json({ error: error.message }, 404)
      if (error.code === "superseded") return c.json({ error: error.message }, 410)
      if (error.code === "booking_session_rejected") {
        return c.json(
          { error: error.message, code: error.detail },
          error.detail === "capability_required" ? 400 : 409,
        )
      }
      return c.json({ error: error.message }, 409)
    }
    if (error instanceof ProposalVersionConflictError) {
      return c.json({ error: error.message }, 409)
    }
    if (error instanceof TripsInvariantError) {
      return c.json({ error: error.message }, error.message.includes("was not found") ? 404 : 409)
    }
    throw error
  }
}

async function handleFreezeProposalVersionSnapshot(
  c: Context<OperatorProposalVersionSnapshotRouteEnv>,
  options: ProposalVersionSnapshotRoutesOptions,
) {
  const envelopeId = c.req.param("envelopeId")
  const proposalVersionId = c.req.param("proposalVersionId")
  if (!envelopeId) return c.json({ error: "Trip envelope id is required" }, 400)
  if (!proposalVersionId) return c.json({ error: "Proposal version id is required" }, 400)

  const db = options.resolveDb(c)
  const body = await parseJsonBody(c, freezeProposalVersionSnapshotBodySchema)

  try {
    const proposalVersion = await proposalsService.getProposalVersionById(db, proposalVersionId)
    if (!proposalVersion) return c.json({ error: "Proposal version not found" }, 404)
    if (proposalVersion.status !== "draft") {
      return c.json({ error: "Trip snapshots can only be applied to draft Proposal Versions" }, 409)
    }

    const userId = c.get("userId")
    const snapshot = await tripsService.freezeTripSnapshot(db, {
      envelopeId,
      createdBy: typeof userId === "string" ? userId : (body.createdBy ?? undefined),
    })
    const applied = await proposalsService.applyTripSnapshotToProposalVersion(
      db,
      proposalVersionId,
      tripSnapshotToProposalVersionApply(snapshot),
    )

    if (!applied) return c.json({ error: "Proposal version not found" }, 404)

    return c.json(
      {
        data: {
          snapshot,
          proposalVersion: applied.proposalVersion,
          lines: applied.lines,
        } satisfies ApplyTripSnapshotToProposalVersionResult,
      },
      201,
    )
  } catch (error) {
    if (error instanceof TripsInvariantError) {
      return c.json({ error: error.message }, error.message.includes("was not found") ? 404 : 409)
    }
    if (error instanceof ProposalVersionConflictError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
}

export { tripSnapshotToProposalVersionApply } from "./service/proposal-acceptance.js"
