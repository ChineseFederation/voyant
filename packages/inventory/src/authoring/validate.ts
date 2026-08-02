import type { AuthoringIssue } from "./errors.js"
import type { ProductGraphSpec } from "./spec.js"

/**
 * Booking-mechanic shape validation. Runs before the builder (compose path) so a
 * structurally wrong spec is rejected with descriptive, agent-recoverable issues
 * instead of producing a malformed-but-bookable product.
 *
 * Keyed on `bookingMode` — the **booking mechanic**, not a merchandising label.
 * These checks are deliberately independent of the Product family, subtype, and
 * duration: family (`productTypeId`), subtype (`productSubtypeCode`), and the
 * resolved duration are orthogonal classification, and this validator never
 * equates a booking mode with a family. In particular it does NOT treat
 * `date`/`date_time` as "excursion", `itinerary` as "multi-day Tour", or infer a
 * family from duration — a 60-minute `date_time` product with no itinerary days
 * is a perfectly valid Tour (or anything else). `supplyModel` stays derived from
 * `bookingMode` (see `deriveProductSupplyModel`, ADR-0010) and its scheduled/
 * dynamic rules are enforced at the publish and availability paths, not here.
 *
 * What the checks assert is purely mechanical consistency of the booking shape:
 *   - a single-slot mode (`date`/`date_time`) carries at most one itinerary day
 *     and prices per person/seat, not per room;
 *   - the `itinerary` mode actually has an itinerary (≥ 2 days);
 *   - a `transfer` is point-to-point with an endpoint price rule.
 * Other modes (`stay`, `open`, `other`) pass through leniently in v1.
 */
export function validateProductGraph(spec: ProductGraphSpec): AuthoringIssue[] {
  const issues: AuthoringIssue[] = []
  const mode = spec.product.bookingMode
  const totalDays = spec.itineraries.reduce((n, i) => n + i.days.length, 0)
  const allUnits = spec.options.flatMap((o) => o.units)

  // Every bookable product needs at least one option with a unit.
  if (spec.options.length === 0) {
    issues.push({
      code: "no_options",
      field: "options",
      message: "Product has no options, so it cannot be booked.",
      fix: "Add at least one option with at least one unit.",
    })
  } else if (allUnits.length === 0) {
    issues.push({
      code: "no_units",
      field: "options[].units",
      message: "No option has any units, so there is nothing to price or book.",
      fix: "Add at least one unit (e.g. an 'Adult' person unit) to an option.",
    })
  }

  if (mode === "date" || mode === "date_time") {
    if (totalDays > 1) {
      issues.push({
        code: "single_slot_mode_multi_day_itinerary",
        field: "itineraries",
        message: `A '${mode}' product books a single slot, but the spec has ${totalDays} itinerary days.`,
        fix: "Use bookingMode 'itinerary' for a day-by-day product, or reduce the itinerary to a single day. This is about the booking mechanic, not the Product family — a short single-slot product can still be any family.",
      })
    }
    const roomUnit = allUnits.find((u) => u.unitType === "room")
    if (roomUnit) {
      issues.push({
        code: "single_slot_mode_room_unit",
        field: "options[].units[].unitType",
        message: `A '${mode}' product prices per person/seat, but unit '${roomUnit.name}' has unitType 'room'.`,
        fix: "Set the unit's unitType to 'person', or switch bookingMode to 'stay'/'itinerary' for room-based products.",
      })
    }
  }

  if (mode === "itinerary" && totalDays < 2) {
    issues.push({
      code: "itinerary_mode_needs_days",
      field: "itineraries",
      message: `The 'itinerary' booking mode books a day-by-day plan and needs at least 2 itinerary days; found ${totalDays}.`,
      fix: "Add itinerary days, or use bookingMode 'date'/'date_time' for a single-slot product. Duration and Product family are set separately — you don't need an itinerary to author a Tour.",
    })
  }

  if (mode === "transfer") {
    if (totalDays > 0) {
      issues.push({
        code: "transfer_no_days",
        field: "itineraries",
        message: `Transfers are point-to-point and take no itinerary days; found ${totalDays}.`,
        fix: "Remove the itinerary days; model the journey via pickup/dropoff pricing instead.",
      })
    }
    const badUnit = allUnits.find((u) => u.unitType !== "vehicle" && u.unitType !== "person")
    if (badUnit) {
      issues.push({
        code: "transfer_unit_type",
        field: "options[].units[].unitType",
        message: `Transfer unit '${badUnit.name}' has unitType '${badUnit.unitType}'; transfers sell per vehicle or per seat.`,
        fix: "Set the unit's unitType to 'vehicle' or 'person'.",
      })
    }
    const hasActiveEndpointRule = spec.options.some((option) =>
      option.priceRules.some(
        (rule) =>
          rule.active &&
          (rule.pickupPriceRules.some((pickupRule) => pickupRule.active) ||
            rule.dropoffPriceRules.some((dropoffRule) => dropoffRule.active)),
      ),
    )
    if (!hasActiveEndpointRule) {
      issues.push({
        code: "transfer_needs_pickup_or_dropoff",
        field: "options[].priceRules[].pickupPriceRules",
        message: "Transfer products require at least one active pickup or dropoff price rule.",
        fix: "Add an active pickupPriceRules[] or dropoffPriceRules[] entry under an active option price rule.",
      })
    }
  }

  return issues
}
