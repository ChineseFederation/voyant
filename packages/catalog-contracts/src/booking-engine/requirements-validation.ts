/**
 * Does a selection satisfy the Booking Requirements the server published?
 *
 * `BookingRequirementsV1` is what a booking of a target *requires*;
 * `bookingSelectionPublicV1` is what has been *picked*. Until this module
 * existed the pairing was advisory: nothing checked that the selection a host
 * collected answered the descriptor the server published, so a host that
 * rendered the wrong field set did not error — it collected a plausible-looking
 * set and failed at commit, or committed something incomplete. That is the
 * voyant#4113 class of bug, and it cost one operator nine days.
 *
 * This is the one validator. The Booking Session calls it at quote time (so a
 * host learns what is missing while it can still fix it) and again at commit
 * (server-authoritative — never trust that the client quoted first). Two
 * validators would recreate the exact defect this closes, so it lives in the
 * contracts package where a third-party vertical, the conformance suite, and
 * the engine all reach the same function.
 *
 * It only checks what the requirements DECLARE. A descriptor that asks for
 * nothing rejects nothing; a descriptor that marks a step required is enforced.
 * Every finding is machine-readable — a stable `requirementKey` and an enum
 * `reason`, never prose a client would have to parse.
 */

import { z } from "zod"
import type {
  BookingFieldRequirementV1,
  BookingRequirementsV1,
  ConfigureSubStepV1,
  PaxBandDependencyV1,
  PaxBandSpecV1,
  TravelerFieldRequirementV1,
} from "./requirements-contracts.js"
import { paxBandBaseCode } from "./requirements-defaults.js"

/**
 * Why a declared requirement is not satisfied. An enum rather than a message:
 * the host renders the copy, the server names the fact.
 */
export const unsatisfiedRequirementReasonV1 = z.enum([
  "pax_band_below_min",
  "pax_band_above_max",
  "pax_total_below_min",
  "pax_total_above_max",
  "pax_band_master_required",
  "pax_band_excluded",
  "pax_band_per_master_exceeded",
  "pax_band_sum_exceeded",
  "departure_required",
  "option_units_required",
  "cabin_category_required",
  "cabin_number_required",
  "date_range_required",
  "date_range_too_short",
  "date_range_too_long",
  "occupancy_required",
  "air_arrangement_required",
  "traveler_field_required",
  "booking_field_required",
])
export type UnsatisfiedRequirementReasonV1 = z.infer<typeof unsatisfiedRequirementReasonV1>

/**
 * One declared requirement the selection does not answer.
 *
 * `requirementKey` addresses the requirement inside the descriptor and is
 * stable across derivations of the same product: `paxBands.adult`,
 * `configureSubSteps.departure`, `travelerFields.passport.travelers.1`,
 * `bookingFields.buyerType`. A host maps it back to the control it drew.
 */
export const unsatisfiedRequirementV1 = z.object({
  requirementKey: z.string().min(1),
  reason: unsatisfiedRequirementReasonV1,
})
export type UnsatisfiedRequirementV1 = z.infer<typeof unsatisfiedRequirementV1>

/**
 * Validate a selection against the requirements that were published with it.
 *
 * Pure and side-effect free. `selection` is deliberately `unknown`: the Booking
 * Session stores a normalized record, hosts hold a
 * `BookingSelectionPublicV1`, and neither is worth a parse here — every read
 * below is defensive, and a shape the validator cannot read is treated as
 * absent, which is what it is.
 *
 * Returns every unsatisfied requirement, not the first one: a host that has to
 * round-trip once per missing field is a host that gives up.
 */
export function validateSelectionAgainstRequirements(
  requirements: BookingRequirementsV1,
  selection: unknown,
): UnsatisfiedRequirementV1[] {
  const root = asRecord(selection) ?? {}
  const configure = asRecord(root.configure) ?? {}
  const pax = numberMap(configure.pax)

  return [
    ...paxBandFindings(requirements.paxBands, requirements.paxBandsAllowedTotal, pax),
    ...paxBandDependencyFindings(requirements.paxBandDependencies, pax),
    ...configureSubStepFindings(requirements.configureSubSteps, configure, pax),
    ...travelerFieldFindings(requirements.travelerFields, root.travelers),
    ...bookingFieldFindings(requirements.bookingFields, root),
  ]
}

/**
 * Every requirement key the descriptor declares as required — the checkable
 * surface of a descriptor, independent of any selection.
 *
 * The conformance suite uses it to hold a third-party vertical to the same
 * contract: a descriptor may not mark something required that this validator
 * would never look at, because a requirement nothing checks is exactly the
 * advisory state #4188 removes.
 */
export function requiredRequirementKeysV1(requirements: BookingRequirementsV1): string[] {
  const keys: string[] = []
  for (const band of requirements.paxBands) {
    if (band.minCount > 0) keys.push(`paxBands.${band.code}`)
  }
  if (requirements.paxBandsAllowedTotal.min > 0) keys.push("paxBandsAllowedTotal")
  // Deliberately not `paxBandDependencies`: a dependency is a conditional rule,
  // not something the selection must always answer, so it is checkable only
  // against counts that break it. The conformance suite probes those directly.
  for (const subStep of requirements.configureSubSteps ?? []) {
    if (requiredConfigureSubStep(subStep)) keys.push(`configureSubSteps.${subStep.kind}`)
  }
  for (const field of requirements.travelerFields) {
    if (field.required) keys.push(`travelerFields.${field.key}`)
  }
  for (const field of requirements.bookingFields) {
    if (field.required) keys.push(`bookingFields.${field.key}`)
  }
  return keys
}

// ─────────────────────────────────────────────────────────────────
// Pax bands
// ─────────────────────────────────────────────────────────────────

function paxBandFindings(
  bands: readonly PaxBandSpecV1[],
  allowedTotal: BookingRequirementsV1["paxBandsAllowedTotal"],
  pax: Record<string, number>,
): UnsatisfiedRequirementV1[] {
  const findings: UnsatisfiedRequirementV1[] = []
  for (const band of bands) {
    const count = pax[band.code] ?? 0
    if (count < band.minCount) {
      findings.push({ requirementKey: `paxBands.${band.code}`, reason: "pax_band_below_min" })
    } else if (count > band.maxCount) {
      findings.push({ requirementKey: `paxBands.${band.code}`, reason: "pax_band_above_max" })
    }
  }
  // Total counts every picked band, including a tier-qualified code the
  // descriptor's band list does not spell out — the buyer still brought them.
  const total = Object.values(pax).reduce((sum, count) => sum + count, 0)
  if (total < allowedTotal.min) {
    findings.push({ requirementKey: "paxBandsAllowedTotal", reason: "pax_total_below_min" })
  } else if (total > allowedTotal.max) {
    findings.push({ requirementKey: "paxBandsAllowedTotal", reason: "pax_total_above_max" })
  }
  return findings
}

/**
 * Cross-band occupancy rules. Mirrors the wizard's own evaluation
 * (`evaluatePaxBandDependencies` in `bookings-react`) — a rule only fires when
 * at least one dependent is picked, so an empty booking never violates
 * "Child requires Adult".
 */
function paxBandDependencyFindings(
  dependencies: readonly PaxBandDependencyV1[] | undefined,
  pax: Record<string, number>,
): UnsatisfiedRequirementV1[] {
  const findings: UnsatisfiedRequirementV1[] = []
  for (const dependency of dependencies ?? []) {
    const dependent = pax[dependency.dependentCode] ?? 0
    if (dependent <= 0) continue
    const master = pax[dependency.masterCode] ?? 0
    const requirementKey = dependencyKey(dependency)
    switch (dependency.type) {
      case "requires":
        if (master <= 0) findings.push({ requirementKey, reason: "pax_band_master_required" })
        break
      case "excludes":
        if (master > 0) findings.push({ requirementKey, reason: "pax_band_excluded" })
        break
      case "limits_per_master":
        if (dependency.maxPerMaster != null && dependent > master * dependency.maxPerMaster) {
          findings.push({ requirementKey, reason: "pax_band_per_master_exceeded" })
        }
        break
      case "limits_sum":
        if (dependency.maxDependentSum != null && dependent > dependency.maxDependentSum) {
          findings.push({ requirementKey, reason: "pax_band_sum_exceeded" })
        }
        break
    }
  }
  return findings
}

function dependencyKey(dependency: PaxBandDependencyV1): string {
  return `paxBandDependencies.${dependency.type}.${dependency.dependentCode}.${dependency.masterCode}`
}

// ─────────────────────────────────────────────────────────────────
// Configure sub-steps
// ─────────────────────────────────────────────────────────────────

/**
 * Whether a sub-step demands a selection at all. `product-option` never does —
 * the descriptor carries no `required` flag for it, and a product that sells
 * one default variant must stay bookable without an explicit pick. That
 * asymmetry is the #4113 lesson in miniature: enforce the declaration, not the
 * shape someone assumes the declaration implies.
 */
function requiredConfigureSubStep(subStep: ConfigureSubStepV1): boolean {
  switch (subStep.kind) {
    case "departure":
      return subStep.required
    case "air-arrangement":
      return subStep.required === true
    case "product-option":
      return false
    default:
      return true
  }
}

function configureSubStepFindings(
  subSteps: readonly ConfigureSubStepV1[] | undefined,
  configure: Record<string, unknown>,
  pax: Record<string, number>,
): UnsatisfiedRequirementV1[] {
  const findings: UnsatisfiedRequirementV1[] = []
  for (const subStep of subSteps ?? []) {
    const requirementKey = `configureSubSteps.${subStep.kind}`
    switch (subStep.kind) {
      case "departure": {
        if (!subStep.required) break
        if (!stringValue(configure.departureSlotId) && !stringValue(configure.departureDate)) {
          findings.push({ requirementKey, reason: "departure_required" })
        }
        break
      }
      case "option-units": {
        const units = asArray(configure.optionSelections) ?? []
        // Explicit type argument: on `unknown[]` the non-generic `reduce`
        // overload wins and the accumulator would infer as `unknown`.
        const picked = units.reduce<number>((sum, entry) => {
          const quantity = asRecord(entry)?.quantity
          return sum + (typeof quantity === "number" && quantity > 0 ? quantity : 0)
        }, 0)
        if (picked <= 0) findings.push({ requirementKey, reason: "option_units_required" })
        break
      }
      case "cabin-category": {
        if (!stringValue(configure.cabinCategoryId)) {
          findings.push({ requirementKey, reason: "cabin_category_required" })
        }
        break
      }
      case "cabin-number": {
        if (!stringValue(configure.cabinNumberId)) {
          findings.push({ requirementKey, reason: "cabin_number_required" })
        }
        break
      }
      case "date-range": {
        findings.push(...dateRangeFindings(subStep, configure, requirementKey))
        break
      }
      case "occupancy": {
        const total = Object.values(pax).reduce((sum, count) => sum + count, 0)
        if (total <= 0) findings.push({ requirementKey, reason: "occupancy_required" })
        break
      }
      case "air-arrangement": {
        if (subStep.required === true && !stringValue(configure.airArrangement)) {
          findings.push({ requirementKey, reason: "air_arrangement_required" })
        }
        break
      }
      case "product-option":
        break
    }
  }
  return findings
}

function dateRangeFindings(
  subStep: Extract<ConfigureSubStepV1, { kind: "date-range" }>,
  configure: Record<string, unknown>,
  requirementKey: string,
): UnsatisfiedRequirementV1[] {
  const range = asRecord(configure.dateRange)
  const checkIn = stringValue(range?.checkIn)
  const checkOut = stringValue(range?.checkOut)
  if (!checkIn || !checkOut) return [{ requirementKey, reason: "date_range_required" }]
  const nights = nightsBetween(checkIn, checkOut)
  if (nights == null) return [{ requirementKey, reason: "date_range_required" }]
  if (nights < subStep.minNights) return [{ requirementKey, reason: "date_range_too_short" }]
  if (nights > subStep.maxNights) return [{ requirementKey, reason: "date_range_too_long" }]
  return []
}

/** Whole nights between two ISO dates, or `null` when either is unreadable. */
function nightsBetween(checkIn: string, checkOut: string): number | null {
  const start = Date.parse(checkIn)
  const end = Date.parse(checkOut)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.round((end - start) / 86_400_000)
}

// ─────────────────────────────────────────────────────────────────
// Field requirements
// ─────────────────────────────────────────────────────────────────

/**
 * A required traveler field must be present on every traveler its
 * `appliesToBands` covers (empty / absent = all bands). Bands are compared on
 * their canonical category so a tier-qualified code (`"child:pricing_…"`)
 * still matches a rule written for `"child"`.
 *
 * Values live either directly on the traveler row (name, email, phone, date of
 * birth) or in its open `documents` map — the same two places the wizard writes
 * them.
 *
 * No travelers means nothing to check: how many travelers a booking needs is a
 * pax-band statement, not a field statement, and it is enforced above.
 */
function travelerFieldFindings(
  fields: readonly TravelerFieldRequirementV1[],
  travelers: unknown,
): UnsatisfiedRequirementV1[] {
  const required = fields.filter((field) => field.required)
  if (required.length === 0) return []
  const rows = asArray(travelers) ?? []
  const findings: UnsatisfiedRequirementV1[] = []
  rows.forEach((row, index) => {
    const traveler = asRecord(row)
    if (!traveler) return
    const band = paxBandBaseCode(stringValue(traveler.band) ?? "")
    const documents = asRecord(traveler.documents) ?? {}
    for (const field of required) {
      if (!fieldAppliesToBand(field, band)) continue
      const value = traveler[field.key] ?? documents[field.key]
      if (isPresent(value)) continue
      findings.push({
        requirementKey: `travelerFields.${field.key}.travelers.${index}`,
        reason: "traveler_field_required",
      })
    }
  })
  return findings
}

function fieldAppliesToBand(field: TravelerFieldRequirementV1, band: string): boolean {
  const bands = field.appliesToBands
  if (!bands || bands.length === 0) return true
  return bands.some((candidate) => paxBandBaseCode(candidate) === band)
}

/**
 * A required booking field must be present in the group it was declared under.
 * `billing` reads the selection's billing block, `company` its company block;
 * keys are dotted paths inside that block (`address.country`).
 *
 * `preferences` has no bucket in `bookingSelectionPublicV1` today and no
 * vertical declares one, so a field declared there resolves against a
 * `preferences` object only if a host sends one. Giving preferences a real home
 * in the selection schema is the fix if one ever appears — inventing a
 * fallback here would put the descriptor and the selection back out of step.
 */
function bookingFieldFindings(
  fields: readonly BookingFieldRequirementV1[],
  root: Record<string, unknown>,
): UnsatisfiedRequirementV1[] {
  const required = fields.filter((field) => field.required)
  if (required.length === 0) return []
  const billing = asRecord(root.billing)
  const findings: UnsatisfiedRequirementV1[] = []
  for (const field of required) {
    const group =
      field.group === "billing"
        ? billing
        : field.group === "company"
          ? asRecord(billing?.company)
          : asRecord(root.preferences)
    if (!isPresent(resolvePath(group, field.key))) {
      findings.push({
        requirementKey: `bookingFields.${field.key}`,
        reason: "booking_field_required",
      })
    }
  }
  return findings
}

function resolvePath(root: Record<string, unknown> | undefined, path: string): unknown {
  let current: unknown = root
  for (const segment of path.split(".")) {
    const record = asRecord(current)
    if (!record) return undefined
    current = record[segment]
  }
  return current
}

// ─────────────────────────────────────────────────────────────────
// Defensive readers
// ─────────────────────────────────────────────────────────────────

function isPresent(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function numberMap(value: unknown): Record<string, number> {
  const record = asRecord(value)
  if (!record) return {}
  const entries: Record<string, number> = {}
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "number" && Number.isFinite(item)) entries[key] = item
  }
  return entries
}

/**
 * Traveler-field keys the Booking Session can actually carry.
 *
 * `normalizeBookingSelection` projects a stored traveler down to this set
 * (`sessions-production.ts`, `normalizeTraveler`), deliberately: the richer
 * fields a wizard collects — `documents`, `dateOfBirth`, `preferredLanguage`,
 * `specialRequests` — are plaintext PII that the v1 posture does not keep on
 * an open Session.
 *
 * That makes them unsatisfiable, not merely unchecked. A vertical marking one
 * of them `required` would publish a descriptor its own commit path can never
 * satisfy, and the buyer would be told to supply something the pipeline drops
 * on the way in — voyant#4113's shape, arriving through the enforcement added
 * to prevent it.
 *
 * So the mismatch is a contract error, surfaced by the conformance suite at
 * development time rather than as a dead-ended quote in production. Widening
 * this set means widening the selection projection first, and deciding where
 * the PII lands.
 */
export const REPRESENTABLE_TRAVELER_FIELD_KEYS_V1: ReadonlySet<string> = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "band",
  "travelerCategory",
  "isPrimary",
])

/** Booking-field groups the public selection has a bucket for. */
export const REPRESENTABLE_BOOKING_FIELD_GROUPS_V1: ReadonlySet<string> = new Set([
  "billing",
  "company",
])

/**
 * Required requirements the Session could never satisfy, whatever the buyer
 * enters. Empty is the only acceptable value; a non-empty result is a defect
 * in the descriptor, not in the selection.
 */
export function unsatisfiableRequiredRequirementsV1(
  requirements: BookingRequirementsV1,
): UnsatisfiedRequirementV1[] {
  const unsatisfiable: UnsatisfiedRequirementV1[] = []
  for (const field of requirements.travelerFields) {
    if (field.required && !REPRESENTABLE_TRAVELER_FIELD_KEYS_V1.has(field.key)) {
      unsatisfiable.push({
        requirementKey: `travelerFields.${field.key}`,
        reason: "traveler_field_required",
      })
    }
  }
  for (const field of requirements.bookingFields) {
    if (field.required && !REPRESENTABLE_BOOKING_FIELD_GROUPS_V1.has(field.group)) {
      unsatisfiable.push({
        requirementKey: `bookingFields.${field.key}`,
        reason: "booking_field_required",
      })
    }
  }
  return unsatisfiable
}
