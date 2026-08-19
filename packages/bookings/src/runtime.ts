import type { CustomFieldsRuntime } from "@voyant-travel/core/custom-fields"
import type { BookingsCanonicalInquiryIntakeRuntime } from "./inquiry-intake-runtime-port.js"
import type { BookingRequirementsApiModuleOptions } from "./requirements/index.js"
import type {
  BookingsAccommodationRuntime,
  BookingsFinanceRuntime,
  BookingsInventoryRuntime,
  BookingsRelationshipsRuntime,
  BookingsRuntimeProvider,
} from "./runtime-port.js"
import {
  BOOKING_INQUIRY_CREATED_EVENT,
  type BookingInquiryCreatedEvent,
  bookingInquiriesService,
} from "./service-inquiries.js"

interface BookingsRuntimeRequirements {
  accommodation: BookingsAccommodationRuntime
  customFields: CustomFieldsRuntime
  finance: BookingsFinanceRuntime
  relationships: BookingsRelationshipsRuntime
  inquiryIntake: BookingsCanonicalInquiryIntakeRuntime
}

/** Compose Bookings from its host and statically selected domain providers. */
export function createBookingsRuntime(
  requirements: BookingsRuntimeRequirements,
): BookingsRuntimeProvider {
  const { accommodation, customFields, inquiryIntake, relationships } = requirements

  return {
    options: {
      resolveTravelSnapshot: (db, personId, { kms }) =>
        relationships.loadPersonTravelSnapshot(db, personId, { kms }),
      resolveBillingPerson: async (db, contact, context) =>
        (
          await relationships.upsertPersonFromContact(db, contact, {
            source: context.source,
            sourceRef: context.sourceRef,
          })
        )?.id ?? null,
      resolveTravelerPerson: async (db, contact, context) =>
        (
          await relationships.upsertPersonFromContact(db, contact, {
            source: context.source,
            sourceRef: context.sourceRef,
            requireContactPoint: true,
          })
        )?.id ?? null,
      resolveBillingPersonById: async (db, personId) => {
        const person = (await relationships.getPersonById(db, personId)) as {
          status?: string
          archivedAt?: unknown
        } | null
        return person?.status === "active" && person.archivedAt == null
      },
      resolveBillingOrganizationById: async (db, organizationId) => {
        const organization = (await relationships.getOrganizationById(db, organizationId)) as {
          status?: string
          archivedAt?: unknown
        } | null
        return organization?.status === "active" && organization.archivedAt == null
      },
      customFieldsForWrite: (db) => customFields.resolveRegistryForWrite(db, "booking"),
      bookingInquiryIntake: {
        async submit(db, input, runtime) {
          const result = await inquiryIntake.submit(db, input)
          if (result.status !== "conflict") {
            await runtime?.eventBus?.emit<BookingInquiryCreatedEvent>(
              BOOKING_INQUIRY_CREATED_EVENT,
              {
                inquiryId: result.inquiry.id,
                channelId: result.inquiry.channelId,
                productId: result.inquiry.productId,
                departureId: result.inquiry.departureId,
              },
              {
                category: "domain",
                source: "service",
                eventId: `evt_booking_inquiry_created_${result.inquiry.id}`,
              },
            )
          }
          return result
        },
        async getById(db, id) {
          return (await inquiryIntake.getById(db, id)) ?? bookingInquiriesService.getById(db, id)
        },
        async list(db) {
          const [canonical, legacy] = await Promise.all([
            inquiryIntake.list(db),
            bookingInquiriesService.list(db),
          ])
          const canonicalIds = new Set(canonical.map((row) => row.id))
          return [...canonical, ...legacy.filter((row) => !canonicalIds.has(row.id))].sort(
            (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
          )
        },
      },
      overviewItemEnrichers: { accommodation: accommodation.enrichOverviewItems },
    },
  }
}

/** Compose booking-requirements defaults from Inventory's domain provider. */
export function createBookingRequirementsRuntime(
  inventory: BookingsInventoryRuntime,
): BookingRequirementsApiModuleOptions {
  return {
    publicRoutes: { resolveProductSnapshot: inventory.resolveProductSnapshot },
  }
}
