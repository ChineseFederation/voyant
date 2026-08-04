/**
 * Rendering the requirements the server says a selection does not satisfy.
 *
 * The Booking Session validates a selection against the Booking Requirements it
 * published and rejects a quote or a commit with
 * `selection_incomplete.unsatisfied[]` — a list of `{ requirementKey, reason }`
 * (see `requirements-validation.ts` in `catalog-contracts`). The server knows
 * exactly what is missing. Until this module existed the wizard threw that away
 * and showed one generic sentence, which is the last hop of voyant#4188.
 *
 * Two jobs here, and only these two:
 *
 *  1. Turn `reason` into human copy. A shopper must never read
 *     `pax_band_below_min`. The copy lives in the journey message set, en and
 *     ro, so an unmapped reason is a parity failure rather than a blank line.
 *  2. Turn `requirementKey` into an ANCHOR — which control the message belongs
 *     next to. The key addresses the requirement inside the descriptor the
 *     wizard already rendered, so `paxBands.adult` belongs on the adult
 *     stepper and `travelerFields.passport.travelers.1` belongs on the second
 *     traveler's passport input.
 *
 * What this module deliberately does NOT do is decide whether a requirement is
 * satisfied. The server is authoritative; a second opinion computed here could
 * disagree with it, and that disagreement is exactly the defect #4188 removes.
 * Everything below reads a finding the server already made.
 *
 * The copy carries no numeric bounds (minimum party size, night counts). The
 * control the message is anchored to already displays them — the stepper
 * disables at the band's limits, the check-out label spells out the nights
 * window — and resolving a bound for a band the descriptor does not list would
 * mean either inventing a number or maintaining a second phrasing per reason.
 * Naming the requirement and the direction is what the server adds.
 */

import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import type {
  UnsatisfiedRequirementReasonV1,
  UnsatisfiedRequirementV1,
} from "@voyant-travel/catalog-contracts/booking-engine/requirements-validation"
import { type BookingsUiMessages, formatMessage } from "../../i18n/index.js"
import type { JourneyStep } from "../types.js"

/**
 * Where in the wizard a finding belongs, parsed out of its `requirementKey`.
 *
 * `unaddressed` is not a failure mode to hide: a descriptor may declare a
 * requirement this wizard never drew (a vertical extension, a newer key shape),
 * and the buyer still has to be told about it. Hosts render those at the
 * surface level — see {@link groupUnsatisfiedRequirements}.
 */
export type UnsatisfiedRequirementAnchor =
  | { kind: "paxBand"; bandCode: string }
  | { kind: "paxTotal" }
  | { kind: "paxDependency"; dependentCode: string; masterCode: string }
  | { kind: "configureSubStep"; subStepKind: string }
  | { kind: "travelerField"; fieldKey: string; travelerIndex: number }
  | { kind: "bookingField"; fieldKey: string }
  | { kind: "unaddressed" }

/** A server finding, resolved into copy and an anchor the UI can attach it to. */
export interface DescribedUnsatisfiedRequirement {
  /** The finding exactly as the server sent it. */
  finding: UnsatisfiedRequirementV1
  anchor: UnsatisfiedRequirementAnchor
  /** The journey step that owns the control, or `null` when unaddressed. */
  step: JourneyStep | null
  /** Localized copy. Never blank, never the raw enum. */
  message: string
}

/**
 * Parse a `requirementKey` into the control it addresses.
 *
 * The key shapes are fixed by the contract's docblock:
 * `paxBands.<code>`, `paxBandsAllowedTotal`,
 * `paxBandDependencies.<type>.<dependent>.<master>`,
 * `configureSubSteps.<kind>`, `travelerFields.<key>.travelers.<index>`,
 * `bookingFields.<key>`. A band code or a field key may itself contain dots
 * (`address.country`, `child:pricing_…`), so segments are taken from the ends
 * rather than by splitting the whole key.
 */
export function anchorForRequirementKey(requirementKey: string): UnsatisfiedRequirementAnchor {
  if (requirementKey === "paxBandsAllowedTotal") return { kind: "paxTotal" }

  const paxBand = afterPrefix(requirementKey, "paxBands.")
  if (paxBand) return { kind: "paxBand", bandCode: paxBand }

  const dependency = afterPrefix(requirementKey, "paxBandDependencies.")
  if (dependency) {
    // `<type>.<dependentCode>.<masterCode>` — the type is a fixed enum with no
    // dots, and codes may contain them, so read the type off the front and the
    // master off the back.
    const segments = dependency.split(".")
    if (segments.length >= 3) {
      const masterCode = segments[segments.length - 1] ?? ""
      const dependentCode = segments.slice(1, -1).join(".")
      if (dependentCode && masterCode) return { kind: "paxDependency", dependentCode, masterCode }
    }
    return { kind: "unaddressed" }
  }

  const subStepKind = afterPrefix(requirementKey, "configureSubSteps.")
  if (subStepKind) return { kind: "configureSubStep", subStepKind }

  const travelerField = afterPrefix(requirementKey, "travelerFields.")
  if (travelerField) {
    const match = /^(.*)\.travelers\.(\d+)$/.exec(travelerField)
    const fieldKey = match?.[1]
    const index = match?.[2]
    if (fieldKey && index != null) {
      return { kind: "travelerField", fieldKey, travelerIndex: Number(index) }
    }
    // `unsatisfiableRequiredRequirementsV1` reports a descriptor-level defect
    // as a bare `travelerFields.<key>` with no traveler. It is still a traveler
    // field; it just applies to the whole step.
    return { kind: "travelerField", fieldKey: travelerField, travelerIndex: -1 }
  }

  const bookingField = afterPrefix(requirementKey, "bookingFields.")
  if (bookingField) return { kind: "bookingField", fieldKey: bookingField }

  return { kind: "unaddressed" }
}

/** The journey step that draws the control an anchor points at. */
export function stepForUnsatisfiedAnchor(anchor: UnsatisfiedRequirementAnchor): JourneyStep | null {
  switch (anchor.kind) {
    case "paxBand":
    case "paxTotal":
    case "paxDependency":
    case "travelerField":
      return "travelers"
    case "bookingField":
      return "billing"
    case "configureSubStep":
      // Departure has its own step; occupancy is picked with the party on the
      // travelers step; everything else (options, rooms, cabins, date range,
      // air) is drawn by the options step.
      if (anchor.subStepKind === "departure") return "departure"
      if (anchor.subStepKind === "occupancy") return "travelers"
      return "options"
    case "unaddressed":
      return null
  }
}

/**
 * Localized copy for one finding.
 *
 * `shape` is optional and only ever used to resolve a LABEL — a band's display
 * name, a field's label. A surface without a descriptor (the manual create
 * form) still gets a complete sentence, with the descriptor's own code in place
 * of the label, which is what an operator would look up anyway.
 *
 * A reason with no entry in the message set falls back to the generic sentence.
 * The mapping is total today and a test holds it that way; the fallback exists
 * so a server that ships a new reason ahead of this package degrades to honest
 * prose instead of a blank line or a raw enum.
 */
export function describeUnsatisfiedRequirement(
  finding: UnsatisfiedRequirementV1,
  messages: BookingsUiMessages,
  shape?: BookingRequirementsV1,
): string {
  const copy = messages.bookingJourney.unsatisfied
  const reasons: Partial<Record<UnsatisfiedRequirementReasonV1, string>> = copy.reasons
  const template = reasons[finding.reason]
  if (!template) return copy.fallback
  const anchor = anchorForRequirementKey(finding.requirementKey)
  return formatMessage(template, unsatisfiedPlaceholders(finding, anchor, shape))
}

/** Resolve every finding into copy plus an anchor, in the order the server sent them. */
export function describeUnsatisfiedRequirements(
  unsatisfied: ReadonlyArray<UnsatisfiedRequirementV1> | null | undefined,
  messages: BookingsUiMessages,
  shape?: BookingRequirementsV1,
): DescribedUnsatisfiedRequirement[] {
  return (unsatisfied ?? []).map((finding) => {
    const anchor = anchorForRequirementKey(finding.requirementKey)
    return {
      finding,
      anchor,
      step: stepForUnsatisfiedAnchor(anchor),
      message: describeUnsatisfiedRequirement(finding, messages, shape),
    }
  })
}

/**
 * Split the described findings by owning step, keeping the ones no step draws
 * separate so a host renders them somewhere rather than dropping them.
 */
export function groupUnsatisfiedRequirements(
  described: ReadonlyArray<DescribedUnsatisfiedRequirement>,
): {
  byStep: Map<JourneyStep, DescribedUnsatisfiedRequirement[]>
  unaddressed: DescribedUnsatisfiedRequirement[]
} {
  const byStep = new Map<JourneyStep, DescribedUnsatisfiedRequirement[]>()
  const unaddressed: DescribedUnsatisfiedRequirement[] = []
  for (const entry of described) {
    if (!entry.step) {
      unaddressed.push(entry)
      continue
    }
    const bucket = byStep.get(entry.step)
    if (bucket) bucket.push(entry)
    else byStep.set(entry.step, [entry])
  }
  return { byStep, unaddressed }
}

/**
 * The findings a step owns, minus the ones the step anchors precisely itself.
 *
 * A step renders each finding once: on the control when it drew that control,
 * and in the step's own error list otherwise. `isAnchoredPrecisely` is the
 * step's answer to "did I put this on a control?".
 */
export function stepLevelUnsatisfiedMessages(
  described: ReadonlyArray<DescribedUnsatisfiedRequirement>,
  step: JourneyStep,
  isAnchoredPrecisely: (entry: DescribedUnsatisfiedRequirement) => boolean = () => false,
): string[] {
  return described
    .filter((entry) => entry.step === step && !isAnchoredPrecisely(entry))
    .map((entry) => entry.message)
}

/**
 * Field key → message, for the traveler row at `travelerIndex`.
 *
 * A field key with several findings keeps the first: one input shows one
 * message, and the server reports one reason per field per traveler anyway.
 */
export function travelerFieldMessages(
  described: ReadonlyArray<DescribedUnsatisfiedRequirement>,
  travelerIndex: number,
): Map<string, string> {
  const byField = new Map<string, string>()
  for (const entry of described) {
    if (entry.anchor.kind !== "travelerField") continue
    if (entry.anchor.travelerIndex !== travelerIndex) continue
    if (!byField.has(entry.anchor.fieldKey)) byField.set(entry.anchor.fieldKey, entry.message)
  }
  return byField
}

/** Booking-field key (`buyerType`, `address.country`, …) → message. */
export function bookingFieldMessages(
  described: ReadonlyArray<DescribedUnsatisfiedRequirement>,
): Map<string, string> {
  const byField = new Map<string, string>()
  for (const entry of described) {
    if (entry.anchor.kind !== "bookingField") continue
    if (!byField.has(entry.anchor.fieldKey)) byField.set(entry.anchor.fieldKey, entry.message)
  }
  return byField
}

/** Pax band code → messages, for anchoring under a band's stepper row. */
export function paxBandMessages(
  described: ReadonlyArray<DescribedUnsatisfiedRequirement>,
): Map<string, string[]> {
  const byBand = new Map<string, string[]>()
  for (const entry of described) {
    if (entry.anchor.kind !== "paxBand") continue
    const bucket = byBand.get(entry.anchor.bandCode)
    if (bucket) bucket.push(entry.message)
    else byBand.set(entry.anchor.bandCode, [entry.message])
  }
  return byBand
}

/** Configure sub-step kind (`departure`, `date-range`, …) → messages. */
export function configureSubStepMessages(
  described: ReadonlyArray<DescribedUnsatisfiedRequirement>,
): Map<string, string[]> {
  const byKind = new Map<string, string[]>()
  for (const entry of described) {
    if (entry.anchor.kind !== "configureSubStep") continue
    const bucket = byKind.get(entry.anchor.subStepKind)
    if (bucket) bucket.push(entry.message)
    else byKind.set(entry.anchor.subStepKind, [entry.message])
  }
  return byKind
}

// ─────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────

/**
 * Placeholder values for the reason templates.
 *
 * EVERY placeholder any template uses is supplied on every call, because the
 * formatter throws on a missing argument — and a rejected quote is the worst
 * possible moment to throw. The anchor supplies the good values; the raw
 * `requirementKey` is the last-resort one, which at least names the requirement
 * the server was talking about. The descriptor only ever upgrades a code to a
 * display label.
 */
function unsatisfiedPlaceholders(
  finding: UnsatisfiedRequirementV1,
  anchor: UnsatisfiedRequirementAnchor,
  shape?: BookingRequirementsV1,
): Record<string, string | number> {
  const base: Record<string, string | number> = {
    band: finding.requirementKey,
    dependent: finding.requirementKey,
    master: finding.requirementKey,
    field: finding.requirementKey,
    // 1-based, matching the "Traveler {number}" heading on the row.
    traveler: 1,
  }
  switch (anchor.kind) {
    case "paxBand":
      return { ...base, band: bandLabel(anchor.bandCode, shape) }
    case "paxDependency":
      return {
        ...base,
        dependent: bandLabel(anchor.dependentCode, shape),
        master: bandLabel(anchor.masterCode, shape),
      }
    case "travelerField":
      return {
        ...base,
        field: travelerFieldLabel(anchor.fieldKey, shape),
        // A descriptor-level finding carries no traveler; it reads as the first.
        traveler: Math.max(anchor.travelerIndex, 0) + 1,
      }
    case "bookingField":
      return { ...base, field: bookingFieldLabel(anchor.fieldKey, shape) }
    default:
      return base
  }
}

function bandLabel(code: string, shape?: BookingRequirementsV1): string {
  return shape?.paxBands.find((band) => band.code === code)?.label ?? code
}

function travelerFieldLabel(key: string, shape?: BookingRequirementsV1): string {
  return shape?.travelerFields.find((field) => field.key === key)?.label ?? key
}

function bookingFieldLabel(key: string, shape?: BookingRequirementsV1): string {
  return shape?.bookingFields.find((field) => field.key === key)?.label ?? key
}

function afterPrefix(value: string, prefix: string): string | null {
  return value.startsWith(prefix) && value.length > prefix.length
    ? value.slice(prefix.length)
    : null
}
