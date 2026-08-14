import type { EventEnvelope, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  generateBookingContractOnConfirmation,
  recordUnfulfilledBookingContract,
} from "./booking-contract-confirmed.js"
import { legalContractDocumentJobRuntimePort } from "./contract-document-job-runtime-port.js"
import {
  type LegalDocumentArtifactProvider,
  legalDocumentArtifactProviderPort,
} from "./contracts/document-artifact-provider.js"

export const LEGAL_BOOKING_CONTRACT_CONFIRMED_SUBSCRIBER_ID =
  "@voyant-travel/legal#subscriber.booking-contract-confirmed"

/**
 * voyant#4634: the payload used to declare `suppressNotifications`, which no
 * file in this package ever read. Its presence implied Legal was meant to
 * respect it and did not. It does not need to: customer notification
 * suppression is persisted as `bookings.notifications_suppressed` on the
 * booking row itself, and every customer-facing notification path re-reads it
 * from there. Declaring it here only misstated where the decision lives.
 */
export interface LegalBookingConfirmedPayload {
  bookingId: string
  bookingNumber: string
  actorId: string | null
}

export type LegalBookingConfirmedEvent = EventEnvelope<LegalBookingConfirmedPayload>

export interface LegalBookingContractConfirmedSubscriberOptions {
  resolveDb(): PostgresJsDatabase | Promise<PostgresJsDatabase>
  provider?: LegalDocumentArtifactProvider
  generate?: (input: {
    db: PostgresJsDatabase
    event: LegalBookingConfirmedEvent
  }) => Promise<unknown>
}

/** Register the durable Legal projection of the booking confirmation event. */
export function createLegalBookingContractConfirmedSubscriber(
  options: LegalBookingContractConfirmedSubscriberOptions,
): SubscriberRuntimeDescriptor {
  return {
    id: LEGAL_BOOKING_CONTRACT_CONFIRMED_SUBSCRIBER_ID,
    eventType: "booking.confirmed",
    register: ({ eventBus }) => {
      eventBus.subscribe<LegalBookingConfirmedPayload>("booking.confirmed", async (event) => {
        const db = await options.resolveDb()
        if (options.generate) {
          await options.generate({ db, event })
          return
        }
        // voyant#4634: a deployment without a renderer used to `return` here.
        // That is the state in which contract generation has never once run,
        // and it looked identical to a deployment where it always works.
        if (!options.provider) {
          await recordUnfulfilledBookingContract(db, {
            event,
            reason: "document_renderer_unavailable",
          })
          return
        }
        await generateBookingContractOnConfirmation({
          db,
          event,
          provider: options.provider,
          eventBus,
        })
      })
    },
  }
}

/**
 * Resolve only graph-selected runtime ports. A deployment without a renderer
 * generates nothing — but says so per booking rather than remaining silently
 * inert; see `recordUnfulfilledBookingContract`.
 */
export const createLegalBookingContractConfirmedSubscriberGraphRuntime = defineGraphRuntimeFactory(
  async ({ getPort, hasPort }) => {
    const runtime = await getPort(legalContractDocumentJobRuntimePort)
    const provider = hasPort(legalDocumentArtifactProviderPort)
      ? await getPort(legalDocumentArtifactProviderPort)
      : undefined
    return createLegalBookingContractConfirmedSubscriber({
      resolveDb: runtime.resolveDb,
      ...(provider ? { provider } : {}),
    })
  },
)
