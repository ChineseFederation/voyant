import { booleanQueryParam } from "@voyant-travel/schema-kit/query-params"
import { typeIdSchema } from "@voyant-travel/schema-kit/typeid"
import { z } from "zod"

export { booleanQueryParam, typeIdSchema, z }

export const productStatusSchema = z.enum(["draft", "active", "archived"])
export const productOptionStatusSchema = z.enum(["draft", "active", "archived"])
export const optionUnitTypeSchema = z.enum([
  "person",
  "group",
  "room",
  "vehicle",
  "service",
  "other",
])
export const productBookingModeSchema = z.enum([
  "date",
  "date_time",
  "open",
  "stay",
  "transfer",
  "itinerary",
  "other",
])
export const productCapacityModeSchema = z.enum(["free_sale", "limited", "on_request"])
export const productVisibilitySchema = z.enum(["public", "private", "hidden"])
export const productActivationModeSchema = z.enum(["manual", "scheduled", "channel_controlled"])
export const productTicketFulfillmentSchema = z.enum([
  "none",
  "per_booking",
  "per_participant",
  "per_item",
])
export const productDeliveryFormatSchema = z.enum([
  "service_voucher",
  "ticket",
  "pdf",
  "qr_code",
  "barcode",
  "email",
  "mobile",
  "none",
])
export const productCapabilitySchema = z.enum([
  "instant_confirmation",
  "on_request",
  "pickup_available",
  "dropoff_available",
  "guided",
  "private",
  "shared",
  "digital_ticket",
  "service_voucher_required",
  "external_inventory",
  "multi_day",
  "accommodation",
  "transport",
])
export const productFeatureTypeSchema = z.enum([
  "inclusion",
  "exclusion",
  "highlight",
  "important_information",
  "other",
])
export const productLocationTypeSchema = z.enum([
  "start",
  "end",
  "meeting_point",
  "pickup",
  "dropoff",
  "point_of_interest",
  "other",
])
export const destinationTypeSchema = z.enum([
  "destination",
  "region",
  "country",
  "city",
  "port",
  "river",
  "sea",
  "ocean",
  "canal",
  "lake",
])
export const productMediaTypeSchema = z.enum(["image", "video", "document"])
export const languageTagSchema = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
export const serviceTypeSchema = z.enum([
  "accommodation",
  "transfer",
  "experience",
  "guide",
  "meal",
  "other",
])

/**
 * Whether a day service is part of the sold package or a chargeable extra.
 * A costing row carries no operational role; the multi-day tracer needs one so
 * a materialized departure line knows whether the operator must deliver it
 * (`included`) or only when a traveller elects it (`optional`). See voyant#4035.
 */
export const dayServiceInclusionRoleSchema = z.enum(["included", "optional"])

/**
 * Which travellers a day service applies to. `all` is the default; `adults` /
 * `children` narrow a service (e.g. a child-only activity) so the run sheet can
 * scope who it is delivered for. Deliberately coarse for the spine (voyant#4035).
 */
export const dayServiceTravelerScopeSchema = z.enum(["all", "adults", "children"])

/** A wall-clock local time of day, `HH:mm` (24h). Timezone comes from the slot. */
export const localTimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Local time must be HH:mm (24h)")
