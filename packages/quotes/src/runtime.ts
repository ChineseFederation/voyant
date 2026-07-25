import type { EventBus } from "@voyant-travel/core"
import { getOperatorSettings, toPublicOperatorSettings } from "@voyant-travel/operator-settings"
import { relationshipsService } from "@voyant-travel/relationships"
import type { Context } from "hono"
import type {
  QuotesRuntimeContribution,
  QuotesRuntimeContributorHost,
} from "./runtime-contributor.js"
import type { QuotesProposalRuntime } from "./runtime-port.js"

/** Build standard Node Quotes runtimes from generic primitives and package services. */
export async function createQuotesRuntime(
  host: QuotesRuntimeContributorHost,
): Promise<QuotesRuntimeContribution> {
  const resolveDb: QuotesProposalRuntime["resolveDb"] = (context) =>
    host.primitives.database.fromContext<ReturnType<QuotesProposalRuntime["resolveDb"]>>(context)
  return {
    quotes: {
      resolveParticipantPersonById: async (db, personId) =>
        (await relationshipsService.getPersonById(db, personId)) != null,
    },
    snapshot: { resolveDb },
    proposal: {
      resolveDb,
      resolvePublicProposalBaseUrl: (context) =>
        resolvePublicBaseUrl(host.primitives.env(context.env)),
      resolveOperatorProfile: async (db) => {
        const settings = await getOperatorSettings(db)
        return settings ? toPublicOperatorSettings(settings) : null
      },
      recordPublicProposalFeedback: async (db, input, context) => {
        const activity = await db.transaction(async (tx) => {
          const row = await relationshipsService.createActivity(tx as never, {
            subject: "Customer requested proposal edits",
            type: "note",
            status: "done",
            completedAt: new Date().toISOString(),
            description: input.message,
          })
          if (!row) throw new Error("Failed to record proposal feedback activity")
          await relationshipsService.createActivityLink(tx as never, row.id, {
            entityType: "quote",
            entityId: input.quoteId,
            role: "primary",
          })
          return { id: row.id }
        })

        await getEventBus(context)?.emit(
          "quote.proposal_feedback.requested",
          {
            quoteId: input.quoteId,
            quoteVersionId: input.quoteVersionId,
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
