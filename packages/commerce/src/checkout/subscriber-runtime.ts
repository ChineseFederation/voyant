import {
  type MonthlyBookingLimitResolver,
  resolveMonthlyBookingLimit,
  selectMonthlyBookingLimit,
} from "@voyant-travel/bookings"
import type { BootstrapContext, EventBus, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type AcceptanceSignatureLegalPort,
  persistAcceptanceSignature,
} from "./acceptance-signature.js"
import { finalizeCheckout } from "./finalize.js"
import {
  type CatalogCheckoutDatabaseRuntime,
  catalogCheckoutDatabaseRuntimePort,
  catalogCheckoutLegalRuntimePort,
} from "./runtime-ports.js"

export type { AcceptanceSignatureLegalPort } from "./acceptance-signature.js"
export type {
  CatalogCheckoutApiRuntime,
  CatalogCheckoutDatabaseRuntime,
} from "./runtime-ports.js"
export {
  catalogCheckoutApiRuntimePort,
  catalogCheckoutDatabaseRuntimePort,
  catalogCheckoutLegalRuntimePort,
} from "./runtime-ports.js"

export const COMMERCE_ACCEPTANCE_SIGNATURE_SUBSCRIBER_ID =
  "@voyant-travel/commerce#subscriber.catalog-checkout-contract-document-generated"
export const COMMERCE_CHECKOUT_FINALIZE_SUBSCRIBER_ID =
  "@voyant-travel/commerce#subscriber.catalog-checkout-payment-completed"

export interface CatalogCheckoutRuntimeDatabase<TBindings = unknown>
  extends CatalogCheckoutDatabaseRuntime {
  withDb<T>(bindings: TBindings, operation: (db: PostgresJsDatabase) => Promise<T>): Promise<T>
}

export interface AcceptanceSignatureSubscriberRuntimeOptions<TBindings = unknown>
  extends CatalogCheckoutRuntimeDatabase<TBindings> {
  legal: AcceptanceSignatureLegalPort
  persistSignature?: typeof persistAcceptanceSignature
  logger?: Pick<Console, "error">
}

export interface CheckoutFinalizeSubscriberRuntimeOptions<TBindings = unknown>
  extends CatalogCheckoutRuntimeDatabase<TBindings> {
  finalize?: typeof finalizeCheckout
  logger?: Pick<Console, "error">
  /**
   * Per-event monthly booking allowance, for hosts whose plan entitlement
   * changes while the process runs. Same contract as the bookings runtime
   * option of the same name. Finalizing a checkout accepts a booking, so this
   * path consumes the same quota as the booking and finance routes.
   */
  resolveMonthlyBookingLimit?: MonthlyBookingLimitResolver
}

interface ContractDocumentGeneratedPayload {
  contractId: string
}

interface PaymentCompletedPayload {
  bookingId: string | null
  paymentSessionId: string
  paymentIntent?: "card" | "bank_transfer" | "hold" | "ticket_on_credit"
}

/** Build the acceptance-signature descriptor without activating its manifest runtime. */
export function createAcceptanceSignatureSubscriberRuntime<TBindings = unknown>(
  options: AcceptanceSignatureSubscriberRuntimeOptions<TBindings>,
): SubscriberRuntimeDescriptor {
  const persistSignature = options.persistSignature ?? persistAcceptanceSignature
  const logger = options.logger ?? console

  return {
    id: COMMERCE_ACCEPTANCE_SIGNATURE_SUBSCRIBER_ID,
    eventType: "contract.document.generated",
    register: ({ bindings, eventBus }) => {
      const runtimeBindings = bindings as TBindings
      eventBus.subscribe<ContractDocumentGeneratedPayload>(
        "contract.document.generated",
        async ({ data }) => {
          try {
            await options.withDb(runtimeBindings, (db) =>
              persistSignature(db, data.contractId, eventBus, options.legal),
            )
          } catch (error) {
            logger.error("[catalog-checkout] persistAcceptanceSignature failed", error)
            throw error
          }
        },
      )
    },
  }
}

/** Build the payment-finalization descriptor without activating its manifest runtime. */
export function createCheckoutFinalizeSubscriberRuntime<TBindings = unknown>(
  options: CheckoutFinalizeSubscriberRuntimeOptions<TBindings>,
): SubscriberRuntimeDescriptor {
  const finalize = options.finalize ?? finalizeCheckout
  const logger = options.logger ?? console

  return {
    id: COMMERCE_CHECKOUT_FINALIZE_SUBSCRIBER_ID,
    eventType: "payment.completed",
    register: ({ bindings, eventBus }) => {
      const runtimeBindings = bindings as TBindings
      const processEnv =
        (
          globalThis as typeof globalThis & {
            process?: { env?: Record<string, string | undefined> }
          }
        ).process?.env ?? {}
      const configuredMonthlyBookingLimit = resolveMonthlyBookingLimit({
        ...processEnv,
        ...(bindings as Record<string, unknown>),
      })
      eventBus.subscribe<PaymentCompletedPayload>(
        "payment.completed",
        async ({ data }, context) => {
          if (!data.bookingId) return
          const bookingId = data.bookingId
          // Resolved per event, not at registration: the subscriber outlives
          // any single tenant plan state.
          const monthlyBookingLimit = selectMonthlyBookingLimit(
            options.resolveMonthlyBookingLimit,
            configuredMonthlyBookingLimit,
          )
          const nestedEventBus = (context?.eventBus ?? eventBus) as EventBus

          try {
            await options.withDb(runtimeBindings, (db) =>
              finalize({
                db,
                eventBus: nestedEventBus,
                input: {
                  bookingId,
                  paymentSessionId: data.paymentSessionId,
                  paymentIntent: data.paymentIntent,
                },
                monthlyBookingLimit,
              }),
            )
          } catch (error) {
            logger.error(
              `[catalog-checkout] checkout finalization failed for booking ${bookingId}`,
              error,
            )
            throw error
          }
        },
        { inline: true },
      )
    },
  }
}

/** Selected-graph factory for acceptance-signature promotion. */
export const createAcceptanceSignatureSubscriberGraphRuntime = defineGraphRuntimeFactory(
  async ({ getPort }) =>
    createAcceptanceSignatureSubscriberRuntime({
      ...(await getPort(catalogCheckoutDatabaseRuntimePort)),
      legal: await getPort(catalogCheckoutLegalRuntimePort),
    }),
)

/** Selected-graph factory for inline payment finalization. */
export const createCheckoutFinalizeSubscriberGraphRuntime = defineGraphRuntimeFactory(
  async ({ getPort }) => {
    const database = await getPort(catalogCheckoutDatabaseRuntimePort)
    return {
      id: COMMERCE_CHECKOUT_FINALIZE_SUBSCRIBER_ID,
      eventType: "payment.completed",
      register: async (context: BootstrapContext) => {
        const descriptor = createCheckoutFinalizeSubscriberRuntime({
          ...database,
        })
        await descriptor.register(context)
      },
    }
  },
)
