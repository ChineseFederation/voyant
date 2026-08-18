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
import { normalizeProposalPaymentTerms, proposalDepositAmountCents } from "./payment-terms.js"
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
  /**
   * Whether `POST /:id/accept` can succeed on this proposal right now.
   *
   * A version whose lines were typed by hand carries no frozen Trip snapshot,
   * and acceptance refuses one (`snapshot_required`) for the life of the
   * version. Without this a client can only discover that by rendering an
   * Accept control and explaining the 409 afterwards.
   */
  acceptance: PublicProposalVersionAcceptance
  /**
   * The payment terms the customer is agreeing to, when the operator stated
   * them on this version. `null` means the version carries none and the
   * booking's schedule falls to the operator's own cascade — the offer then
   * states nothing rather than stating a default it cannot guarantee.
   */
  paymentTerms: PublicProposalVersionPaymentTerms | null
}

export interface PublicProposalVersionAcceptance {
  available: boolean
  /** Why acceptance is unavailable. `null` when it is available. */
  reason: "snapshot_required" | "not_open" | null
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

/**
 * The version's payment terms, stated in the currency and total the customer
 * is looking at.
 *
 * The deposit is resolved to an amount here rather than left as a percentage:
 * the customer is agreeing to pay a sum, and a percentage they have to apply to
 * a total themselves is not a stated term. The balance keeps its rule
 * (`daysBeforeDeparture`) because the proposal has no departure date to anchor
 * it to — the Trip snapshot does, and the booking's schedule resolves it there.
 */
export interface PublicProposalVersionPaymentTerms {
  currency: string
  depositAmountCents: number
  balanceAmountCents: number
  balanceDueDaysBeforeDeparture: number
}

export interface ProposalVersionSendWarning {
  code: "snapshot_required"
  message: string
}

export interface SendProposalVersionResult {
  proposalVersion: ProposalVersion
  proposalUrl: string
  /**
   * Non-blocking problems with what was just sent. A version may legitimately
   * be sent for review without a frozen Trip snapshot, but it can never be
   * accepted in that state — the operator is the only party who can fix it, so
   * the send response is where they are told.
   */
  warnings: ProposalVersionSendWarning[]
}

export interface DeclinePublicProposalResult {
  status: ProposalVersion["status"]
  /** Id of the recorded decline reason, or `null` when none was sent. */
  feedbackId: string | null
}

export interface PublicProposalFeedbackInput {
  proposalId: string
  proposalVersionId: string
  message: string
  proposalUrl: string
  /**
   * What the customer was doing when they wrote this. Both kinds are the same
   * customer sentence about the same proposal, and both belong in CRM — but a
   * decline reason is not an edit request and must not be filed as one.
   */
  kind: PublicProposalFeedbackKind
}

export type PublicProposalFeedbackKind = "edits_requested" | "declined"

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

/**
 * Decline takes the same message request-edits does, and it is optional: a
 * customer may decline without saying why, and refusing the decline over a
 * missing sentence would be worse than not asking for one.
 */
const declinePublicProposalSchema = z.object({
  message: z.string().trim().min(1).max(4000).optional(),
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
    acceptance: resolveProposalVersionAcceptance(proposalVersion),
    paymentTerms: toPublicProposalVersionPaymentTerms(proposalVersion),
  }
}

/**
 * Whether this version can be accepted, and why not when it cannot.
 *
 * Mirrors the two gates `acceptProposalAndPrepareBooking` applies before it
 * touches anything: the version has to still be open, and it has to carry a
 * frozen Trip snapshot. Anything a client renders off this is exactly what the
 * accept route would answer.
 */
export function resolveProposalVersionAcceptance(
  proposalVersion: Pick<ProposalVersion, "status" | "tripSnapshotId">,
): PublicProposalVersionAcceptance {
  if (proposalVersion.status !== "sent") return { available: false, reason: "not_open" }
  if (!proposalVersion.tripSnapshotId) return { available: false, reason: "snapshot_required" }
  return { available: true, reason: null }
}

function toPublicProposalVersionPaymentTerms(
  proposalVersion: ProposalVersion,
): PublicProposalVersionPaymentTerms | null {
  const terms = normalizeProposalPaymentTerms(proposalVersion.paymentTerms)
  if (!terms) return null
  const depositAmountCents = proposalDepositAmountCents(terms, proposalVersion.totalAmountCents)
  return {
    currency: proposalVersion.currency,
    depositAmountCents,
    balanceAmountCents: Math.max(0, proposalVersion.totalAmountCents - depositAmountCents),
    balanceDueDaysBeforeDeparture: terms.balanceDueDaysBeforeDeparture,
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
  // The path parameters and the 404/409 the handler can return were described in
  // the published document and not here, so generating the document from this
  // registration would have dropped them. The registration is the source now.
  app.openAPIRegistry.registerPath({
    method: "post",
    path: "/{envelopeId}/proposal-versions/{proposalVersionId}/snapshot",
    summary: "Freeze a Trip snapshot into a Proposal Version",
    request: {
      params: z.object({
        envelopeId: z.string(),
        proposalVersionId: z.string(),
      }),
    },
    responses: {
      200: { description: "The updated Proposal Version and frozen Trip snapshot." },
      404: { description: "The Trip or Proposal Version was not found." },
      409: { description: "The Trip or Proposal Version cannot be snapshotted." },
    },
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
        warnings: sendProposalVersionWarnings(proposalVersion),
      } satisfies SendProposalVersionResult,
    })
  } catch (error) {
    if (error instanceof ProposalVersionConflictError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
}

/**
 * What is wrong with a version that was nonetheless sent.
 *
 * Sending without a frozen Trip snapshot is deliberately allowed — a
 * line-item proposal is a legitimate thing to put in front of a client for
 * review. What is not allowed is letting the operator believe it can be
 * accepted: `acceptProposalAndPrepareBooking` refuses one for the life of the
 * version, and the operator is the only party who can freeze a snapshot.
 */
function sendProposalVersionWarnings(
  proposalVersion: ProposalVersion,
): ProposalVersionSendWarning[] {
  if (proposalVersion.tripSnapshotId) return []
  return [
    {
      code: "snapshot_required",
      message:
        "This proposal has no frozen Trip snapshot, so the customer cannot accept it. Freeze a snapshot from the Trip before they try.",
    },
  ]
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

  const body = (await parseOptionalJsonBody(c, declinePublicProposalSchema)) ?? {}
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
    // "Too expensive" or "the dates no longer work" is the most useful
    // sentence in the whole sales loop, and declining is exactly when a
    // customer writes it. Recorded through the same hook request-edits uses
    // so it reaches CRM the same way, only after the status actually moved.
    const feedback = await recordPublicProposalFeedback(c, options, {
      proposalId: proposal.proposal.id,
      proposalVersionId,
      message: body.message,
      kind: "declined",
    })
    return c.json({
      data: {
        status: proposalVersion.status,
        feedbackId: feedback?.id ?? null,
      } satisfies DeclinePublicProposalResult,
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

  const feedback = await recordPublicProposalFeedback(c, options, {
    proposalId: proposal.proposal.id,
    proposalVersionId,
    message: body.message,
    kind: "edits_requested",
  })

  return c.json({
    data: {
      status: "sent",
      feedbackId: feedback?.id ?? null,
    } satisfies RequestPublicProposalEditsResult,
  })
}

/**
 * Route a customer sentence to the deployment's feedback hook.
 *
 * Silent when the deployment wired no hook, and silent when the customer wrote
 * nothing — an empty decline is a decline, not a failure.
 */
async function recordPublicProposalFeedback(
  c: Context<OperatorProposalRouteEnv>,
  options: ProposalPresentationRoutesOptions,
  input: {
    proposalId: string
    proposalVersionId: string
    message: string | undefined
    kind: PublicProposalFeedbackKind
  },
): Promise<PublicProposalFeedbackRecord | null> {
  const message = input.message?.trim()
  if (!message || !options.recordPublicProposalFeedback) return null
  return (
    (await options.recordPublicProposalFeedback(
      options.resolveDb(c),
      {
        proposalId: input.proposalId,
        proposalVersionId: input.proposalVersionId,
        message,
        kind: input.kind,
        proposalUrl: buildProposalVersionProposalUrl(input.proposalVersionId, {
          baseUrl: options.resolvePublicProposalBaseUrl(c),
        }),
      },
      c,
    )) ?? null
  )
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
