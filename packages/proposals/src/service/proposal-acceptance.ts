import {
  type TripSnapshot,
  type TripSnapshotProposalLine,
  tripsService,
} from "@voyant-travel/trips"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { ProposalVersionConflictError, proposalsService } from "./index.js"

export interface AcceptedProposalBookingSessionSeed {
  proposalId: string
  proposalVersionId: string
  tripSnapshotId: string
  tripEnvelopeId: string
  selection?: Record<string, unknown>
}

export interface AcceptedProposalBookingSession {
  id: string
  state: string
  revision: number
  expiresAt: string
}

export type AcceptedProposalBookingSessionSeedResult =
  | { kind: "created"; session: AcceptedProposalBookingSession }
  | { kind: "rejected"; code: string }

export class ProposalAcceptanceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "superseded"
      | "not_acceptable"
      | "snapshot_required"
      | "snapshot_not_found"
      | "booking_session_rejected",
    readonly detail?: string,
  ) {
    super(message)
  }
}

export async function acceptProposalAndPrepareBooking(
  db: PostgresJsDatabase,
  proposalVersionId: string,
  seedBookingSession: (
    db: PostgresJsDatabase,
    input: AcceptedProposalBookingSessionSeed,
  ) => Promise<AcceptedProposalBookingSessionSeedResult>,
) {
  const proposalForLock = await proposalsService.getProposalVersionProposal(db, proposalVersionId)
  if (!proposalForLock) throw new ProposalAcceptanceError("Proposal not found", "not_found")

  return db.transaction(async (tx) => {
    const transactionalDb = tx as PostgresJsDatabase
    await transactionalDb.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`proposal-accept:${proposalForLock.proposal.id}`}, 0))`,
    )
    await proposalsService.expireProposalVersionIfPastValidUntil(transactionalDb, proposalVersionId)
    const proposal = await proposalsService.getProposalVersionProposal(
      transactionalDb,
      proposalVersionId,
    )
    if (!proposal || proposal.proposalVersion.status === "draft") {
      throw new ProposalAcceptanceError("Proposal not found", "not_found")
    }
    if (proposal.proposalVersion.status === "superseded") {
      throw new ProposalAcceptanceError("Proposal has been superseded", "superseded")
    }
    const isAcceptedReplay =
      proposal.proposalVersion.status === "accepted" &&
      proposal.proposal.acceptedVersionId === proposal.proposalVersion.id
    if (proposal.proposalVersion.status !== "sent" && !isAcceptedReplay) {
      throw new ProposalAcceptanceError("Proposal can no longer be accepted", "not_acceptable")
    }
    if (!proposal.proposalVersion.tripSnapshotId) {
      throw new ProposalAcceptanceError(
        "A frozen Trip snapshot is required before Proposal acceptance",
        "snapshot_required",
      )
    }
    const snapshot = await tripsService.getTripSnapshotById(
      transactionalDb,
      proposal.proposalVersion.tripSnapshotId,
    )
    if (!snapshot) {
      throw new ProposalAcceptanceError("Proposal Trip snapshot not found", "snapshot_not_found")
    }
    assertProposalMatchesTripSnapshot(proposal, snapshot)

    const result = await proposalsService.acceptProposalVersion(
      transactionalDb,
      proposalVersionId,
      {},
    )
    if (!result) throw new ProposalAcceptanceError("Proposal not found", "not_found")
    const seeded = await seedBookingSession(transactionalDb, {
      proposalId: result.proposal.id,
      proposalVersionId: result.proposalVersion.id,
      tripSnapshotId: snapshot.id,
      tripEnvelopeId: snapshot.envelopeId,
    })
    if (seeded.kind === "rejected") {
      throw new ProposalAcceptanceError(
        "Proposal acceptance could not seed a Booking Session",
        "booking_session_rejected",
        seeded.code,
      )
    }
    return {
      status: "accepted" as const,
      currency: result.proposalVersion.currency,
      totalAmountCents: result.proposalVersion.totalAmountCents,
      bookingSession: seeded.session,
    }
  })
}

type ProposalVersionProposalReadModel = NonNullable<
  Awaited<ReturnType<typeof proposalsService.getProposalVersionProposal>>
>

function assertProposalMatchesTripSnapshot(
  proposal: ProposalVersionProposalReadModel,
  snapshot: TripSnapshot,
) {
  const expected = tripSnapshotToProposalVersionApply(snapshot)
  const actual = proposal.proposalVersion
  if (
    actual.tripSnapshotId !== snapshot.id ||
    actual.currency !== expected.currency ||
    actual.subtotalAmountCents !== expected.subtotalAmountCents ||
    actual.taxAmountCents !== expected.taxAmountCents ||
    actual.totalAmountCents !== expected.totalAmountCents ||
    proposal.lines.length !== expected.lines.length
  ) {
    throw new ProposalVersionConflictError("Proposal does not match its frozen Trip snapshot")
  }
  for (const [index, expectedLine] of expected.lines.entries()) {
    const actualLine = proposal.lines[index]
    if (
      !actualLine ||
      actualLine.description !== expectedLine.description ||
      actualLine.quantity !== expectedLine.quantity ||
      actualLine.unitPriceAmountCents !== expectedLine.unitPriceAmountCents ||
      actualLine.totalAmountCents !== expectedLine.totalAmountCents ||
      actualLine.currency !== expectedLine.currency
    ) {
      throw new ProposalVersionConflictError("Proposal does not match its frozen Trip snapshot")
    }
  }
}

/** Map a frozen Trip snapshot's proposal into a proposal-version apply payload. */
export function tripSnapshotToProposalVersionApply(snapshot: TripSnapshot) {
  const proposal = snapshot.proposal
  return {
    tripSnapshotId: snapshot.id,
    currency: proposal.currency,
    subtotalAmountCents: proposal.subtotalAmountCents,
    taxAmountCents: proposal.taxAmountCents,
    totalAmountCents: proposal.totalAmountCents,
    lines: proposal.lines.map(tripSnapshotLineToProposalVersionLine),
  }
}

function tripSnapshotLineToProposalVersionLine(line: TripSnapshotProposalLine) {
  return {
    componentId: line.componentId,
    productId: line.entityModule === "products" ? line.entityId : null,
    supplierServiceId: line.entityModule === "supplier_services" ? line.entityId : null,
    description: line.description,
    quantity: 1,
    unitPriceAmountCents: line.subtotalAmountCents,
    totalAmountCents: line.totalAmountCents,
    currency: line.currency,
  }
}
