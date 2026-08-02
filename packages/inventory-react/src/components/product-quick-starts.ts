import type { CreateProductInput } from "../hooks/use-product-mutation.js"

/**
 * A quick start is a **pure, editable field default** for a new product. It
 * never creates a type-specific aggregate — every quick start produces the same
 * generic product draft, just with sensible starting values for its family,
 * subtype, booking mode, capacity, and (optionally) explicit duration. The
 * operator can change any of them afterwards.
 *
 * `familyCode` is resolved to the seeded `product_types` id at create time.
 */
export type ProductQuickStartId =
  | "boatTour"
  | "dayTour"
  | "multiDayTour"
  | "timedActivity"
  | "attractionAdmission"
  | "transfer"

export type ProductFamilyCode = "tour" | "activity" | "attraction" | "event" | "transportation"

export interface ProductQuickStart {
  id: ProductQuickStartId
  familyCode: ProductFamilyCode
  defaults: Pick<
    CreateProductInput,
    "bookingMode" | "capacityMode" | "productSubtypeCode" | "durationMinutes"
  >
}

export const PRODUCT_QUICK_STARTS: readonly ProductQuickStart[] = [
  {
    id: "boatTour",
    familyCode: "tour",
    defaults: {
      bookingMode: "date_time",
      capacityMode: "limited",
      productSubtypeCode: "boat-tour",
      durationMinutes: 60,
    },
  },
  {
    id: "dayTour",
    familyCode: "tour",
    defaults: { bookingMode: "date", capacityMode: "limited", productSubtypeCode: "day-tour" },
  },
  {
    id: "multiDayTour",
    familyCode: "tour",
    defaults: {
      bookingMode: "itinerary",
      capacityMode: "limited",
      productSubtypeCode: "multi-day-tour",
    },
  },
  {
    id: "timedActivity",
    familyCode: "activity",
    defaults: { bookingMode: "date_time", capacityMode: "limited" },
  },
  {
    id: "attractionAdmission",
    familyCode: "attraction",
    defaults: {
      bookingMode: "date_time",
      capacityMode: "free_sale",
      productSubtypeCode: "admission",
    },
  },
  {
    id: "transfer",
    familyCode: "transportation",
    defaults: { bookingMode: "transfer", capacityMode: "limited", productSubtypeCode: "transfer" },
  },
] as const
