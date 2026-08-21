import { ANONYMOUS_STOREFRONT_USER_ID } from "@voyant-travel/core"

import type {
  BookingCustomerAccessSource,
  BuyerAccountKind,
  GrantBookingCustomerAccessInput,
  GrantBookingCustomerAccessResult,
} from "./customer-access.js"

export interface LegacyBookingAccessEvidence {
  bookingId: string
  sessionId: string
  actorKind: string
  ownerPrincipalId: string | null
  ownerOrganizationId: string | null
  ownerBuyerAccountId: string | null
  ownerBuyerAccountKind: string | null
  bookingOrganizationId: string | null
  personalAccountActive: boolean
  mappedAuthOrganizationId: string | null
  mappedRelationshipOrganizationId: string | null
  mappedRelationshipOrganizationActive: boolean
  activeGrantBuyerAccountIds: readonly string[]
  revokedGrantBuyerAccountIds: readonly string[]
}

export interface LegacyCustomerAccessBackfillGrant
  extends Omit<GrantBookingCustomerAccessInput, "source" | "role"> {
  source: Extract<BookingCustomerAccessSource, "legacy_session_backfill">
  role: "owner"
}

export type LegacyCustomerAccessBackfillEntry =
  | {
      bookingId: string
      disposition: "safe_personal" | "safe_business"
      evidenceRef: string
    }
  | {
      bookingId: string
      disposition: "granted_personal" | "granted_business" | "already_granted"
      evidenceRef: string
    }
  | {
      bookingId: string
      disposition: "ambiguous" | "missing_evidence" | "inconsistent"
      reason: string
    }

export interface LegacyCustomerAccessBackfillReport {
  dryRun: boolean
  scannedBookings: number
  safePersonal: number
  safeBusiness: number
  grantedPersonal: number
  grantedBusiness: number
  alreadyGranted: number
  ambiguous: number
  missingEvidence: number
  inconsistent: number
  entries: LegacyCustomerAccessBackfillEntry[]
}

export interface LegacyCustomerAccessBackfillOptions {
  dryRun?: boolean
  grant: (input: LegacyCustomerAccessBackfillGrant) => Promise<GrantBookingCustomerAccessResult>
}

interface ExactCandidate {
  bookingId: string
  sessionId: string
  buyerAccountId: string
  buyerAccountKind: BuyerAccountKind
  alreadyGranted: boolean
}

type ClassifiedEvidence =
  | { kind: "candidate"; candidate: ExactCandidate }
  | { kind: "ambiguous" | "missing_evidence" | "inconsistent"; reason: string }

function classifyEvidence(row: LegacyBookingAccessEvidence): ClassifiedEvidence {
  if (row.actorKind !== "customer") {
    return { kind: "missing_evidence", reason: "not_an_authenticated_customer_session" }
  }
  const principalId = row.ownerPrincipalId?.trim() ?? ""
  if (!principalId || principalId === ANONYMOUS_STOREFRONT_USER_ID) {
    return { kind: "missing_evidence", reason: "missing_authenticated_principal" }
  }

  if (Boolean(row.ownerBuyerAccountId) !== Boolean(row.ownerBuyerAccountKind)) {
    return { kind: "inconsistent", reason: "incomplete_session_buyer_account_evidence" }
  }

  if (row.ownerOrganizationId || row.ownerBuyerAccountKind === "business") {
    return classifyBusinessEvidence(row)
  }
  return classifyPersonalEvidence(row, principalId)
}

function classifyPersonalEvidence(
  row: LegacyBookingAccessEvidence,
  principalId: string,
): ClassifiedEvidence {
  const buyerAccountId = `personal:${principalId}`
  if (!row.personalAccountActive) {
    return { kind: "missing_evidence", reason: "missing_active_personal_buyer_account" }
  }
  if (
    (row.ownerBuyerAccountKind && row.ownerBuyerAccountKind !== "personal") ||
    (row.ownerBuyerAccountId && row.ownerBuyerAccountId !== buyerAccountId)
  ) {
    return { kind: "inconsistent", reason: "session_buyer_account_disagrees_with_principal" }
  }
  if (row.revokedGrantBuyerAccountIds.includes(buyerAccountId)) {
    return { kind: "inconsistent", reason: "exact_customer_access_grant_was_revoked" }
  }
  return {
    kind: "candidate",
    candidate: {
      bookingId: row.bookingId,
      sessionId: row.sessionId,
      buyerAccountId,
      buyerAccountKind: "personal",
      alreadyGranted: row.activeGrantBuyerAccountIds.includes(buyerAccountId),
    },
  }
}

function classifyBusinessEvidence(row: LegacyBookingAccessEvidence): ClassifiedEvidence {
  const buyerAccountOrganizationId = row.ownerBuyerAccountId?.startsWith("business:")
    ? row.ownerBuyerAccountId.slice("business:".length)
    : ""
  const authOrganizationId = row.ownerOrganizationId?.trim() || buyerAccountOrganizationId
  if (!authOrganizationId) {
    return { kind: "missing_evidence", reason: "missing_authenticated_organization" }
  }
  if (
    !row.mappedAuthOrganizationId ||
    !row.mappedRelationshipOrganizationId ||
    !row.mappedRelationshipOrganizationActive
  ) {
    return { kind: "missing_evidence", reason: "missing_active_business_account_mapping" }
  }
  if (!row.bookingOrganizationId) {
    return { kind: "missing_evidence", reason: "missing_booking_billing_organization" }
  }
  if (
    row.mappedAuthOrganizationId !== authOrganizationId ||
    row.mappedRelationshipOrganizationId !== row.bookingOrganizationId
  ) {
    return { kind: "inconsistent", reason: "business_organization_evidence_disagrees" }
  }
  const buyerAccountId = `business:${authOrganizationId}`
  if (
    (row.ownerBuyerAccountKind && row.ownerBuyerAccountKind !== "business") ||
    (row.ownerBuyerAccountId && row.ownerBuyerAccountId !== buyerAccountId)
  ) {
    return { kind: "inconsistent", reason: "session_buyer_account_disagrees_with_organization" }
  }
  if (row.revokedGrantBuyerAccountIds.includes(buyerAccountId)) {
    return { kind: "inconsistent", reason: "exact_customer_access_grant_was_revoked" }
  }
  return {
    kind: "candidate",
    candidate: {
      bookingId: row.bookingId,
      sessionId: row.sessionId,
      buyerAccountId,
      buyerAccountKind: "business",
      alreadyGranted: row.activeGrantBuyerAccountIds.includes(buyerAccountId),
    },
  }
}

function groupByBooking(rows: readonly LegacyBookingAccessEvidence[]) {
  const groups = new Map<string, LegacyBookingAccessEvidence[]>()
  for (const row of rows) {
    const group = groups.get(row.bookingId)
    if (group) group.push(row)
    else groups.set(row.bookingId, [row])
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
}

function emptyReport(dryRun: boolean): LegacyCustomerAccessBackfillReport {
  return {
    dryRun,
    scannedBookings: 0,
    safePersonal: 0,
    safeBusiness: 0,
    grantedPersonal: 0,
    grantedBusiness: 0,
    alreadyGranted: 0,
    ambiguous: 0,
    missingEvidence: 0,
    inconsistent: 0,
    entries: [],
  }
}

/**
 * Backfills customer access from authenticated Booking Session evidence only.
 *
 * The deliberately narrow input has no contact, Person, traveler, payment or
 * origin-metadata fields. The caller must supply current account entitlement
 * and exact auth-to-CRM Organization mapping evidence; this function refuses
 * to infer either one.
 */
export async function runLegacyCustomerAccessBackfill(
  rows: readonly LegacyBookingAccessEvidence[],
  options: LegacyCustomerAccessBackfillOptions,
): Promise<LegacyCustomerAccessBackfillReport> {
  const dryRun = options.dryRun ?? false
  const report = emptyReport(dryRun)

  for (const [bookingId, bookingRows] of groupByBooking(rows)) {
    report.scannedBookings++
    const classified = bookingRows.map(classifyEvidence)
    const rejected = classified.find((result) => result.kind === "inconsistent")
    if (rejected?.kind === "inconsistent") {
      report.inconsistent++
      report.entries.push({
        bookingId,
        disposition: "inconsistent",
        reason: rejected.reason,
      })
      continue
    }
    const candidates = classified.flatMap((result) =>
      result.kind === "candidate" ? [result.candidate] : [],
    )
    const candidateAccounts = new Set(candidates.map((candidate) => candidate.buyerAccountId))
    if (
      candidateAccounts.size > 1 ||
      (candidateAccounts.size === 1 && classified.some((result) => result.kind !== "candidate"))
    ) {
      report.ambiguous++
      report.entries.push({
        bookingId,
        disposition: "ambiguous",
        reason: "multiple_authenticated_accounts_committed_the_booking",
      })
      continue
    }

    const candidate = candidates.sort((left, right) =>
      left.sessionId.localeCompare(right.sessionId),
    )[0]
    if (!candidate) {
      const ambiguous = classified.find((result) => result.kind === "ambiguous")
      const rejectedEvidence = classified.find((result) => result.kind !== "candidate")
      const disposition = ambiguous ? "ambiguous" : "missing_evidence"
      const reason =
        (ambiguous?.kind === "ambiguous" ? ambiguous.reason : undefined) ??
        rejectedEvidence?.reason ??
        "missing_session_evidence"
      if (disposition === "ambiguous") report.ambiguous++
      else report.missingEvidence++
      report.entries.push({ bookingId, disposition, reason })
      continue
    }

    const evidenceRef = `booking-session:${candidate.sessionId}`
    if (candidate.alreadyGranted) {
      report.alreadyGranted++
      report.entries.push({ bookingId, disposition: "already_granted", evidenceRef })
      continue
    }
    if (dryRun) {
      if (candidate.buyerAccountKind === "personal") report.safePersonal++
      else report.safeBusiness++
      report.entries.push({
        bookingId,
        disposition: candidate.buyerAccountKind === "personal" ? "safe_personal" : "safe_business",
        evidenceRef,
      })
      continue
    }

    const result = await options.grant({
      bookingId,
      buyerAccount: { id: candidate.buyerAccountId, kind: candidate.buyerAccountKind },
      role: "owner",
      source: "legacy_session_backfill",
      proofRef: evidenceRef,
      grantedByPrincipalId: null,
      idempotencyKey: `legacy-session-backfill:${candidate.sessionId}`,
    })
    if (result.status === "idempotency_conflict" || result.status === "not_found") {
      throw new Error(`Legacy customer-access grant failed for ${bookingId}: ${result.status}`)
    }
    const replayed = result.status === "unchanged" || result.status === "replayed"
    if (replayed) {
      report.alreadyGranted++
      report.entries.push({ bookingId, disposition: "already_granted", evidenceRef })
    } else if (candidate.buyerAccountKind === "personal") {
      report.grantedPersonal++
      report.entries.push({ bookingId, disposition: "granted_personal", evidenceRef })
    } else {
      report.grantedBusiness++
      report.entries.push({ bookingId, disposition: "granted_business", evidenceRef })
    }
  }

  return report
}
