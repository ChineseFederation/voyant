import { createAdminInvalidationSubscriberRuntime } from "./admin-invalidation-subscriber.js"
import type { CreateRealtimeApiModuleOptions } from "./index.js"
import type { RealtimeProvider, RealtimeRouteResult, RealtimeRoutes } from "./types.js"

function adminHint(entity: string, id: string | undefined): RealtimeRouteResult {
  return { channels: ["admin"], hint: id ? { entity, id } : { entity } }
}

function bookingHint(event: unknown, entity: "booking" | "payment"): RealtimeRouteResult {
  const { bookingId } = event as { bookingId: string }
  return { channels: ["admin", `booking:${bookingId}`], hint: { entity, id: bookingId } }
}

function firstId(event: unknown, ...keys: ReadonlyArray<string>): string | undefined {
  const record = event as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") return value
  }
  return undefined
}

/** Product event-to-channel invalidation policy, owned by Realtime. */
export const realtimeInvalidationRoutes = {
  "product.created": (event) => adminHint("product", firstId(event, "id")),
  "product.updated": (event) => adminHint("product", firstId(event, "id")),
  "product.deleted": (event) => adminHint("product", firstId(event, "id")),
  "product.content.changed": (event) => adminHint("product", firstId(event, "id")),
  "person.changed": (event) => adminHint("person", firstId(event, "id")),
  "organization.changed": (event) => adminHint("organization", firstId(event, "id")),
  "customer.signal.created": (event) => adminHint("signal", firstId(event, "id")),
  "supplier.created": (event) => adminHint("supplier", firstId(event, "id")),
  "supplier.updated": (event) => adminHint("supplier", firstId(event, "id")),
  "supplier.deleted": (event) => adminHint("supplier", firstId(event, "id")),
  "quote.created": (event) => adminHint("quote", firstId(event, "id")),
  "quote.updated": (event) => adminHint("quote", firstId(event, "id")),
  "quote.deleted": (event) => adminHint("quote", firstId(event, "id")),
  "invoice.issued": (event) => adminHint("invoice", firstId(event, "invoiceId", "id")),
  "invoice.voided": (event) => adminHint("invoice", firstId(event, "invoiceId", "id")),
  "invoice.settled": (event) => adminHint("invoice", firstId(event, "invoiceId", "id")),
  "invoice.proforma.issued": (event) => adminHint("invoice", firstId(event, "invoiceId", "id")),
  "invoice.proforma.converted": (event) => adminHint("invoice", firstId(event, "invoiceId", "id")),
  "contract.issued": (event) => adminHint("contract", firstId(event, "contractId", "id")),
  "contract.sent": (event) => adminHint("contract", firstId(event, "contractId", "id")),
  "contract.signed": (event) => adminHint("contract", firstId(event, "contractId", "id")),
  "contract.executed": (event) => adminHint("contract", firstId(event, "contractId", "id")),
  "contract.voided": (event) => adminHint("contract", firstId(event, "contractId", "id")),
  "cruise.created": (event) => adminHint("cruise", firstId(event, "id")),
  "cruise.updated": (event) => adminHint("cruise", firstId(event, "id")),
  "cruise.deleted": (event) => adminHint("cruise", firstId(event, "id")),
  "pricing.rule.changed": (event) => adminHint("pricing", firstId(event, "productId")),
  "promotion.changed": (event) => adminHint("promotion", firstId(event, "offerId")),
  "booking.confirmed": (event) => bookingHint(event, "booking"),
  "booking.cancelled": (event) => bookingHint(event, "booking"),
  "booking.refunded": (event) => bookingHint(event, "payment"),
  "payment.completed": (event) =>
    adminHint("payment", firstId(event, "bookingId", "paymentSessionId")),
  "availability.slot.changed": (event) => {
    const { productId } = event as { productId: string }
    return {
      channels: ["admin", `product:${productId}`],
      hint: { entity: "availability", id: productId },
    }
  },
} satisfies RealtimeRoutes

function invalidationSubscriber(eventType: keyof typeof realtimeInvalidationRoutes) {
  return createAdminInvalidationSubscriberRuntime({
    id: `@voyant-travel/realtime#subscriber.admin-invalidation.${eventType}`,
    eventType,
    route: realtimeInvalidationRoutes[eventType]!,
  })
}

export const realtimeProductCreatedInvalidationSubscriber =
  invalidationSubscriber("product.created")
export const realtimeProductUpdatedInvalidationSubscriber =
  invalidationSubscriber("product.updated")
export const realtimeProductDeletedInvalidationSubscriber =
  invalidationSubscriber("product.deleted")
export const realtimeProductContentChangedInvalidationSubscriber =
  invalidationSubscriber("product.content.changed")
export const realtimePersonChangedInvalidationSubscriber = invalidationSubscriber("person.changed")
export const realtimeOrganizationChangedInvalidationSubscriber =
  invalidationSubscriber("organization.changed")
export const realtimeCustomerSignalCreatedInvalidationSubscriber =
  invalidationSubscriber("customer.signal.created")
export const realtimeSupplierCreatedInvalidationSubscriber =
  invalidationSubscriber("supplier.created")
export const realtimeSupplierUpdatedInvalidationSubscriber =
  invalidationSubscriber("supplier.updated")
export const realtimeSupplierDeletedInvalidationSubscriber =
  invalidationSubscriber("supplier.deleted")
export const realtimeQuoteCreatedInvalidationSubscriber = invalidationSubscriber("quote.created")
export const realtimeQuoteUpdatedInvalidationSubscriber = invalidationSubscriber("quote.updated")
export const realtimeQuoteDeletedInvalidationSubscriber = invalidationSubscriber("quote.deleted")
export const realtimeInvoiceIssuedInvalidationSubscriber = invalidationSubscriber("invoice.issued")
export const realtimeInvoiceVoidedInvalidationSubscriber = invalidationSubscriber("invoice.voided")
export const realtimeInvoiceSettledInvalidationSubscriber =
  invalidationSubscriber("invoice.settled")
export const realtimeInvoiceProformaIssuedInvalidationSubscriber =
  invalidationSubscriber("invoice.proforma.issued")
export const realtimeInvoiceProformaConvertedInvalidationSubscriber = invalidationSubscriber(
  "invoice.proforma.converted",
)
export const realtimeContractIssuedInvalidationSubscriber =
  invalidationSubscriber("contract.issued")
export const realtimeContractSentInvalidationSubscriber = invalidationSubscriber("contract.sent")
export const realtimeContractSignedInvalidationSubscriber =
  invalidationSubscriber("contract.signed")
export const realtimeContractExecutedInvalidationSubscriber =
  invalidationSubscriber("contract.executed")
export const realtimeContractVoidedInvalidationSubscriber =
  invalidationSubscriber("contract.voided")
export const realtimeCruiseCreatedInvalidationSubscriber = invalidationSubscriber("cruise.created")
export const realtimeCruiseUpdatedInvalidationSubscriber = invalidationSubscriber("cruise.updated")
export const realtimeCruiseDeletedInvalidationSubscriber = invalidationSubscriber("cruise.deleted")
export const realtimePricingRuleChangedInvalidationSubscriber =
  invalidationSubscriber("pricing.rule.changed")
export const realtimePromotionChangedInvalidationSubscriber =
  invalidationSubscriber("promotion.changed")
export const realtimeBookingConfirmedInvalidationSubscriber =
  invalidationSubscriber("booking.confirmed")
export const realtimeBookingCancelledInvalidationSubscriber =
  invalidationSubscriber("booking.cancelled")
export const realtimeBookingRefundedInvalidationSubscriber =
  invalidationSubscriber("booking.refunded")
export const realtimePaymentCompletedInvalidationSubscriber =
  invalidationSubscriber("payment.completed")
export const realtimeAvailabilitySlotChangedInvalidationSubscriber = invalidationSubscriber(
  "availability.slot.changed",
)

/** Build deterministic route options from the deployment-selected transport. */
export function createRealtimeRuntime(
  provider: RealtimeProvider | null,
): CreateRealtimeApiModuleOptions {
  return {
    resolveProviders: () => (provider ? [provider] : []),
  }
}
