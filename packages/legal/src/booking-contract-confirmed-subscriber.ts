import type { EventEnvelope, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { generateBookingContractOnConfirmation } from "./booking-contract-confirmed.js"
import { legalContractDocumentJobRuntimePort } from "./contract-document-job-runtime-port.js"
import {
  type LegalDocumentArtifactProvider,
  legalDocumentArtifactProviderPort,
} from "./contracts/document-artifact-provider.js"

export const LEGAL_BOOKING_CONTRACT_CONFIRMED_SUBSCRIBER_ID =
  "@voyant-travel/legal#subscriber.booking-contract-confirmed"

export interface LegalBookingConfirmedPayload {
  bookingId: string
  bookingNumber: string
  actorId: string | null
  suppressNotifications?: boolean
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
        if (!options.provider && !options.generate) return
        const db = await options.resolveDb()
        if (options.generate) {
          await options.generate({ db, event })
          return
        }
        await generateBookingContractOnConfirmation({
          db,
          event,
          provider: options.provider!,
          eventBus,
        })
      })
    },
  }
}

/** Resolve only graph-selected runtime ports; a deployment without a renderer remains inert. */
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
