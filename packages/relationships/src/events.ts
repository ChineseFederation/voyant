import type { EventBus, EventSource } from "@voyant-travel/core"

export const INQUIRY_CREATED_EVENT = "inquiry.created" as const
export const INQUIRY_UPDATED_EVENT = "inquiry.updated" as const
export const INQUIRY_ASSIGNED_EVENT = "inquiry.assigned" as const
export const INQUIRY_STATUS_CHANGED_EVENT = "inquiry.status_changed" as const
export const INQUIRY_FIRST_RESPONSE_OVERDUE_EVENT = "inquiry.first_response_overdue" as const
export const INQUIRY_CLOSED_EVENT = "inquiry.closed" as const
export const INQUIRY_REOPENED_EVENT = "inquiry.reopened" as const
export const INQUIRY_CONVERTED_EVENT = "inquiry.converted" as const
export const INQUIRY_TARGET_ADDED_EVENT = "inquiry.target_added" as const
export const INQUIRY_TARGET_REMOVED_EVENT = "inquiry.target_removed" as const

export interface InquiryEvent {
  id: string
  actorId: string
}

export interface InquiryAssignedEvent extends InquiryEvent {
  ownerId: string | null
  teamId: string | null
}

export interface InquiryStatusChangedEvent extends InquiryEvent {
  from: string
  to: string
}

export interface InquiryClosedEvent extends InquiryEvent {
  outcome: string
}

export interface InquiryFirstResponseOverdueEvent {
  id: string
  firstResponseDueAt: string
}

export interface InquiryConvertedEvent extends InquiryEvent {
  conversionId: string
  kind: "proposal" | "booking_session"
  targetId: string
  inquiryStatus: "qualified" | "converted"
}

export interface InquiryTargetChangedEvent extends InquiryEvent {
  linkId: string
  kind: "product" | "option_unit"
  targetId: string
  occurredAt: string
}

export const CUSTOMER_SIGNAL_CREATED_EVENT = "customer.signal.created" as const

export type CustomerSignalCreatedIntake =
  | {
      surface: "storefront"
      type: "lead"
    }
  | {
      surface: "storefront"
      type: "newsletter"
      doubleOptIn: "not_configured" | "requested"
    }

export interface CustomerSignalCreatedEvent {
  id: string
  personId: string
  kind: "wishlist" | "notify" | "inquiry" | "request_offer" | "referral"
  source: "form" | "phone" | "admin" | "abandoned_cart" | "website" | "booking"
  status: "new" | "contacted" | "qualified" | "converted" | "lost" | "expired"
  productId?: string | null
  optionUnitId?: string | null
  sourceSubmissionId?: string | null
  intake?: CustomerSignalCreatedIntake
}

export async function emitCustomerSignalCreated(
  eventBus: EventBus | undefined,
  payload: CustomerSignalCreatedEvent,
  source: EventSource = "service",
): Promise<void> {
  if (!eventBus) return
  await eventBus.emit(CUSTOMER_SIGNAL_CREATED_EVENT, payload, {
    category: "domain",
    source,
  })
}

export const PERSON_CHANGED_EVENT = "person.changed" as const
export const ORGANIZATION_CHANGED_EVENT = "organization.changed" as const

/** Which lifecycle transition produced a `*.changed` event. */
export type RelationshipChangeAction = "created" | "updated" | "deleted"

export interface PersonChangedEvent {
  id: string
  action: RelationshipChangeAction
}

export interface OrganizationChangedEvent {
  id: string
  action: RelationshipChangeAction
}

/**
 * Emit `person.changed` after a person create/update/delete so observers
 * (e.g. a realtime bridge) can refresh CRM views without polling.
 * Fire-and-forget: a missing bus is a no-op and emission never blocks.
 */
export async function emitPersonChanged(
  eventBus: EventBus | undefined,
  payload: PersonChangedEvent,
  source: EventSource = "service",
): Promise<void> {
  if (!eventBus) return
  await eventBus.emit(PERSON_CHANGED_EVENT, payload, { category: "domain", source })
}

/** Emit `organization.changed` after an organization create/update/delete. */
export async function emitOrganizationChanged(
  eventBus: EventBus | undefined,
  payload: OrganizationChangedEvent,
  source: EventSource = "service",
): Promise<void> {
  if (!eventBus) return
  await eventBus.emit(ORGANIZATION_CHANGED_EVENT, payload, { category: "domain", source })
}
