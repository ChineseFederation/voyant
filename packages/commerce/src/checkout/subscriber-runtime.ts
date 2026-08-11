import {
  type MonthlyBookingLimitResolver,
  resolveMonthlyBookingLimit,
  selectMonthlyBookingLimit,
} from "@voyant-travel/bookings"
import {
  type CatalogBookingSessionSettlementRuntime,
  catalogBookingSessionSettlementRuntimePort,
} from "@voyant-travel/catalog/ports"
import type { BootstrapContext, EventBus, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { and, desc, eq, inArray } from "drizzle-orm"
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
export const COMMERCE_INVOICE_PAYMENT_SIGNATURE_SUBSCRIBER_ID =
  "@voyant-travel/commerce#subscriber.catalog-checkout-invoice-payment-recorded"

export interface CatalogCheckoutRuntimeDatabase<TBindings = unknown>
  extends CatalogCheckoutDatabaseRuntime {
  withDb<T>(bindings: TBindings, operation: (db: PostgresJsDatabase) => Promise<T>): Promise<T>
}

export interface AcceptanceSignatureSubscriberRuntimeOptions<TBindings = unknown>
  extends CatalogCheckoutRuntimeDatabase<TBindings> {
  legal: AcceptanceSignatureLegalPort
  promoteLinkedPayment?: typeof recordLinkedBookingPaymentConfirmation
  persistSignature?: typeof persistAcceptanceSignature
  logger?: Pick<Console, "error">
}

export interface CheckoutFinalizeSubscriberRuntimeOptions<TBindings = unknown>
  extends CatalogCheckoutRuntimeDatabase<TBindings> {
  finalize?: typeof finalizeCheckout
  settleBookingSession?: CatalogBookingSessionSettlementRuntime["commitPaidSession"]
  legal?: AcceptanceSignatureLegalPort
  persistSignature?: typeof persistAcceptanceSignature
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
  targetType?: string
  targetId?: string | null
  paymentIntent?: "card" | "bank_transfer" | "hold" | "ticket_on_credit"
}

interface InvoicePaymentRecordedPayload {
  bookingId: string | null
  paymentId: string
  status: "pending" | "completed" | "failed" | "refunded"
}

/**
 * Recover the card path when the shopper's paid Commit wins the settlement
 * subscriber race.
 *
 * The Booking Session payment is transferred onto the Booking in the same
 * transaction that creates it. The earlier `payment.completed` event may have
 * already been delivered while that payment still targeted the Booking
 * Session, so document generation is the first durable post-commit checkpoint
 * guaranteed to see both the Contract and the transferred payment.
 */
export async function recordLinkedBookingPaymentConfirmation(
  db: PostgresJsDatabase,
  contractId: string,
  legal: AcceptanceSignatureLegalPort,
): Promise<void> {
  const contract = await legal.getContract(db, contractId)
  if (!contract?.bookingId) return

  const { paymentSessions } = await import("@voyant-travel/finance/schema")
  const [paymentSession] = await db
    .select({ id: paymentSessions.id })
    .from(paymentSessions)
    .where(
      and(
        eq(paymentSessions.bookingId, contract.bookingId),
        inArray(paymentSessions.status, ["authorized", "paid"]),
      ),
    )
    .orderBy(desc(paymentSessions.updatedAt), desc(paymentSessions.id))
    .limit(1)
  if (!paymentSession) return

  await legal.recordBookingPaymentConfirmation(db, contract.bookingId, paymentSession.id)
}

/** Build the acceptance-signature descriptor without activating its manifest runtime. */
export function createAcceptanceSignatureSubscriberRuntime<TBindings = unknown>(
  options: AcceptanceSignatureSubscriberRuntimeOptions<TBindings>,
): SubscriberRuntimeDescriptor {
  const promoteLinkedPayment =
    options.promoteLinkedPayment ?? recordLinkedBookingPaymentConfirmation
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
            await options.withDb(runtimeBindings, async (db) => {
              await promoteLinkedPayment(db, data.contractId, options.legal)
              await persistSignature(db, data.contractId, eventBus, options.legal)
            })
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
          let bookingId = data.bookingId
          try {
            if (!bookingId && data.targetType === "booking_session" && data.targetId) {
              if (!options.settleBookingSession) {
                throw new Error("Booking Session settlement runtime is not configured")
              }
              bookingId = (
                await options.settleBookingSession({
                  bookingSessionId: data.targetId,
                  paymentSessionId: data.paymentSessionId,
                })
              ).bookingId
            }
            if (!bookingId) return
            const finalizedBookingId = bookingId
            // Resolved per event, not at registration: the subscriber outlives
            // any single tenant plan state.
            const monthlyBookingLimit = selectMonthlyBookingLimit(
              options.resolveMonthlyBookingLimit,
              configuredMonthlyBookingLimit,
            )
            const nestedEventBus = (context?.eventBus ?? eventBus) as EventBus

            await options.withDb(runtimeBindings, async (db) => {
              await finalize({
                db,
                eventBus: nestedEventBus,
                input: {
                  bookingId: finalizedBookingId,
                  paymentSessionId: data.paymentSessionId,
                  paymentIntent: data.paymentIntent,
                },
                monthlyBookingLimit,
              })
              if (!options.legal) return
              await options.legal.recordBookingPaymentConfirmation(
                db,
                finalizedBookingId,
                data.paymentSessionId,
              )
              const contract = await options.legal.getBookingContract(db, finalizedBookingId)
              if (!contract) return
              await (options.persistSignature ?? persistAcceptanceSignature)(
                db,
                contract.id,
                nestedEventBus,
                options.legal,
              )
            })
          } catch (error) {
            logger.error(
              `[catalog-checkout] checkout finalization failed for booking ${bookingId ?? data.targetId ?? "unknown"}`,
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

/** Promote checkout acceptance after an operator confirms a booking invoice payment. */
export function createInvoicePaymentSignatureSubscriberRuntime<TBindings = unknown>(
  options: AcceptanceSignatureSubscriberRuntimeOptions<TBindings>,
): SubscriberRuntimeDescriptor {
  const persistSignature = options.persistSignature ?? persistAcceptanceSignature
  const logger = options.logger ?? console

  return {
    id: COMMERCE_INVOICE_PAYMENT_SIGNATURE_SUBSCRIBER_ID,
    eventType: "invoice.payment.recorded",
    register: ({ bindings, eventBus }) => {
      const runtimeBindings = bindings as TBindings
      eventBus.subscribe<InvoicePaymentRecordedPayload>(
        "invoice.payment.recorded",
        async ({ data }, context) => {
          if (data.status !== "completed" || !data.bookingId) return
          const bookingId = data.bookingId
          const nestedEventBus = (context?.eventBus ?? eventBus) as EventBus
          try {
            await options.withDb(runtimeBindings, async (db) => {
              await options.legal.recordBookingPaymentConfirmation(db, bookingId, data.paymentId)
              const contract = await options.legal.getBookingContract(db, bookingId)
              if (!contract) return
              await persistSignature(db, contract.id, nestedEventBus, options.legal)
            })
          } catch (error) {
            logger.error(
              `[catalog-checkout] invoice payment signature promotion failed for booking ${bookingId}`,
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
  async ({ getPort, hostOptions }) => {
    const database = await getPort(catalogCheckoutDatabaseRuntimePort)
    const settlement = await getPort(catalogBookingSessionSettlementRuntimePort)
    const legal = await getPort(catalogCheckoutLegalRuntimePort)
    return {
      id: COMMERCE_CHECKOUT_FINALIZE_SUBSCRIBER_ID,
      eventType: "payment.completed",
      register: async (context: BootstrapContext) => {
        const descriptor = createCheckoutFinalizeSubscriberRuntime({
          ...database,
          legal,
          settleBookingSession: (input) => settlement.commitPaidSession(input),
          // Finalizing a checkout accepts a booking, so this path draws on the
          // same monthly quota as the booking and finance routes. Before host
          // options existed this factory took none, which left the seam
          // reachable only through the direct constructor.
          ...(hostOptions as Partial<CheckoutFinalizeSubscriberRuntimeOptions>),
        })
        await descriptor.register(context)
      },
    }
  },
)

/** Selected-graph factory for operator-recorded booking payment promotion. */
export const createInvoicePaymentSignatureSubscriberGraphRuntime = defineGraphRuntimeFactory(
  async ({ getPort }) =>
    createInvoicePaymentSignatureSubscriberRuntime({
      ...(await getPort(catalogCheckoutDatabaseRuntimePort)),
      legal: await getPort(catalogCheckoutLegalRuntimePort),
    }),
)
