import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type {
  ProposalPresentationRoutesOptions,
  ProposalVersionSnapshotRoutesOptions,
} from "./proposal-routes.js"
import type { ResolveProposalParticipantPersonById } from "./route-runtime.js"

/** Node-host behavior required by the package-owned Proposals module factory. */
export interface ProposalsRuntime {
  resolveParticipantPersonById: ResolveProposalParticipantPersonById
}

/** Deployment behavior required by the proposal extension. */
export type ProposalsPresentationRuntime = ProposalPresentationRoutesOptions

/** Deployment behavior required by the proposal-version snapshot extension. */
export type ProposalsSnapshotRuntime = ProposalVersionSnapshotRoutesOptions

export interface ProposalNotificationInput {
  idempotencyKey: string
  templateSlug: string
  to: string
  channel: "email" | "sms"
  data: Record<string, unknown>
  proposalId: string
  proposalVersionId: string
}

export interface ProposalNotificationDelivery {
  id: string
  status: "pending" | "sent" | "failed" | "cancelled"
  channel: "email" | "sms"
  provider: string
  providerMessageId: string | null
  toAddress: string
}

/** Notifications-owned delivery behavior consumed by the Proposals delivery composer. */
export interface ProposalsNotificationsRuntime {
  /** Exact graph-selected durable provider identities available to this adapter. */
  readonly providerNames: readonly string[]
  /**
   * Atomically enqueue one vetted-template proposal notification. Provider
   * dispatch is worker-only and uses the selected durable provider runtime.
   */
  enqueueProposalNotification(
    db: AnyDrizzleDb,
    input: ProposalNotificationInput,
  ): Promise<ProposalNotificationDelivery>
}

function requireFunctions(id: string, provider: object, methods: readonly string[]): void {
  const candidate = provider as Record<string, unknown>
  for (const method of methods) {
    if (typeof candidate[method] !== "function") {
      throw new Error(`${id} provider must implement ${method}().`)
    }
  }
}

function requireObject(id: string, provider: unknown): asserts provider is object {
  if (provider === null || typeof provider !== "object") {
    throw new Error(`${id} provider must be an options object.`)
  }
}

export const proposalsRuntimePort = definePort<ProposalsRuntime>({
  id: "proposals.runtime",
  test(provider) {
    requireObject("proposals.runtime", provider)
    requireFunctions("proposals.runtime", provider, ["resolveParticipantPersonById"])
  },
})

export const proposalsPresentationRuntimePort = definePort<ProposalsPresentationRuntime>({
  id: "proposals.presentation-runtime",
  test(provider) {
    requireObject("proposals.presentation-runtime", provider)
    requireFunctions("proposals.presentation-runtime", provider, [
      "resolveDb",
      "resolvePublicProposalBaseUrl",
      "resolveOperatorProfile",
      "seedAcceptedProposalBookingSession",
    ])
    const feedback = Reflect.get(provider, "recordPublicProposalFeedback")
    if (feedback !== undefined && typeof feedback !== "function") {
      throw new Error(
        "proposals.presentation-runtime provider recordPublicProposalFeedback must be a function.",
      )
    }
  },
})

export const proposalsSnapshotRuntimePort = definePort<ProposalsSnapshotRuntime>({
  id: "proposals.snapshot-runtime",
  test(provider) {
    requireObject("proposals.snapshot-runtime", provider)
    requireFunctions("proposals.snapshot-runtime", provider, ["resolveDb"])
  },
})

export const proposalsNotificationsRuntimePort = definePort<ProposalsNotificationsRuntime>({
  id: "proposals.notifications.runtime",
  test(provider) {
    requireObject("proposals.notifications.runtime", provider)
    requireFunctions("proposals.notifications.runtime", provider, ["enqueueProposalNotification"])
    const providerNames = Reflect.get(provider, "providerNames")
    if (
      !Array.isArray(providerNames) ||
      providerNames.length === 0 ||
      providerNames.some((name) => typeof name !== "string" || !name.trim()) ||
      new Set(providerNames).size !== providerNames.length
    ) {
      throw new Error(
        "proposals.notifications.runtime providerNames must identify the exact selected provider set.",
      )
    }
  },
})
