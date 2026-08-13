import { catalogBookingRuntimePort } from "@voyant-travel/catalog/api-runtime-ports"
import type { CatalogBookingRouteModuleOptions } from "@voyant-travel/catalog/booking-engine/operator-routes"
import type { EventBus } from "@voyant-travel/core"
import { getOperatorSettings, toPublicOperatorSettings } from "@voyant-travel/operator-settings"
import { relationshipsService } from "@voyant-travel/relationships"
import type { Context } from "hono"
import type {
  ProposalsRuntimeContribution,
  ProposalsRuntimeContributorHost,
} from "./runtime-contributor.js"
import type { ProposalsPresentationRuntime } from "./runtime-port.js"

/** Build standard Node Proposals runtimes from generic primitives and package services. */
export async function createProposalsRuntime(
  host: ProposalsRuntimeContributorHost,
): Promise<ProposalsRuntimeContribution> {
  const catalogBooking =
    await host.getRuntimePort<CatalogBookingRouteModuleOptions>(catalogBookingRuntimePort)
  const resolveDb: ProposalsPresentationRuntime["resolveDb"] = (context) =>
    host.primitives.database.fromContext<ReturnType<ProposalsPresentationRuntime["resolveDb"]>>(
      context,
    )
  return {
    proposals: {
      resolveParticipantPersonById: async (db, personId) =>
        (await relationshipsService.getPersonById(db, personId)) != null,
    },
    snapshot: { resolveDb },
    proposal: {
      resolveDb,
      async seedAcceptedProposalBookingSession(db, input, context) {
        const bookingSessions = catalogBooking.bookingSessions
        if (!bookingSessions) {
          return { kind: "rejected", code: "booking_session_runtime_unavailable" }
        }
        const module = bookingSessions.resolveModule(context, db)
        const actorKind = resolveBookingSessionActorKind(context)
        const access = bookingSessions.resolveAccess?.(context, actorKind) ?? {
          actorKind: "anonymous" as const,
          capability: context.req.header("Voyant-Booking-Session-Capability")?.trim(),
        }
        const outcome = await module.createAcceptedProposalSession(
          {
            idempotencyKey: `proposal-version:${input.proposalVersionId}:booking-session`,
            proposalId: input.proposalId,
            proposalVersionId: input.proposalVersionId,
            tripSnapshotId: input.tripSnapshotId,
            tripEnvelopeId: input.tripEnvelopeId,
            ...(input.selection ? { selection: input.selection } : {}),
          },
          access,
        )
        if (outcome.kind === "session_created") {
          return { kind: "created", session: outcome.session }
        }
        if (outcome.kind === "rejected") {
          return { kind: "rejected", code: outcome.error.kind }
        }
        return { kind: "rejected", code: "booking_session_create_unexpected_outcome" }
      },
      resolvePublicProposalBaseUrl: (context) =>
        resolvePublicBaseUrl(host.primitives.env(context.env)),
      resolveOperatorProfile: async (db) => {
        const settings = await getOperatorSettings(db)
        return settings ? toPublicOperatorSettings(settings) : null
      },
      recordPublicProposalFeedback: async (db, input, context) => {
        const activity = await db.transaction(async (tx) => {
          const row = await relationshipsService.createActivity(tx as never, {
            subject:
              input.kind === "declined"
                ? "Customer declined proposal"
                : "Customer requested proposal edits",
            type: "note",
            status: "done",
            completedAt: new Date().toISOString(),
            description: input.message,
          })
          if (!row) throw new Error("Failed to record proposal feedback activity")
          await relationshipsService.createActivityLink(tx as never, row.id, {
            entityType: "proposal",
            entityId: input.proposalId,
            role: "primary",
          })
          return { id: row.id }
        })

        await getEventBus(context)?.emit(
          input.kind === "declined"
            ? "proposal.proposal_feedback.declined"
            : "proposal.proposal_feedback.requested",
          {
            proposalId: input.proposalId,
            proposalVersionId: input.proposalVersionId,
            activityId: activity.id,
            message: input.message,
            proposalUrl: input.proposalUrl,
          },
          { category: "domain", source: "route" },
        )
        return activity
      },
    },
  }
}

/** Preserve operator authority while public proposal acceptance stays capability-based. */
export function resolveBookingSessionActorKind(context: Context): "anonymous" | "staff" {
  return context.get("actor") === "staff" ? "staff" : "anonymous"
}

function resolvePublicBaseUrl(env: Readonly<Record<string, unknown>>): string | null {
  for (const key of ["PUBLIC_CHECKOUT_BASE_URL", "DASH_BASE_URL", "APP_URL"] as const) {
    const value = env[key]
    if (typeof value !== "string" || !value.trim()) continue
    return key === "APP_URL" ? value.trim().replace(/\/api\/?$/, "") : value.trim()
  }
  return null
}

function getEventBus(context: Context): EventBus | undefined {
  return (context.var as { eventBus?: EventBus }).eventBus
}
