import { ANONYMOUS_STOREFRONT_USER_ID } from "@voyant-travel/core"
import { describe, expect, it, vi } from "vitest"

import {
  type LegacyBookingAccessEvidence,
  type LegacyCustomerAccessBackfillGrant,
  runLegacyCustomerAccessBackfill,
} from "../../src/legacy-customer-access-backfill.js"

function createdGrant(input: {
  bookingId: string
  buyerAccountId: string
  buyerAccountKind: "personal" | "business"
}) {
  const now = new Date("2026-08-20T00:00:00.000Z")
  return {
    status: "created" as const,
    grant: {
      id: "bkag_01",
      bookingId: input.bookingId,
      buyerAccountId: input.buyerAccountId,
      buyerAccountKind: input.buyerAccountKind,
      role: "owner" as const,
      source: "legacy_session_backfill" as const,
      proofRef: "booking-session:bses_01",
      grantedByPrincipalId: null,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      revokedByPrincipalId: null,
      revocationReason: null,
    },
  }
}

function evidence(
  overrides: Partial<LegacyBookingAccessEvidence> = {},
): LegacyBookingAccessEvidence {
  return {
    bookingId: "book_01",
    sessionId: "bses_01",
    actorKind: "customer",
    ownerPrincipalId: "customer_user_01",
    ownerOrganizationId: null,
    ownerBuyerAccountId: null,
    ownerBuyerAccountKind: null,
    bookingOrganizationId: null,
    personalAccountActive: true,
    mappedAuthOrganizationId: null,
    mappedRelationshipOrganizationId: null,
    mappedRelationshipOrganizationActive: false,
    activeGrantBuyerAccountIds: [],
    revokedGrantBuyerAccountIds: [],
    ...overrides,
  }
}

describe("legacy Booking customer-access backfill", () => {
  it("dry-runs an exact personal account without writing a grant", async () => {
    const grant = vi.fn()

    const report = await runLegacyCustomerAccessBackfill([evidence()], {
      dryRun: true,
      grant,
    })

    expect(report).toMatchObject({
      dryRun: true,
      scannedBookings: 1,
      safePersonal: 1,
      safeBusiness: 0,
      grantedPersonal: 0,
      grantedBusiness: 0,
      alreadyGranted: 0,
      ambiguous: 0,
      missingEvidence: 0,
      inconsistent: 0,
    })
    expect(report.entries).toEqual([
      {
        bookingId: "book_01",
        disposition: "safe_personal",
        evidenceRef: "booking-session:bses_01",
      },
    ])
    expect(grant).not.toHaveBeenCalled()
  })

  it("grants a business account only when auth mapping equals Booking billing Organization", async () => {
    const grant = vi.fn(async (input: LegacyCustomerAccessBackfillGrant) =>
      createdGrant({
        bookingId: input.bookingId,
        buyerAccountId: input.buyerAccount.id,
        buyerAccountKind: input.buyerAccount.kind,
      }),
    )

    const report = await runLegacyCustomerAccessBackfill(
      [
        evidence({
          ownerOrganizationId: "auth_org_01",
          ownerBuyerAccountId: "business:auth_org_01",
          ownerBuyerAccountKind: "business",
          bookingOrganizationId: "org_01",
          mappedAuthOrganizationId: "auth_org_01",
          mappedRelationshipOrganizationId: "org_01",
          mappedRelationshipOrganizationActive: true,
          personalAccountActive: false,
        }),
      ],
      { grant },
    )

    expect(report).toMatchObject({
      scannedBookings: 1,
      grantedPersonal: 0,
      grantedBusiness: 1,
      ambiguous: 0,
      missingEvidence: 0,
      inconsistent: 0,
    })
    expect(grant).toHaveBeenCalledWith({
      bookingId: "book_01",
      buyerAccount: { id: "business:auth_org_01", kind: "business" },
      role: "owner",
      source: "legacy_session_backfill",
      proofRef: "booking-session:bses_01",
      grantedByPrincipalId: null,
      idempotencyKey: "legacy-session-backfill:bses_01",
    })
  })

  it("leaves contact-adjacent legacy rows ungranted when account evidence is missing", async () => {
    const grant = vi.fn()
    const report = await runLegacyCustomerAccessBackfill(
      [
        evidence({ personalAccountActive: false }),
        evidence({
          bookingId: "book_02",
          sessionId: "bses_02",
          actorKind: "anonymous",
          ownerPrincipalId: ANONYMOUS_STOREFRONT_USER_ID,
        }),
        evidence({
          bookingId: "book_03",
          sessionId: "bses_03",
          ownerOrganizationId: "auth_org_missing_mapping",
          bookingOrganizationId: "org_03",
          personalAccountActive: false,
        }),
      ],
      { dryRun: true, grant },
    )

    expect(report).toMatchObject({
      scannedBookings: 3,
      safePersonal: 0,
      safeBusiness: 0,
      ambiguous: 0,
      missingEvidence: 3,
      inconsistent: 0,
    })
    expect(grant).not.toHaveBeenCalled()
  })

  it("rejects inconsistent business evidence rather than falling back to personal identity", async () => {
    const grant = vi.fn()
    const report = await runLegacyCustomerAccessBackfill(
      [
        evidence({
          ownerOrganizationId: "auth_org_01",
          bookingOrganizationId: "org_booking",
          mappedAuthOrganizationId: "auth_org_01",
          mappedRelationshipOrganizationId: "org_other",
          mappedRelationshipOrganizationActive: true,
        }),
      ],
      { dryRun: true, grant },
    )

    expect(report).toMatchObject({
      safePersonal: 0,
      safeBusiness: 0,
      missingEvidence: 0,
      inconsistent: 1,
    })
    expect(report.entries).toEqual([
      {
        bookingId: "book_01",
        disposition: "inconsistent",
        reason: "business_organization_evidence_disagrees",
      },
    ])
  })

  it("reports conflicting authenticated Session accounts as ambiguous", async () => {
    const grant = vi.fn()
    const report = await runLegacyCustomerAccessBackfill(
      [
        evidence(),
        evidence({
          sessionId: "bses_02",
          ownerPrincipalId: "customer_user_02",
          ownerBuyerAccountId: "personal:customer_user_02",
          ownerBuyerAccountKind: "personal",
        }),
      ],
      { dryRun: true, grant },
    )

    expect(report).toMatchObject({ ambiguous: 1, safePersonal: 0, safeBusiness: 0 })
    expect(grant).not.toHaveBeenCalled()
  })

  it("is idempotent when the exact active grant already exists", async () => {
    const grant = vi.fn()
    const report = await runLegacyCustomerAccessBackfill(
      [evidence({ activeGrantBuyerAccountIds: ["personal:customer_user_01"] })],
      { grant },
    )

    expect(report).toMatchObject({ alreadyGranted: 1, grantedPersonal: 0 })
    expect(grant).not.toHaveBeenCalled()
  })

  it("never reactivates an explicitly revoked grant", async () => {
    const grant = vi.fn()
    const report = await runLegacyCustomerAccessBackfill(
      [evidence({ revokedGrantBuyerAccountIds: ["personal:customer_user_01"] })],
      { grant },
    )

    expect(report).toMatchObject({ inconsistent: 1, grantedPersonal: 0 })
    expect(report.entries).toEqual([
      {
        bookingId: "book_01",
        disposition: "inconsistent",
        reason: "exact_customer_access_grant_was_revoked",
      },
    ])
    expect(grant).not.toHaveBeenCalled()
  })
})
