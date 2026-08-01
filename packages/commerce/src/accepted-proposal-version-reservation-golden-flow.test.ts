import { describe, expect, it } from "vitest"

import {
  type CommercialDecisionInput,
  type CommercialPriceAvailabilityAdapter,
  type CommercialSnapshotRepository,
  createCommercialDecisionEvaluator,
  recordCommercialSnapshot,
} from "./index.js"

type ModuleOwner = "Proposals" | "Trips" | "Commerce" | "Bookings" | "Finance" | "Legal"

type ModuleInterfaceName =
  | "Proposals.acceptProposalVersion"
  | "Trips.prepareReservationPlanForAcceptedProposalVersion"
  | "Commerce.evaluateCommercialDecision"
  | "Commerce.recordCommercialSnapshot"
  | "Bookings.submitReservationPlan"
  | "Finance.startCollection"
  | "Legal.attachPolicyAndTermsTargets"

interface FlowCall {
  interfaceName: ModuleInterfaceName
}

interface DurableOwnerRecord {
  owner: ModuleOwner
  record: string
}

interface ProposalVersion {
  id: string
  status: "draft" | "sent" | "accepted" | "declined" | "superseded"
  tripSnapshotId: string
}

interface ProposalState {
  id: string
  status: "open" | "won"
  acceptedVersionId: string | null
  versions: ProposalVersion[]
}

const acceptedProposalVersionId = "prvr_1793_accepted"
const proposalId = "prps_1793"
const frozenTripSnapshotId = "trsn_1793_frozen"
const reservationPlanId = "trplan_1793"
const bookingId = "book_1793"
const eur = (amountMinor: number) => ({ amountMinor, currency: "EUR" })

const expectedModuleInterfaces: ModuleInterfaceName[] = [
  "Proposals.acceptProposalVersion",
  "Trips.prepareReservationPlanForAcceptedProposalVersion",
  "Commerce.evaluateCommercialDecision",
  "Commerce.recordCommercialSnapshot",
  "Bookings.submitReservationPlan",
  "Finance.startCollection",
  "Legal.attachPolicyAndTermsTargets",
]

const expectedDurableOwnerRecords = [
  "Proposals:proposal_versions.status",
  "Proposals:proposals.acceptedVersionId",
  "Trips:trip_reservation_plans",
  "Commerce:commercial_snapshots",
  "Bookings:booking_origins",
  "Bookings:bookings",
  "Bookings:booking_items",
  "Bookings:booking_travelers",
  "Bookings:booking_allocations",
  "Bookings:booking_fulfillments",
  "Finance:payment_sessions",
  "Legal:policy_acceptances",
  "Legal:contracts",
]

const pricedLineInput: CommercialDecisionInput = {
  item: {
    kind: "catalog-item",
    id: "catalog_item_cruise_1793",
    source: "sourced",
    vertical: "cruise",
    adapterHint: "golden-flow-source",
    sourceRef: {
      providerId: "cruise-provider",
      sourceId: "source_cruise",
      externalRef: "sailing_1793",
    },
  },
  date: "2026-09-18",
  party: {
    pax: 2,
    adults: 2,
  },
  currency: "EUR",
  buyer: {
    actorType: "customer",
    relationshipId: "relationship_b2b_buyer",
  },
  channel: {
    id: "channel_direct",
    kind: "direct",
  },
  market: {
    id: "market_eu",
    code: "EU",
    currency: "EUR",
  },
  requestedAt: "2026-06-13T09:00:00.000Z",
  idempotencyKey: `${acceptedProposalVersionId}:catalog_item_cruise_1793`,
  evaluationMode: "checkout",
}

const sourceAdapter: CommercialPriceAvailabilityAdapter = {
  id: "golden-flow-source",
  kind: "source",
  supports(input) {
    return input.item.adapterHint === "golden-flow-source"
  },
  evaluate(input) {
    return {
      status: "available",
      validUntil: "2026-06-13T09:15:00.000Z",
      pricing: {
        currency: input.currency,
        total: eur(192000),
        components: [
          {
            kind: "base",
            label: "Cabin fare",
            amount: eur(192000),
            ruleId: "fare_rule_1793",
          },
        ],
        priceRuleIds: ["fare_rule_1793"],
      },
      availability: {
        status: "available",
        capacityRemaining: 4,
      },
      sellability: {
        status: "allowed",
        policyIds: ["sellability_policy_b2b"],
      },
      handles: [
        {
          providerId: "cruise-provider",
          sourceId: "source_cruise",
          externalRef: "source_quote_1793",
          handle: "source_quote_handle_1793",
        },
      ],
    }
  },
}

describe("accepted Proposal Version reservation golden flow", () => {
  it("names ownership from accepted Proposal Version through reservation, collection, and legal targets", async () => {
    const flow = await runAcceptedProposalVersionReservationGoldenFlow()

    expect(flow.calls.map((call) => call.interfaceName)).toEqual(expectedModuleInterfaces)
    expect(flow.durableRecords.map(formatDurableRecord)).toEqual(expectedDurableOwnerRecords)

    expect(flow.proposal.acceptedVersionId).toBe(acceptedProposalVersionId)
    expect(flow.proposal.status).toBe("won")
    expect(flow.proposal.versions.filter((version) => version.status === "accepted")).toHaveLength(
      1,
    )
    expect(
      flow.proposal.versions.find((version) => version.id !== acceptedProposalVersionId)?.status,
    ).toBe("declined")

    expect(flow.handoff).toEqual({
      kind: "accepted_proposal_version",
      proposalId,
      proposalVersionId: acceptedProposalVersionId,
      tripSnapshotRef: {
        owner: "Trips",
        id: frozenTripSnapshotId,
      },
    })

    expect(flow.tripsReservedInventoryDirectly).toBe(false)
    expect(flow.reservationPlan).toMatchObject({
      id: reservationPlanId,
      origin: "accepted_proposal_version",
      proposalVersionId: acceptedProposalVersionId,
      tripSnapshotId: frozenTripSnapshotId,
    })
    expect(flow.reservationPlan.inputs).toEqual([
      expect.objectContaining({
        componentId: "trcp_priced_catalog",
        commercialDecisionId: expect.stringMatching(/^commercial_decision_/),
        commercialSnapshotId: "commercial_snapshot_1",
      }),
      expect.objectContaining({
        componentId: "trcp_manual_supplier",
        confirmationWorkflow: "staff_supplier_confirmation",
      }),
    ])

    expect(flow.bookings.supportedReservationOrigins).toEqual([
      "direct_b2c",
      "accepted_proposal_version",
    ])
    expect(flow.bookings.origin).toMatchObject({
      bookingId,
      source: "accepted_proposal_version",
      proposalVersionId: acceptedProposalVersionId,
      tripSnapshotId: frozenTripSnapshotId,
      reservationPlanId,
      commercialSnapshotIds: ["commercial_snapshot_1"],
    })

    expect(flow.financeCollectionTarget).toEqual({
      targetType: "booking",
      targetId: bookingId,
      amountMinor: 192000,
      currency: "EUR",
    })
    expect(flow.legalTargets).toEqual([
      { targetType: "booking", targetId: bookingId, targetPurpose: "terms_acceptance" },
      {
        targetType: "proposal_version",
        targetId: acceptedProposalVersionId,
        targetPurpose: "proposal_contract",
      },
    ])
    assertNoLegacyTransactionLadder(flow)
  })
})

async function runAcceptedProposalVersionReservationGoldenFlow() {
  const calls: FlowCall[] = []
  const durableRecords: DurableOwnerRecord[] = []
  const proposal: ProposalState = {
    id: proposalId,
    status: "open",
    acceptedVersionId: null,
    versions: [
      {
        id: acceptedProposalVersionId,
        status: "sent",
        tripSnapshotId: frozenTripSnapshotId,
      },
      {
        id: "prvr_1793_alternative",
        status: "sent",
        tripSnapshotId: "trsn_1793_alternative",
      },
    ],
  }

  const proposals = {
    acceptProposalVersion(versionId: string) {
      calls.push({ interfaceName: "Proposals.acceptProposalVersion" })
      const accepted = proposal.versions.find((version) => version.id === versionId)
      if (accepted?.status !== "sent") {
        throw new Error("Proposal Version must be sent before acceptance")
      }

      proposal.status = "won"
      proposal.acceptedVersionId = accepted.id
      proposal.versions = proposal.versions.map((version) => ({
        ...version,
        status:
          version.id === accepted.id
            ? "accepted"
            : version.status === "draft"
              ? "superseded"
              : "declined",
      }))
      durableRecords.push(
        {
          owner: "Proposals",
          record: "proposal_versions.status",
        },
        {
          owner: "Proposals",
          record: "proposals.acceptedVersionId",
        },
      )

      return {
        kind: "accepted_proposal_version" as const,
        proposalId: proposal.id,
        proposalVersionId: accepted.id,
        tripSnapshotRef: {
          owner: "Trips" as const,
          id: accepted.tripSnapshotId,
        },
      }
    },
  }

  const evaluator = createCommercialDecisionEvaluator({ adapters: [sourceAdapter] })
  const repository = createSnapshotRepository(durableRecords)

  const trips = {
    reservedInventoryDirectly: false,
    async prepareReservationPlanForAcceptedProposalVersion(
      handoff: ReturnType<typeof proposals.acceptProposalVersion>,
    ) {
      calls.push({ interfaceName: "Trips.prepareReservationPlanForAcceptedProposalVersion" })
      durableRecords.push({
        owner: "Trips",
        record: "trip_reservation_plans",
      })

      calls.push({ interfaceName: "Commerce.evaluateCommercialDecision" })
      const decision = await evaluator.evaluateCommercialDecision(pricedLineInput)

      calls.push({ interfaceName: "Commerce.recordCommercialSnapshot" })
      const snapshot = await recordCommercialSnapshot(
        decision,
        {
          kind: "trip-component",
          id: "trcp_priced_catalog",
          facts: {
            proposalVersionId: handoff.proposalVersionId,
            tripSnapshotId: handoff.tripSnapshotRef.id,
            reservationPlanId,
          },
        },
        repository,
      )

      return {
        id: reservationPlanId,
        origin: "accepted_proposal_version" as const,
        proposalId: handoff.proposalId,
        proposalVersionId: handoff.proposalVersionId,
        tripSnapshotId: handoff.tripSnapshotRef.id,
        inputs: [
          {
            componentId: "trcp_priced_catalog",
            kind: "catalog_backed" as const,
            commercialDecisionId: decision.decisionId,
            commercialSnapshotId: snapshot.snapshotId,
            providerHandles: decision.handles,
          },
          {
            componentId: "trcp_manual_supplier",
            kind: "manual_placeholder" as const,
            quotedAmountMinor: 65000,
            currency: "EUR",
            confirmationWorkflow: "staff_supplier_confirmation" as const,
          },
        ],
      }
    },
  }

  const bookings = {
    supportedReservationOrigins: ["direct_b2c", "accepted_proposal_version"] as const,
    submitReservationPlan(
      plan: Awaited<ReturnType<typeof trips.prepareReservationPlanForAcceptedProposalVersion>>,
    ) {
      calls.push({ interfaceName: "Bookings.submitReservationPlan" })
      const origin = {
        bookingId,
        source: "accepted_proposal_version" as const,
        proposalId: plan.proposalId,
        proposalVersionId: plan.proposalVersionId,
        tripSnapshotId: plan.tripSnapshotId,
        reservationPlanId: plan.id,
        commercialSnapshotIds: plan.inputs.flatMap((input) =>
          "commercialSnapshotId" in input ? [input.commercialSnapshotId] : [],
        ),
        providerSourceRefs: plan.inputs.flatMap((input) =>
          "providerHandles" in input && Array.isArray(input.providerHandles)
            ? input.providerHandles.map((handle) => handle.externalRef ?? handle.handle ?? null)
            : [],
        ),
        legacyTransactionRef: null,
      }

      durableRecords.push(
        { owner: "Bookings", record: "booking_origins" },
        { owner: "Bookings", record: "bookings" },
        { owner: "Bookings", record: "booking_items" },
        { owner: "Bookings", record: "booking_travelers" },
        { owner: "Bookings", record: "booking_allocations" },
        { owner: "Bookings", record: "booking_fulfillments" },
      )

      return {
        bookingId,
        status: "awaiting_payment" as const,
        origin,
      }
    },
  }

  const finance = {
    startCollection(input: { bookingId: string; amountMinor: number; currency: string }) {
      calls.push({ interfaceName: "Finance.startCollection" })
      durableRecords.push({
        owner: "Finance",
        record: "payment_sessions",
      })
      return {
        targetType: "booking" as const,
        targetId: input.bookingId,
        amountMinor: input.amountMinor,
        currency: input.currency,
      }
    },
  }

  const legal = {
    attachPolicyAndTermsTargets(input: { bookingId: string; proposalVersionId: string }) {
      calls.push({ interfaceName: "Legal.attachPolicyAndTermsTargets" })
      durableRecords.push(
        {
          owner: "Legal",
          record: "policy_acceptances",
        },
        {
          owner: "Legal",
          record: "contracts",
        },
      )
      return [
        {
          targetType: "booking" as const,
          targetId: input.bookingId,
          targetPurpose: "terms_acceptance",
        },
        {
          targetType: "proposal_version" as const,
          targetId: input.proposalVersionId,
          targetPurpose: "proposal_contract" as const,
        },
      ]
    },
  }

  const handoff = proposals.acceptProposalVersion(acceptedProposalVersionId)
  const reservationPlan = await trips.prepareReservationPlanForAcceptedProposalVersion(handoff)
  const booking = bookings.submitReservationPlan(reservationPlan)
  const financeCollectionTarget = finance.startCollection({
    bookingId: booking.bookingId,
    amountMinor: 192000,
    currency: "EUR",
  })
  const legalTargets = legal.attachPolicyAndTermsTargets({
    bookingId: booking.bookingId,
    proposalVersionId: acceptedProposalVersionId,
  })

  return {
    calls,
    durableRecords,
    proposal,
    handoff,
    reservationPlan,
    tripsReservedInventoryDirectly: trips.reservedInventoryDirectly,
    bookings: {
      supportedReservationOrigins: bookings.supportedReservationOrigins,
      origin: booking.origin,
    },
    financeCollectionTarget,
    legalTargets,
  }
}

function createSnapshotRepository(
  durableRecords: DurableOwnerRecord[],
): CommercialSnapshotRepository {
  let writeCount = 0
  return {
    async recordCommercialSnapshot(write) {
      writeCount += 1
      durableRecords.push({
        owner: "Commerce",
        record: "commercial_snapshots",
      })
      return {
        snapshotId: `commercial_snapshot_${writeCount}`,
        decisionId: write.decision.decisionId,
        target: write.target,
        idempotencyKey: write.idempotencyKey,
        recordedAt: "2026-06-13T09:01:00.000Z",
      }
    },
  }
}

function formatDurableRecord(record: DurableOwnerRecord) {
  return `${record.owner}:${record.record}`
}

function assertNoLegacyTransactionLadder(value: unknown) {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain("booking_transaction_details")
  expect(serialized).not.toContain("transactions.")
  expect(serialized).not.toContain('"offerId"')
  expect(serialized).not.toContain('"orderId"')
  expect(serialized).not.toContain('"transactionOrderId"')
}
