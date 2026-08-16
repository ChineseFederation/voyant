import { bookingsService } from "@voyant-travel/bookings"
import type {
  CommerceAcceptanceDraftInput,
  CommerceLegalRuntime,
} from "@voyant-travel/commerce/runtime-port"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { and, desc, eq, sql } from "drizzle-orm"

import { PAYMENT_CONFIRMATION_MARKER_PREFIX } from "./booking-contract-confirmed.js"
import { contracts } from "./contracts/schema.js"
import { contractsService } from "./contracts/service.js"
import { contractSeriesService } from "./contracts/service-series.js"
import { parseManagedBookingContractReviewWorkflow } from "./managed-booking-contract-workflow.js"

/** Legal-owned contract operations consumed by Commerce checkout. */
export function createCommerceLegalRuntime(
  _primitives: VoyantRuntimeHostPrimitives,
): CommerceLegalRuntime {
  return {
    async getContract(db, contractId) {
      const [contract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1)
      return contract ?? null
    },
    async getBookingContract(db, bookingId) {
      const [contract] = await db
        .select()
        .from(contracts)
        .where(and(eq(contracts.bookingId, bookingId), eq(contracts.scope, "customer")))
        .orderBy(desc(contracts.createdAt), desc(contracts.id))
        .limit(1)
      return contract ?? null
    },
    async recordBookingPaymentConfirmation(db, bookingId, paymentSessionId) {
      await db.transaction(async (tx) => {
        // Serialize the payment checkpoint with booking-confirmed document
        // preparation so neither metadata merge can erase the other.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`legal:booking-confirmed:${bookingId}`}))`,
        )
        const [contract] = await tx
          .select()
          .from(contracts)
          .where(and(eq(contracts.bookingId, bookingId), eq(contracts.scope, "customer")))
          .orderBy(desc(contracts.createdAt), desc(contracts.id))
          .limit(1)
        if (!contract) {
          const marker = `${PAYMENT_CONFIRMATION_MARKER_PREFIX}${JSON.stringify({
            paymentSessionId,
            confirmedAt: new Date().toISOString(),
          })}`
          await bookingsService.setSystemInternalNotes(tx, bookingId, [
            { prefix: PAYMENT_CONFIRMATION_MARKER_PREFIX, note: marker },
          ])
          return
        }
        if (contract.status === "signed" || contract.status === "executed") return
        const metadata =
          contract.metadata &&
          typeof contract.metadata === "object" &&
          !Array.isArray(contract.metadata)
            ? (contract.metadata as Record<string, unknown>)
            : {}
        await tx
          .update(contracts)
          .set({
            metadata: {
              ...metadata,
              paymentConfirmation: {
                paymentSessionId,
                confirmedAt: new Date().toISOString(),
              },
            },
            updatedAt: new Date(),
          })
          .where(eq(contracts.id, contract.id))
      })
    },
    listSignatures: (db, contractId) => contractsService.listSignatures(db, contractId),
    async issueContract(db, contractId, eventBus) {
      const [contract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1)
      if (!contract) return { status: "not_found" }
      const metadata =
        contract.metadata &&
        typeof contract.metadata === "object" &&
        !Array.isArray(contract.metadata)
          ? (contract.metadata as Record<string, unknown>)
          : {}
      if (
        !parseManagedBookingContractReviewWorkflow(metadata) ||
        !metadata.acceptance ||
        !metadata.paymentConfirmation
      ) {
        return { status: "not_ready" }
      }
      if (!contract.seriesId) {
        const series = await contractSeriesService.findDefaultActiveByScope(db, "customer")
        if (!series) return { status: "series_not_found" }
        await db
          .update(contracts)
          .set({ seriesId: series.id, updatedAt: new Date() })
          .where(and(eq(contracts.id, contract.id), eq(contracts.status, "draft")))
      }
      return contractsService.issueContract(
        db,
        contractId,
        { eventBus },
        {
          allowManagedBookingContractWorkflow: true,
        },
      )
    },
    sendContract: (db, contractId, eventBus) =>
      contractsService.sendContract(db, contractId, { eventBus }, undefined, {
        allowManagedBookingContractWorkflow: true,
      }),
    signContract: (db, contractId, input, eventBus) =>
      contractsService.signContract(db, contractId, input as never, { eventBus }),
    persistAcceptanceDraftContract,
  }
}

async function persistAcceptanceDraftContract(
  db: Parameters<CommerceLegalRuntime["persistAcceptanceDraftContract"]>[0],
  { booking, acceptance, requestMeta }: CommerceAcceptanceDraftInput,
): Promise<void> {
  const template = await contractsService.findTemplateBySlug(db, acceptance.templateSlug)
  if (!template?.currentVersionId) {
    console.warn(
      `[catalog-checkout] persistAcceptanceDraftContract: template "${acceptance.templateSlug}" not found or has no current version; skipping.`,
    )
    return
  }

  const acceptanceMetadata = {
    templateId: acceptance.templateId,
    templateSlug: acceptance.templateSlug,
    acceptedAt: acceptance.acceptedAt,
    acceptedMarketing: acceptance.acceptedMarketing,
    clientIp: requestMeta.clientIp ?? "",
    userAgent: requestMeta.userAgent ?? "",
    renderedHtmlLength: acceptance.renderedHtml.length,
  }
  const existing = (
    await contractsService.listContracts(db, { bookingId: booking.id, limit: 1, offset: 0 })
  ).data[0]

  if (existing) {
    const prior = (existing.metadata as Record<string, unknown> | null) ?? {}
    await contractsService.updateContract(db, existing.id, {
      metadata: { ...prior, acceptance: acceptanceMetadata },
    })
    return
  }

  await contractsService.createContract(db, {
    scope: "customer",
    status: "draft",
    title: `${template.name} — ${booking.bookingNumber}`,
    templateVersionId: template.currentVersionId,
    seriesId: null,
    bookingId: booking.id,
    personId: booking.personId,
    organizationId: booking.organizationId,
    language: template.language,
    variables: {},
    metadata: {
      autoGenerated: true,
      trigger: "public-api.checkout-acceptance",
      acceptance: acceptanceMetadata,
    },
  })
}
