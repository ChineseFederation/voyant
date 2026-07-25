# Hotel booking schema validation

Status: legacy validation note.

This document predates the accommodation resale boundary. It remains useful as
research for accommodation booking lines, daily rates, rooming, and
multi-segment stays, but it should not be read as approval for a first-party
hotel PMS or hotel-operations module. See
[`accommodation-resale-boundary.md`](./accommodation-resale-boundary.md).

This doc captures the findings from exercising the bookings + accommodation
booking-line schema against a realistic multi-night hotel booking. The original
executable proof lived in the removed legacy hotel-operations package; this doc
now remains as a historical design note for retained accommodation resale
concepts.

Closes #293.

## Use case

A 7-night stay with a mid-stay room change:

- Nights 1-3 in a Deluxe room
- Nights 4-7 in a Suite (a guest celebrating a milestone moves up after a few nights)
- Bed-and-breakfast meal plan throughout
- Self-parking add-on for all 7 nights
- 2 adults + 1 child (child applies only to the Suite half — child capacity is the reason for the upgrade)

## What worked

### Multi-room-type stays decompose cleanly

The schema models a mid-stay room change as **two `bookings.booking_items` rows**, each with its own **stay booking item** extension. The check-out date of one matches the check-in date of the next. That shape remains useful for accommodation resale and package composition even though hotel PMS operations are out of scope.

```
bookings           — 1 row, the parent
booking_items      — 2 rows (Deluxe, Suite) + 1 extras row (Parking)
stay_booking_items — 2 rows (1:1 with the accommodation booking_items)
stay_daily_rates   — 7 rows (3 deluxe + 4 suite)
```

The `uidx_stay_booking_items_booking_item` unique index enforces the 1:1 between `booking_items` and `stay_booking_items`. Multi-room means multi-line.

### Per-night rate variation

`stay_daily_rates.sellAmountCents` per `(stay_booking_item_id, date)` accommodates weekend bumps, single-night promo overrides, and dynamic pricing without restructuring the parent rows. Sum of daily rates rolls cleanly into the parent `booking_items.totalSellAmountCents`.

### Meal plans + occupancy

`stay_booking_items` tracks `mealPlanId`, `adults`, `children`, `infants` per stay segment. The Suite gets `children: 1` while the Deluxe stays at `children: 0` — exactly what we need when occupancy varies between segments.

### Add-ons are first-class

Parking is a plain `bookings.booking_items` row with `itemType: "extra"`, no accommodation extension. The booking total aggregates over all `booking_items` regardless of whether they have a `stay_booking_items` extension. Other add-ons (transfers, spa packages, late checkout) follow the same pattern.

## What's awkward

### `bookings.sellAmountCents` is denormalised, not computed

The parent booking's `sellAmountCents` is a stored column that the caller has to update after creating items. There's no trigger / computed view that derives `Σ(booking_items.totalSellAmountCents)` automatically. Today every flow that mutates items must remember to re-roll the parent total. **Not a schema bug — a service-layer convention** — but worth a service helper.

### The check-in/check-out boundary is a string-equality contract

Saying "Suite check-in matches Deluxe check-out" relies on `'2026-09-13' === '2026-09-13'` at the application layer. The DB doesn't enforce that two stay_booking_items on the same booking form a contiguous range. A pathological caller could insert overlapping or gap-y stays.

**Possible follow-up:** an EXCLUDE constraint using a daterange, or a service-layer invariant + test.

### `booking_items.itemType` is enum-typed but lacks "accommodation" cohort metadata

`itemType: "accommodation"` differentiates a stay row from a `"unit"`/`"transport"`/`"extra"` row, but the cardinality of "this booking has accommodation" lives implicitly in the join with `stay_booking_items`. UIs that want to render "your hotel stays" need to either filter by `itemType === "accommodation"` AND join, or just join (the unique index makes the join cheap).

## What's missing or unproven

### No price-rule resolver for `rate_plan_room_types`

We seeded `stay_daily_rates` rows by hand at known per-night amounts. In a production system the per-night rates should be **resolved from a rate plan + room type + date**, applying any seasonal/dow modifiers. The schema has `room_type_rates` and `rate_plan_inventory_overrides` but no service code yet that, given a rate plan + room type + date range, returns the daily rate cards. **Follow-up:** a `resolveStayDailyRates(ratePlanId, roomTypeId, range)` service method.

### Inventory consumption isn't wired

Hotel holds should decrement room inventory at either the `room_inventory`
(per-day per-room-type capacity) or `room_units` (assigned room) level. Today,
creating a `stay_booking_items` row does not automatically update inventory.
**Follow-up:** add a pre-booking hold path that cannot create a booking row.

### Cancellation policies don't compose for multi-segment stays

Each `stay_booking_items.ratePlanId` references a rate plan that has its own `cancellationPolicyId`. If both segments use the same rate plan that's fine; if they differ (e.g., a flexible Deluxe + non-refundable Suite), the cancellation calculation has to walk per-segment and aggregate. The legal package's cancellation evaluator (`evaluateCancellation`) was designed for one policy per booking. **Follow-up:** confirm whether `evaluateCancellation` can fan out across segments, or if we need a per-segment loop.

### Stay folios are out of scope for first-party starters

`stay_folios` and `stay_folio_lines` exist in the legacy operations schema but aren't part of this validation. They model the on-property tab - incidentals, room-service charges, mini-bar - that get charged at checkout. That is hotel-operations/PMS territory and should not be promoted in first-party starters.

## Verdict

**The schema supports the multi-night-with-room-change use case** without modification. The integration test exercises the full shape and asserts: contiguous date ranges, per-night rate variation, add-ons, mixed occupancy across segments, and shared meal plan.

The follow-up gaps are **service-layer**, not schema-layer:

1. Per-segment cancellation policy fan-out (legal)
2. Atomic inventory consumption at stay-reserve time (accommodations)
3. Rate-card resolver from rate plan + room type + date (accommodations / pricing)
4. Booking-total auto-rollup helper (bookings or finance)

Each of those should be filed as a separate issue. The core data model is fit for purpose.

## Lightly-considered: other product shapes

- **Multi-segment flights with stopover:** the schema doesn't model flights as a first-class extension yet. There's no `flight_booking_items` table. Multi-segment flights would need that addition + per-segment fields (origin, destination, carrier, fare class, etc).
- **Packaged trips (hotel + flight + activity):** decomposes naturally into `booking_items` of different itemTypes — but the cross-segment pricing (a package discount that's < sum of components) doesn't have a representation today. Either it's a synthetic `discount` line or the schema needs a "package" concept.

These are research-grade observations rather than concrete recommendations — they need product input before becoming issues.
