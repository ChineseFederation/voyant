// Dynamic packaging: unresolved requirements + ranked candidates (RFC #2082).
//
// A Trip Requirement is an unresolved customer need on an envelope; the catalog
// availability fan-out (#2081) sources it into ranked Trip Candidates; selecting
// one resolves the requirement into a pinned (draft) trip component that the
// existing price/reserve pipeline re-validates before commit.
//
// Invariant-critical logic lives in pure helpers (testable without a db);
// db orchestration stays thin around them — mirroring the
// `assertTripComponentCanBeReserved` vs `reserveTrip` split.

import type { FanOutAvailabilityResult } from "@voyant-travel/catalog"
import type {
  AvailabilityCandidate,
  AvailabilitySearchRequest,
} from "@voyant-travel/catalog-contracts"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, asc, eq, lt } from "drizzle-orm"

import type {
  NewTripCandidate,
  NewTripComponent,
  NewTripRequirement,
  TripCandidate,
  TripComponent,
  TripEnvelope,
  TripRequirement,
} from "./schema.js"
import { tripCandidates, tripComponents, tripEnvelopes, tripRequirements } from "./schema.js"
import { assertTripEnvelopeCanMutateComponents } from "./service-edit-safeguards.js"
import { createComponentEvent } from "./service-internals.js"
import { TripsInvariantError } from "./service-types.js"

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (invariants + mapping) — no db
// ─────────────────────────────────────────────────────────────────────────────

/** A candidate is expired once its TTL has elapsed. */
export function isTripCandidateExpired(
  candidate: Pick<TripCandidate, "expiresAt">,
  asOf: Date,
): boolean {
  return candidate.expiresAt != null && candidate.expiresAt.getTime() <= asOf.getTime()
}

/** Guard a candidate is still selectable; throws otherwise. */
export function assertCandidateSelectable(candidate: TripCandidate, asOf: Date): void {
  if (candidate.status === "expired" || candidate.status === "discarded") {
    throw new TripsInvariantError(
      `Trip candidate ${candidate.id} is ${candidate.status} and cannot be selected`,
    )
  }
  if (isTripCandidateExpired(candidate, asOf)) {
    throw new TripsInvariantError(
      `Trip candidate ${candidate.id} expired at ${candidate.expiresAt?.toISOString()}`,
    )
  }
}

/**
 * Reserve gate: every `required` requirement must be `selected` before a trip
 * can reserve. Pure — the caller supplies the envelope's requirements.
 */
export function assertRequiredRequirementsResolved(requirements: TripRequirement[]): void {
  const unresolved = requirements.filter((r) => r.required && r.status !== "selected")
  if (unresolved.length > 0) {
    throw new TripsInvariantError(
      `Cannot reserve: ${unresolved.length} required requirement(s) unresolved: ${unresolved
        .map((r) => r.id)
        .join(", ")}`,
    )
  }
}

/** Map a normalized `AvailabilityCandidate` into a persisted candidate row. */
export function availabilityCandidateToRow(args: {
  requirementId: string
  envelopeId: string
  candidate: AvailabilityCandidate
  rank: number
}): NewTripCandidate {
  const { candidate } = args
  return {
    requirementId: args.requirementId,
    envelopeId: args.envelopeId,
    rank: args.rank,
    status: "ranked",
    candidateRef: candidate.candidateRef,
    entityModule: candidate.entity_module,
    entityId: candidate.entity_id,
    sourceKind: candidate.source?.kind ?? "sourced",
    sourceConnectionId: candidate.source?.kind === "sourced" ? candidate.source.connectionId : null,
    sourceModule: candidate.source?.kind === "owned" ? candidate.source.module : null,
    selection: candidate.selection,
    priceCurrency: candidate.price.currency,
    priceAmount: candidate.price.amount,
    expiresAt: candidate.expiresAt ?? null,
    providerData: candidate.providerData ?? null,
  }
}

/**
 * Build the draft component a selected candidate pins into. The component is
 * intentionally `draft`/unpriced: `priceTrip` re-resolves the selection
 * (`candidateRef` is not replay-safe) and `reserveTrip` re-validates before any
 * supplier dispatch.
 *
 * `sourceKind` is load-bearing: `isCatalogBackedTripComponent` requires it for
 * the component to be priced via the catalog path (rather than falling through
 * to placeholder pricing → `unavailable`), and the catalog booking engine
 * routes on it — `"owned"` (`OWNED_SOURCE_KIND`) to an owned handler keyed by
 * entityModule, anything else to a sourced adapter keyed by `sourceConnectionId`.
 * The candidate's `sourceKind` is already `"owned"`/`"sourced"`, which aligns.
 */
export function pinnedComponentValuesFromCandidate(
  candidate: TripCandidate,
  sequence: number,
): NewTripComponent {
  return {
    envelopeId: candidate.envelopeId,
    sequence,
    kind: "catalog_booking",
    status: "draft",
    entityModule: candidate.entityModule,
    entityId: candidate.entityId,
    sourceKind: candidate.sourceKind,
    sourceConnectionId: candidate.sourceConnectionId,
    componentCurrency: candidate.priceCurrency,
    metadata: {
      resolvedFromCandidateId: candidate.id,
      resolvedFromRequirementId: candidate.requirementId,
      candidateRef: candidate.candidateRef,
      candidateOrigin:
        candidate.sourceKind === "owned"
          ? { kind: "owned", module: candidate.sourceModule }
          : { kind: "sourced", connectionId: candidate.sourceConnectionId },
      selection: candidate.selection,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs / deps
// ─────────────────────────────────────────────────────────────────────────────

export interface AddRequirementInput {
  envelopeId: string
  vertical: string
  criteria: Record<string, unknown>
  criteriaVersion: string
  sequence?: number
  required?: boolean
  title?: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface SourceRequirementCandidatesInput {
  requirementId: string
  /** Search scope (locale/audience/market/currency), mirrors the catalog request. */
  scope: AvailabilitySearchRequest["scope"]
  deadlineMs?: number
  limit?: number
}

/**
 * The deployment injects the actual fan-out (wired with its adapters + owned
 * handlers), keeping this service deterministic and provider-agnostic.
 */
export interface SourceRequirementCandidatesDeps {
  search: (request: AvailabilitySearchRequest) => Promise<FanOutAvailabilityResult>
}

export interface SelectCandidateInput {
  requirementId: string
  candidateId: string
  asOf?: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// DB orchestration
// ─────────────────────────────────────────────────────────────────────────────

export async function addRequirement(
  db: AnyDrizzleDb,
  input: AddRequirementInput,
): Promise<TripRequirement> {
  const values: NewTripRequirement = {
    envelopeId: input.envelopeId,
    vertical: input.vertical,
    criteria: input.criteria,
    criteriaVersion: input.criteriaVersion,
    sequence: input.sequence ?? 0,
    required: input.required ?? true,
    title: input.title,
    description: input.description,
    metadata: input.metadata ?? {},
  }
  const [requirement] = (await db
    .insert(tripRequirements)
    .values(values)
    .returning()) as TripRequirement[]
  if (!requirement) throw new Error("addRequirement: insert returned no requirement")
  return requirement
}

export async function listEnvelopeRequirements(
  db: AnyDrizzleDb,
  envelopeId: string,
): Promise<TripRequirement[]> {
  return (await db
    .select()
    .from(tripRequirements)
    .where(eq(tripRequirements.envelopeId, envelopeId))
    .orderBy(asc(tripRequirements.sequence))) as TripRequirement[]
}

/** Reserve gate — throws if any required requirement is unresolved. */
export async function assertEnvelopeRequirementsSatisfied(
  db: AnyDrizzleDb,
  envelopeId: string,
): Promise<void> {
  assertRequiredRequirementsResolved(await listEnvelopeRequirements(db, envelopeId))
}

async function loadRequirement(db: AnyDrizzleDb, requirementId: string): Promise<TripRequirement> {
  const [requirement] = (await db
    .select()
    .from(tripRequirements)
    .where(eq(tripRequirements.id, requirementId))
    .limit(1)) as TripRequirement[]
  if (!requirement) throw new TripsInvariantError(`Trip requirement ${requirementId} was not found`)
  return requirement
}

async function loadCandidate(db: AnyDrizzleDb, candidateId: string): Promise<TripCandidate> {
  const [candidate] = (await db
    .select()
    .from(tripCandidates)
    .where(eq(tripCandidates.id, candidateId))
    .limit(1)) as TripCandidate[]
  if (!candidate) throw new TripsInvariantError(`Trip candidate ${candidateId} was not found`)
  return candidate
}

export async function getSelectedCandidateResult(
  db: AnyDrizzleDb,
  requirementId: string,
): Promise<{ requirement: TripRequirement; candidate: TripCandidate; component: TripComponent }> {
  const requirement = await loadRequirement(db, requirementId)
  if (!requirement.selectedCandidateId || !requirement.resolvedComponentId) {
    throw new TripsInvariantError(`Trip requirement ${requirementId} has no selected candidate`)
  }
  const candidate = await loadCandidate(db, requirement.selectedCandidateId)
  const [component] = (await db
    .select()
    .from(tripComponents)
    .where(eq(tripComponents.id, requirement.resolvedComponentId))
    .limit(1)) as TripComponent[]
  if (!component) {
    throw new TripsInvariantError(
      `Trip requirement ${requirementId} resolved component was not found`,
    )
  }
  return { requirement, candidate, component }
}

async function nextComponentSequence(db: AnyDrizzleDb, envelopeId: string): Promise<number> {
  const rows = (await db
    .select()
    .from(tripComponents)
    .where(eq(tripComponents.envelopeId, envelopeId))) as TripComponent[]
  return rows.reduce((max, c) => Math.max(max, c.sequence), -1) + 1
}

/**
 * Resolve a requirement by selecting one of its candidates: enforces
 * selected-uniqueness, pins a draft component, and records the resolution.
 */
export async function selectCandidate(
  db: AnyDrizzleDb,
  input: SelectCandidateInput,
): Promise<{ requirement: TripRequirement; candidate: TripCandidate; component: TripComponent }> {
  const asOf = input.asOf ?? new Date()
  const candidate = await loadCandidate(db, input.candidateId)
  if (candidate.requirementId !== input.requirementId) {
    throw new TripsInvariantError(
      `Trip candidate ${candidate.id} does not belong to requirement ${input.requirementId}`,
    )
  }
  assertCandidateSelectable(candidate, asOf)
  const requirement = await loadRequirement(db, input.requirementId)
  const envelope = await loadEnvelope(db, candidate.envelopeId)
  assertTripEnvelopeCanMutateComponents(envelope)

  // Retire a previously-pinned component if this requirement was already
  // resolved to a different candidate.
  if (requirement.resolvedComponentId) {
    await db
      .update(tripComponents)
      .set({ status: "removed", updatedAt: asOf })
      .where(eq(tripComponents.id, requirement.resolvedComponentId))
  }

  // Selected-uniqueness: demote any currently-selected candidate, promote this one.
  await db
    .update(tripCandidates)
    .set({ status: "ranked", updatedAt: asOf })
    .where(
      and(eq(tripCandidates.requirementId, requirement.id), eq(tripCandidates.status, "selected")),
    )
  await db
    .update(tripCandidates)
    .set({ status: "selected", updatedAt: asOf })
    .where(eq(tripCandidates.id, candidate.id))

  const sequence = await nextComponentSequence(db, candidate.envelopeId)
  const [component] = (await db
    .insert(tripComponents)
    .values(pinnedComponentValuesFromCandidate(candidate, sequence))
    .returning()) as TripComponent[]
  if (!component) throw new Error("selectCandidate: insert returned no component")

  await createComponentEvent(db, {
    envelopeId: component.envelopeId,
    componentId: component.id,
    eventType: "created",
    toStatus: component.status,
    payload: { resolvedFromRequirementId: requirement.id, resolvedFromCandidateId: candidate.id },
  })

  await db
    .update(tripRequirements)
    .set({
      status: "selected",
      selectedCandidateId: candidate.id,
      resolvedComponentId: component.id,
      updatedAt: asOf,
    })
    .where(eq(tripRequirements.id, requirement.id))

  return {
    requirement: {
      ...requirement,
      status: "selected",
      selectedCandidateId: candidate.id,
      resolvedComponentId: component.id,
    },
    candidate: { ...candidate, status: "selected" },
    component,
  }
}

async function loadEnvelope(db: AnyDrizzleDb, envelopeId: string): Promise<TripEnvelope> {
  const [envelope] = (await db
    .select()
    .from(tripEnvelopes)
    .where(eq(tripEnvelopes.id, envelopeId))
    .limit(1)) as TripEnvelope[]
  if (!envelope) throw new TripsInvariantError(`Trip envelope ${envelopeId} was not found`)
  return envelope
}

/**
 * TTL reaper: mark `ranked` candidates whose TTL has elapsed as `expired`.
 * Returns how many were swept. Intended to be driven by a deployment cron.
 */
export async function expireStaleTripCandidates(db: AnyDrizzleDb, asOf: Date): Promise<number> {
  const expired = (await db
    .update(tripCandidates)
    .set({ status: "expired", updatedAt: asOf })
    .where(and(eq(tripCandidates.status, "ranked"), lt(tripCandidates.expiresAt, asOf)))
    .returning()) as TripCandidate[]
  return expired.length
}
