/**
 * Product publish readiness — the single evaluator shared by the admin API,
 * the Tool transport, and the operator Product Overview panel.
 *
 * Readiness is a *derived* result, never independently editable state. It is
 * evaluated from facts the caller has already loaded (see
 * `service-readiness.ts` for the database loader) so the rules themselves stay
 * pure, cheap to unit-test, and identical across every transport.
 *
 * Two severities:
 *
 *   - `blocking` — publication is refused. The admin API answers 422
 *     `product_not_ready_to_publish` with these issues.
 *   - `warning` — publication succeeds. The product stays discoverable and the
 *     operator gets an actionable prompt instead of a silent gap. Per the
 *     parent RFC (#4027) an unresolved duration or missing family must never
 *     make a product disappear from a view; it must surface a warning.
 *
 * Every issue carries a stable `code` plus the `field` it belongs to so the UI
 * can translate it and deep-link to the authoring task that fixes it. The
 * English `message`/`fix` strings remain on the wire as a fallback for API and
 * Tool consumers that have no message catalogue.
 *
 * Checks are gated on the product's *behaviour* (booking mode, capacity mode,
 * resolved duration, composition), never on its merchandising family. A
 * 60-minute Boat Tour and a seven-day coach Tour share this evaluator and are
 * asked for different things because their axes differ, not because one is
 * labelled a Tour.
 */

import { resolveProductDuration } from "./classification.js"

export type ProductReadinessSeverity = "blocking" | "warning"

/**
 * Stable readiness issue codes. Never rename one — the operator UI, the Tool
 * transport, and stored action-ledger entries key off these. Add a new code
 * instead.
 */
export type ProductReadinessCode =
  | "no_future_open_departure"
  | "missing_default_option"
  | "default_option_not_active"
  | "no_option_units"
  | "no_price"
  | "missing_itinerary"
  | "empty_itinerary"
  | "non_consecutive_itinerary_days"
  | "unresolved_duration"
  | "missing_family"
  | "missing_capacity_source"
  | "missing_meeting_point"
  | "missing_allocation_template"
  | "missing_default_language"
  | "missing_description"
  | "missing_contract_template"
  | "incomplete_cost_basis"
  | "no_active_channel"

export interface ProductReadinessIssue {
  code: ProductReadinessCode
  severity: ProductReadinessSeverity
  /** Authoring field or collection the operator must fix. */
  field: string
  /** English fallback description of what is wrong. */
  message: string
  /** English fallback description of the remedy. */
  fix: string
}

/**
 * The facts the evaluator needs. Assembled by `service-readiness.ts` from
 * inventory-owned tables plus the availability tables inventory already reads.
 *
 * Fields typed `| null` where `null` means **not evaluated** are documented as
 * such; the evaluator skips those checks rather than inventing a verdict. This
 * keeps the evaluator usable from callers that cannot resolve a fact (for
 * example a deployment with no Distribution module wired).
 */
export interface ProductReadinessInput {
  /**
   * False while evaluating a product that is being *created* and therefore
   * owns no options, units, prices, itinerary or departures yet — those rows
   * are written after the insert. Checks derived from child collections are
   * skipped in that state so creating a product cannot be refused for rows the
   * caller has had no opportunity to author. They apply on every subsequent
   * update, which is where publication is actually gated.
   */
  persisted: boolean
  status: string
  bookingMode: string
  capacityMode: string
  /** Explicit authored duration in minutes, if any. */
  durationMinutes: number | null | undefined
  /** Legacy itinerary-derived day count, if any. */
  itineraryDurationDays: number | null | undefined
  /** True when `products.productTypeId` resolves to a live family. */
  hasFamily: boolean
  description: string | null | undefined
  defaultLanguageTag: string | null | undefined
  contractTemplateId: string | null | undefined
  /** Product-level sell price in minor units, if the product is priced flat. */
  sellAmountCents: number | null | undefined
  /** Product-level default capacity, if authored. */
  pax: number | null | undefined

  /** Default option, or null when the product has none. */
  defaultOption: { id: string; status: string } | null
  /** Number of units on the default option. */
  defaultOptionUnitCount: number
  /** Number of pricing tiers covering this product or its default option's units. */
  pricingTierCount: number

  /** Default itinerary, or null when the product has none. */
  defaultItinerary: { id: string } | null
  /** Ascending day numbers on the default itinerary. */
  itineraryDayNumbers: number[]
  /** Day-service planned costs on the default itinerary, in minor units. */
  dayServiceCostAmountsCents: number[]

  /** Future open availability slots for this product. */
  futureOpenSlotCount: number
  /** True when any future slot carries an explicit capacity. */
  hasSlotCapacity: boolean
  /**
   * True when the product has a meeting configuration or any pickup point, or
   * `null` when Availability could not be resolved. `null` skips the check.
   */
  hasMeetingPoint: boolean | null
  /**
   * True when any option of this product has an allocation-resource template,
   * or `null` when Availability could not be resolved. `null` skips the check.
   */
  hasAllocationTemplate: boolean | null

  /**
   * Count of active channel publications covering this product, or `null` when
   * distribution could not be resolved. `null` skips the channel check.
   */
  activeChannelCount: number | null
}

export interface ProductReadinessResult {
  /** True when nothing blocks publication. Warnings do not affect this. */
  ready: boolean
  /** Issues that refuse publication. */
  blocking: ProductReadinessIssue[]
  /** Issues that permit publication but need operator attention. */
  warnings: ProductReadinessIssue[]
  /** `blocking` followed by `warnings`, for callers that want one list. */
  issues: ProductReadinessIssue[]
}

/**
 * Booking modes whose supply is resolved dynamically at quote time rather than
 * from pre-generated dated slots. They are never asked for a future departure.
 */
const DYNAMIC_BOOKING_MODES = new Set(["open", "stay"])

/** Booking modes that always require a day-by-day plan. */
const ITINERARY_BOOKING_MODES = new Set(["itinerary"])

function isScheduledBookingMode(bookingMode: string) {
  return !DYNAMIC_BOOKING_MODES.has(bookingMode)
}

function isBlank(value: string | null | undefined) {
  return value == null || value.trim().length === 0
}

/**
 * Whether the product is composed as a multi-day plan, and therefore owes an
 * itinerary with consecutive days. Derived from the resolved duration and the
 * booking mode — never from the merchandising family.
 */
function requiresItinerary(input: ProductReadinessInput, durationDays: number | null) {
  if (ITINERARY_BOOKING_MODES.has(input.bookingMode)) return true
  return durationDays != null && durationDays > 1
}

export function evaluateProductReadiness(input: ProductReadinessInput): ProductReadinessResult {
  const issues: ProductReadinessIssue[] = []
  const add = (issue: ProductReadinessIssue) => issues.push(issue)

  const duration = resolveProductDuration({
    durationMinutes: input.durationMinutes,
    itineraryDurationDays: input.itineraryDurationDays,
  })
  const scheduled = isScheduledBookingMode(input.bookingMode)
  const needsItinerary = requiresItinerary(input, duration.days)

  // ---- Supply -------------------------------------------------------------
  if (scheduled && input.futureOpenSlotCount === 0) {
    add({
      code: "no_future_open_departure",
      severity: "blocking",
      field: "availabilitySlots",
      message:
        "Scheduled products need at least one future open departure before they can be published.",
      fix: "Create a future availability slot with status 'open', then publish the product again.",
    })
  }

  // ---- Classification -----------------------------------------------------
  if (!input.hasFamily) {
    add({
      code: "missing_family",
      severity: "warning",
      field: "productTypeId",
      message: "The product has no family, so it cannot appear in family-based views.",
      fix: "Choose a product family such as Tour, Activity, Attraction, Event, or Transportation.",
    })
  }

  if (duration.provenance === "unresolved") {
    add({
      code: "unresolved_duration",
      severity: "warning",
      field: "durationMinutes",
      message: "The product's duration cannot be resolved from its authoring.",
      fix: "Set an explicit duration in minutes.",
    })
  }

  // ---- Content ------------------------------------------------------------
  if (isBlank(input.defaultLanguageTag)) {
    add({
      code: "missing_default_language",
      severity: "warning",
      field: "defaultLanguageTag",
      message: "The product does not declare the language its name and description are written in.",
      fix: "Set the product's default language so translations can fall back correctly.",
    })
  }

  if (isBlank(input.description)) {
    add({
      code: "missing_description",
      severity: "warning",
      field: "description",
      message: "The product has no description.",
      fix: "Write a description travellers will see.",
    })
  }

  // ---- Policies -----------------------------------------------------------
  if (isBlank(input.contractTemplateId)) {
    add({
      code: "missing_contract_template",
      severity: "warning",
      field: "contractTemplateId",
      message:
        "The product has no contract template, so bookings fall back to the operator default.",
      fix: "Choose a contract template if this product needs its own terms.",
    })
  }

  // Everything below reads a child collection. Skip those while the product is
  // not persisted yet; see `ProductReadinessInput.persisted`.
  if (!input.persisted) {
    return partition(issues)
  }

  // ---- Options and units --------------------------------------------------
  if (!input.defaultOption) {
    add({
      code: "missing_default_option",
      severity: "blocking",
      field: "options",
      message: "The product has no default option, so nothing can be sold.",
      fix: "Create an option and mark it as the default.",
    })
  } else {
    if (input.defaultOption.status !== "active") {
      add({
        code: "default_option_not_active",
        severity: "blocking",
        field: "options",
        message: "The default option is not active, so nothing can be sold.",
        fix: "Set the default option's status to 'active'.",
      })
    }
    if (input.defaultOptionUnitCount === 0) {
      add({
        code: "no_option_units",
        severity: "blocking",
        field: "optionUnits",
        message: "The default option has no units, so a traveller cannot choose what to book.",
        fix: "Add at least one unit (for example an adult unit) to the default option.",
      })
    }
  }

  // ---- Pricing ------------------------------------------------------------
  const hasFlatPrice = input.sellAmountCents != null && input.sellAmountCents > 0
  if (!hasFlatPrice && input.pricingTierCount === 0) {
    add({
      code: "no_price",
      severity: "blocking",
      field: "pricing",
      message: "The product has neither a sell price nor any pricing tier.",
      fix: "Set a sell price on the product, or add a pricing tier for its option units.",
    })
  }

  // ---- Composition --------------------------------------------------------
  if (needsItinerary) {
    if (!input.defaultItinerary) {
      add({
        code: "missing_itinerary",
        severity: "blocking",
        field: "itineraries",
        message: "A multi-day product needs a default itinerary describing how it operates.",
        fix: "Create an itinerary for the product and mark it as the default.",
      })
    } else if (input.itineraryDayNumbers.length === 0) {
      add({
        code: "empty_itinerary",
        severity: "blocking",
        field: "itineraryDays",
        message: "The default itinerary has no days.",
        fix: "Add the product's days to its default itinerary.",
      })
    } else if (!isConsecutiveFromOne(input.itineraryDayNumbers)) {
      add({
        code: "non_consecutive_itinerary_days",
        severity: "blocking",
        field: "itineraryDays",
        message: "The default itinerary's day numbers are not consecutive starting at day 1.",
        fix: "Renumber the itinerary days so they run 1, 2, 3 … without gaps or duplicates.",
      })
    }
  }

  // ---- Capacity -----------------------------------------------------------
  if (input.capacityMode === "limited") {
    const hasCapacitySource = (input.pax != null && input.pax > 0) || input.hasSlotCapacity
    if (!hasCapacitySource) {
      add({
        code: "missing_capacity_source",
        severity: "warning",
        field: "capacity",
        message:
          "The product limits capacity but neither the product nor its departures define how many places exist.",
        fix: "Set the product's default capacity, or set a capacity on its departures.",
      })
    }
  }

  // ---- Ground logistics ---------------------------------------------------
  if (scheduled && input.hasMeetingPoint === false) {
    add({
      code: "missing_meeting_point",
      severity: "warning",
      field: "meetingPoint",
      message: "The product has no meeting point and no pickup points.",
      fix: "Configure a meeting point, or add the pickup points travellers should use.",
    })
  }

  if (needsItinerary && input.hasAllocationTemplate === false) {
    add({
      code: "missing_allocation_template",
      severity: "warning",
      field: "allocationTemplates",
      message:
        "A multi-day product usually places travellers in rooms or seats, but no allocation template is configured.",
      fix: "Add a room-mix or vehicle-seat template to the product's options, or configure resources per departure.",
    })
  }

  // ---- Cost basis ---------------------------------------------------------
  if (input.dayServiceCostAmountsCents.some((amount) => amount <= 0)) {
    add({
      code: "incomplete_cost_basis",
      severity: "warning",
      field: "dayServices",
      message: "One or more planned services have no cost, so planned margin will be overstated.",
      fix: "Enter the planned cost for every service on the product's days.",
    })
  }

  // ---- Distribution -------------------------------------------------------
  // `null` means distribution was not resolvable in this deployment; skip
  // rather than assert a verdict we cannot support.
  if (input.activeChannelCount === 0) {
    add({
      code: "no_active_channel",
      severity: "warning",
      field: "channels",
      message: "The product is not published to any active channel, so nobody can buy it yet.",
      fix: "Map the product to an active channel.",
    })
  }

  return partition(issues)
}

/** Split issues by severity, keeping blocking issues first in `issues`. */
function partition(issues: ProductReadinessIssue[]): ProductReadinessResult {
  const blocking = issues.filter((issue) => issue.severity === "blocking")
  const warnings = issues.filter((issue) => issue.severity === "warning")

  return {
    ready: blocking.length === 0,
    blocking,
    warnings,
    issues: [...blocking, ...warnings],
  }
}

/** True when `dayNumbers` is exactly 1..n with no gaps or duplicates. */
function isConsecutiveFromOne(dayNumbers: number[]) {
  const sorted = [...dayNumbers].sort((a, b) => a - b)
  return sorted.every((dayNumber, index) => dayNumber === index + 1)
}
