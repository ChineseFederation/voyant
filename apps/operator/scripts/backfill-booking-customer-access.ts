#!/usr/bin/env -S node --experimental-strip-types --experimental-transform-types
import { grantBookingCustomerAccess } from "@voyant-travel/bookings/customer-access"
import type { LegacyBookingAccessEvidence } from "@voyant-travel/bookings/legacy-customer-access-backfill"
import { runLegacyCustomerAccessBackfill } from "@voyant-travel/bookings/legacy-customer-access-backfill"
import { bookingCustomerAccessGrants, bookings } from "@voyant-travel/bookings/schema"
import { bookingSessionCommitsTable, bookingSessionsTable } from "@voyant-travel/catalog/schema"
import { createDbClient } from "@voyant-travel/db"
/**
 * One-shot, evidence-only customer Booking access backfill.
 *
 * Defaults to a dry run. Pass --apply to write grants. No contact, Person,
 * traveler, payment-customer or origin metadata participates in eligibility.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node --import tsx apps/operator/scripts/backfill-booking-customer-access.ts
 *   DATABASE_URL=postgres://... node --import tsx apps/operator/scripts/backfill-booking-customer-access.ts --apply
 */
import {
  customerAuthOrganization,
  customerAuthPersonalBuyerAccount,
} from "@voyant-travel/db/schema/iam"
import { organizations } from "@voyant-travel/relationships/schema"
import { eq, inArray, isNotNull } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

const BATCH_SIZE = 500

function parseArgs(argv: readonly string[]): { dryRun: boolean; help: boolean } {
  let apply = false
  let help = false
  for (const arg of argv) {
    if (arg === "--") continue
    if (arg === "--apply") apply = true
    else if (arg === "--dry-run" || arg === "-n") apply = false
    else if (arg === "--help" || arg === "-h") help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return { dryRun: !apply, help }
}

const HELP = `backfill-booking-customer-access - grant legacy Booking access from exact authenticated Session evidence

Usage:
  DATABASE_URL=postgres://... node --import tsx apps/operator/scripts/backfill-booking-customer-access.ts [options]

Options:
  -n, --dry-run  Report without writing (default)
      --apply    Create evidence-backed grants
  -h, --help     Show this message

This command never authorizes from email, phone, Person, traveler, provider
Customer, Booking origin metadata, or an Organization id without an exact
customer-auth-to-active-CRM mapping.`

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size))
  }
  return result
}

async function loadEvidence(
  db: ReturnType<typeof createDbClient>,
): Promise<LegacyBookingAccessEvidence[]> {
  const sessionEvidence = await db
    .select({
      bookingId: bookingSessionCommitsTable.bookingId,
      sessionId: bookingSessionsTable.id,
      actorKind: bookingSessionsTable.actorKind,
      ownerPrincipalId: bookingSessionsTable.ownerPrincipalId,
      ownerOrganizationId: bookingSessionsTable.ownerOrganizationId,
      ownerBuyerAccountId: bookingSessionsTable.ownerBuyerAccountId,
      ownerBuyerAccountKind: bookingSessionsTable.ownerBuyerAccountKind,
      bookingOrganizationId: bookings.organizationId,
      personalAccountUserId: customerAuthPersonalBuyerAccount.userId,
      personalAccountRevokedAt: customerAuthPersonalBuyerAccount.revokedAt,
    })
    .from(bookingSessionCommitsTable)
    .innerJoin(
      bookingSessionsTable,
      eq(bookingSessionsTable.id, bookingSessionCommitsTable.sessionId),
    )
    .innerJoin(bookings, eq(bookings.id, bookingSessionCommitsTable.bookingId))
    .leftJoin(
      customerAuthPersonalBuyerAccount,
      eq(customerAuthPersonalBuyerAccount.userId, bookingSessionsTable.ownerPrincipalId),
    )
    .where(isNotNull(bookingSessionCommitsTable.bookingId))

  const bookingIds = [
    ...new Set(sessionEvidence.flatMap((row) => (row.bookingId ? [row.bookingId] : []))),
  ]
  const activeGrantIdsByBooking = new Map<string, string[]>()
  const revokedGrantIdsByBooking = new Map<string, string[]>()
  for (const batch of chunks(bookingIds, BATCH_SIZE)) {
    const grants = await db
      .select({
        bookingId: bookingCustomerAccessGrants.bookingId,
        buyerAccountId: bookingCustomerAccessGrants.buyerAccountId,
        revokedAt: bookingCustomerAccessGrants.revokedAt,
      })
      .from(bookingCustomerAccessGrants)
      .where(inArray(bookingCustomerAccessGrants.bookingId, batch))
    for (const grant of grants) {
      const grantsByBooking = grant.revokedAt ? revokedGrantIdsByBooking : activeGrantIdsByBooking
      const accountIds = grantsByBooking.get(grant.bookingId)
      if (accountIds) accountIds.push(grant.buyerAccountId)
      else grantsByBooking.set(grant.bookingId, [grant.buyerAccountId])
    }
  }

  const authOrganizationIds = [
    ...new Set(
      sessionEvidence.flatMap((row) => {
        const fromBuyerAccount =
          row.ownerBuyerAccountKind === "business" &&
          row.ownerBuyerAccountId?.startsWith("business:")
            ? row.ownerBuyerAccountId.slice("business:".length)
            : null
        const id = row.ownerOrganizationId?.trim() || fromBuyerAccount
        return id ? [id] : []
      }),
    ),
  ]
  const businessMappingByAuthOrganization = new Map<
    string,
    { relationshipOrganizationId: string | null; active: boolean }
  >()
  for (const batch of chunks(authOrganizationIds, BATCH_SIZE)) {
    const mappings = await db
      .select({
        authOrganizationId: customerAuthOrganization.id,
        relationshipOrganizationId: customerAuthOrganization.relationshipOrganizationId,
        relationshipOrganizationStatus: organizations.status,
        relationshipOrganizationArchivedAt: organizations.archivedAt,
      })
      .from(customerAuthOrganization)
      .leftJoin(
        organizations,
        eq(organizations.id, customerAuthOrganization.relationshipOrganizationId),
      )
      .where(inArray(customerAuthOrganization.id, batch))
    for (const mapping of mappings) {
      businessMappingByAuthOrganization.set(mapping.authOrganizationId, {
        relationshipOrganizationId: mapping.relationshipOrganizationId,
        active:
          mapping.relationshipOrganizationStatus === "active" &&
          mapping.relationshipOrganizationArchivedAt === null,
      })
    }
  }

  return sessionEvidence.flatMap((row) => {
    if (!row.bookingId) return []
    const buyerAuthOrganizationId =
      row.ownerBuyerAccountKind === "business" && row.ownerBuyerAccountId?.startsWith("business:")
        ? row.ownerBuyerAccountId.slice("business:".length)
        : null
    const authOrganizationId = row.ownerOrganizationId?.trim() || buyerAuthOrganizationId
    const businessMapping = authOrganizationId
      ? businessMappingByAuthOrganization.get(authOrganizationId)
      : undefined
    return [
      {
        bookingId: row.bookingId,
        sessionId: row.sessionId,
        actorKind: row.actorKind,
        ownerPrincipalId: row.ownerPrincipalId,
        ownerOrganizationId: row.ownerOrganizationId,
        ownerBuyerAccountId: row.ownerBuyerAccountId,
        ownerBuyerAccountKind: row.ownerBuyerAccountKind,
        bookingOrganizationId: row.bookingOrganizationId,
        personalAccountActive:
          row.personalAccountUserId !== null && row.personalAccountRevokedAt === null,
        mappedAuthOrganizationId: businessMapping ? authOrganizationId : null,
        mappedRelationshipOrganizationId: businessMapping?.relationshipOrganizationId ?? null,
        mappedRelationshipOrganizationActive: businessMapping?.active ?? false,
        activeGrantBuyerAccountIds: activeGrantIdsByBooking.get(row.bookingId) ?? [],
        revokedGrantBuyerAccountIds: revokedGrantIdsByBooking.get(row.bookingId) ?? [],
      } satisfies LegacyBookingAccessEvidence,
    ]
  })
}

async function main(argv: readonly string[]) {
  const { dryRun, help } = parseArgs(argv)
  if (help) {
    process.stdout.write(`${HELP}\n`)
    return 0
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    process.stderr.write("DATABASE_URL is required\n")
    return 1
  }

  const db = createDbClient(url, { adapter: "node" })
  const report = await runLegacyCustomerAccessBackfill(await loadEvidence(db), {
    dryRun,
    grant: (input) =>
      db.transaction((tx) => grantBookingCustomerAccess(tx as PostgresJsDatabase, input)),
  })

  process.stdout.write(`${dryRun ? "Dry-run" : "Applied"} customer Booking access backfill\n`)
  process.stdout.write(`  scanned Bookings:       ${report.scannedBookings}\n`)
  process.stdout.write(`  safe personal:          ${report.safePersonal}\n`)
  process.stdout.write(`  safe business:          ${report.safeBusiness}\n`)
  process.stdout.write(`  granted personal:       ${report.grantedPersonal}\n`)
  process.stdout.write(`  granted business:       ${report.grantedBusiness}\n`)
  process.stdout.write(`  already granted:        ${report.alreadyGranted}\n`)
  process.stdout.write(`  ambiguous:              ${report.ambiguous}\n`)
  process.stdout.write(`  missing exact evidence: ${report.missingEvidence}\n`)
  process.stdout.write(`  inconsistent evidence:  ${report.inconsistent}\n`)
  return 0
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`)
    process.exit(1)
  })
