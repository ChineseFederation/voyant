import {
  actionLedgerService,
  buildActionApprovalCommandFingerprint,
  buildActionLedgerMutationEntryInput,
  buildExistingTargetIdempotencyScope,
} from "@voyant-travel/action-ledger"
import { bookingsService, getBookingOriginByBookingId } from "@voyant-travel/bookings"
import type { EventEnvelope } from "@voyant-travel/core"
import { and, desc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type {
  LegalBookingConfirmedEvent,
  LegalBookingConfirmedPayload,
} from "./booking-contract-confirmed-subscriber.js"
import {
  bookingContractCustomerVariables,
  bookingContractPrerequisites,
  bookingContractReviewSnapshot,
  bookingContractTemplateMatchesChannel,
  resolveBookingContractLanguage,
} from "./booking-contract-review.js"
import type {
  LegalDocumentArtifactProvider,
  LegalDocumentRenderDescriptor,
} from "./contracts/document-artifact-provider.js"
import { createLegalDocumentOperationEngine } from "./contracts/document-operation.js"
import {
  contractAttachments,
  contracts,
  contractTemplates,
  contractTemplateVersions,
} from "./contracts/schema.js"
import {
  allocateContractNumber,
  contractsService,
  mergeContractNumberIntoVariables,
  validateTemplateVariables,
} from "./contracts/service.js"
import { contractSeriesService } from "./contracts/service-series.js"

export const LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID =
  "@voyant-travel/legal#action.generate-booking-contract-on-confirmation"
const BOOKING_CONFIRMED_EVENT_ID = "@voyant-travel/bookings#event.booking.confirmed"
const SYSTEM_PRINCIPAL_ID = "legal-booking-contract-confirmed"

export type BookingContractConfirmationResult =
  | { status: "generated"; contractId: string; attachmentId: string; replayed: boolean }
  | { status: "pending"; contractId: string; operationId: string; replayed: boolean }
  | { status: "already_generated"; contractId: string; attachmentId: string }
  | {
      status: "skipped"
      reason:
        | "booking_not_found"
        | "template_not_found"
        | "template_version_missing"
        | "series_not_found"
        | "contract_not_mutable"
        | "missing_prerequisites"
      missingPrerequisites?: string[]
    }

interface GenerateBookingContractOnConfirmationInput {
  db: PostgresJsDatabase
  event: LegalBookingConfirmedEvent
  provider: LegalDocumentArtifactProvider
}

interface PreparedTarget {
  bookingId: string
  contractId: string
  organizationId: string | null
  descriptor: LegalDocumentRenderDescriptor
}

type BookingContractReviewInput = Parameters<typeof bookingContractReviewSnapshot>[0]

/**
 * Project one booking confirmation into one ledgered, durable Legal document
 * operation. The booking id is the idempotency key, so outbox redelivery and a
 * repeated confirmation cannot create a second canonical contract document.
 */
export async function generateBookingContractOnConfirmation(
  input: GenerateBookingContractOnConfirmationInput,
): Promise<BookingContractConfirmationResult> {
  const engine = createLegalDocumentOperationEngine({ provider: input.provider })
  const prepared = await input.db.transaction(async (rawTx) => {
    const tx = rawTx as PostgresJsDatabase
    const bookingId = input.event.data.bookingId
    // agent-quality: raw-sql reviewed -- owner: legal; the booking id is parameterized and the transaction-scoped advisory lock serializes idempotent confirmation delivery.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`legal:booking-confirmed:${bookingId}`}))`,
    )

    const target = await prepareBookingContractTarget(tx, bookingId)
    if (target.status !== "prepared") return target

    const sourceEventId = resolveSourceEventId(input.event)
    const commandPayload = { bookingId, sourceEventId }
    const idempotencyKey = `booking-confirmed:${bookingId}`
    const idempotencyFingerprint = await buildActionApprovalCommandFingerprint({
      actionName: LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID,
      actionVersion: "v1",
      targetType: "booking",
      targetId: bookingId,
      commandInput: commandPayload,
      approvalPolicy: "none",
      capabilityId: LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID,
      capabilityVersion: "v1",
      evaluatedRisk: "high",
      reasonCode: null,
    })
    const idempotencyScope = await buildExistingTargetIdempotencyScope({
      actionName: LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID,
      actionVersion: "v1",
      principalType: "system",
      principalId: SYSTEM_PRINCIPAL_ID,
      organizationId: target.organizationId,
    })
    const context = {
      userId: SYSTEM_PRINCIPAL_ID,
      actor: "system",
      callerType: "internal",
      isInternalRequest: true,
      organizationId: target.organizationId,
      correlationId: sourceEventId,
    } as const
    const claim = await actionLedgerService.appendEntry(
      tx,
      buildActionLedgerMutationEntryInput({
        context,
        actionName: LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID,
        actionVersion: "v1",
        actionKind: "execute",
        status: "requested",
        evaluatedRisk: "high",
        targetType: "booking",
        targetId: bookingId,
        routeOrToolName: BOOKING_CONFIRMED_EVENT_ID,
        capabilityId: LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID,
        capabilityVersion: "v1",
        authorizationSource: "selected_graph_event",
        idempotencyScope,
        idempotencyKey,
        idempotencyFingerprint,
        mutationDetail: {
          summary: "Generate the customer contract after booking confirmation",
          reversalKind: "none",
        },
      }),
    )
    const admission = await engine.admit({
      db: tx,
      bookingId,
      mode: "generate",
      idempotencyKey,
      requestFingerprint: idempotencyFingerprint,
      principal: {
        type: "system",
        id: SYSTEM_PRINCIPAL_ID,
        organizationId: target.organizationId,
      },
      claim: {
        actionId: claim.entry.id,
        actionName: LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID,
        actionVersion: "v1",
        targetType: "booking",
        targetId: bookingId,
        idempotencyScope,
        idempotencyKey,
        idempotencyFingerprint,
        commandPayload,
      },
      prepareTarget: async () => target,
    })
    return {
      status: "admitted" as const,
      contractId: target.contractId,
      operationId: admission.operationId,
      replayed: claim.replayed || admission.replayed,
    }
  })

  if (prepared.status !== "admitted") return prepared
  const result = await engine.run(input.db, prepared.operationId)
  return result
    ? {
        status: "generated",
        contractId: result.contractId,
        attachmentId: result.attachmentId,
        replayed: prepared.replayed,
      }
    : {
        status: "pending",
        contractId: prepared.contractId,
        operationId: prepared.operationId,
        replayed: prepared.replayed,
      }
}

async function prepareBookingContractTarget(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<
  | ({ status: "prepared" } & PreparedTarget)
  | Exclude<BookingContractConfirmationResult, { status: "generated" | "pending" }>
> {
  const booking = await bookingsService.getBookingById(db, bookingId)
  if (!booking) return { status: "skipped", reason: "booking_not_found" }

  const existingContracts = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.bookingId, bookingId), eq(contracts.scope, "customer")))
    .orderBy(desc(contracts.createdAt), desc(contracts.id))
  if (existingContracts.length > 0) {
    const existingIds = existingContracts.map(({ id }) => id)
    const [canonical] = await db
      .select({ attachment: contractAttachments, contract: contracts })
      .from(contractAttachments)
      .innerJoin(contracts, eq(contracts.id, contractAttachments.contractId))
      .where(
        and(
          eq(contractAttachments.kind, "document"),
          eq(contracts.bookingId, bookingId),
          eq(contracts.scope, "customer"),
        ),
      )
      .orderBy(desc(contractAttachments.createdAt))
      .limit(1)
    if (canonical && existingIds.includes(canonical.contract.id)) {
      return {
        status: "already_generated",
        contractId: canonical.contract.id,
        attachmentId: canonical.attachment.id,
      }
    }
  }

  const origin = await getBookingOriginByBookingId(db, bookingId)
  const [items, travelers] = await Promise.all([
    bookingsService.listItems(db, bookingId),
    bookingsService.listTravelers(db, bookingId),
  ])
  const language = resolveBookingContractLanguage(booking)
  const reusable = existingContracts.find((contract) => {
    const metadata = record(contract.metadata)
    return (
      contract.status === "draft" &&
      (metadata.autoGenerated === true ||
        record(metadata).acceptance !== undefined ||
        record(metadata).bookingContractWorkflow !== undefined)
    )
  })

  const selected = await resolveTemplateSelection(db, {
    reusable,
    language,
    channelId: origin?.channelId ?? null,
  })
  if (selected.status !== "selected") return selected

  const variables = bookingContractVariables(booking, items, travelers)
  const missingPrerequisites = bookingContractPrerequisites({
    templateApplicable:
      reusable?.templateVersionId === selected.version.id ||
      (selected.template.active &&
        selected.template.scope === "customer" &&
        selected.template.currentVersionId === selected.version.id &&
        selected.template.language === language &&
        bookingContractTemplateMatchesChannel(
          selected.template.channelId,
          origin?.channelId ?? null,
        )),
    totalAmountCents: booking.sellAmountCents,
    itemCount: items.length,
    missingRequiredVariables: validateTemplateVariables(
      selected.version.variableSchema ?? selected.template.variableSchema,
      variables,
    ),
  })
  if (missingPrerequisites.length > 0) {
    return { status: "skipped", reason: "missing_prerequisites", missingPrerequisites }
  }

  const reviewSnapshot = bookingContractReviewSnapshot({
    booking,
    items,
    template: selected.template,
    version: selected.version,
    language,
    commercialTerms: record(variables.commercial),
  })
  const renderedBody = contractsService.renderPreview({
    body: selected.version.body,
    variables,
  })
  const metadata = {
    ...record(reusable?.metadata),
    autoGenerated: true,
    trigger: "booking.confirmed",
    bookingContractWorkflow: {
      revision: 1,
      previousRevisionId: null,
      reviewOnly: true,
      reviewSnapshot,
    },
  }
  const defaultSeries = reusable?.seriesId
    ? null
    : await contractSeriesService.findDefaultActiveByScope(db, "customer")
  const seriesId = reusable?.seriesId ?? defaultSeries?.id ?? null
  if (!seriesId) return { status: "skipped", reason: "series_not_found" }

  let contract: typeof contracts.$inferSelect | null
  if (reusable) {
    contract = await db
      .update(contracts)
      .set({
        title: reusable.title || `${selected.template.name} — ${booking.bookingNumber}`,
        templateVersionId: selected.version.id,
        seriesId,
        personId: reusable.personId ?? booking.personId,
        organizationId: reusable.organizationId ?? booking.organizationId,
        channelId: reusable.channelId ?? origin?.channelId ?? null,
        language,
        variables,
        renderedBody,
        renderedBodyFormat: "html",
        metadata,
        updatedAt: new Date(),
      })
      .where(and(eq(contracts.id, reusable.id), eq(contracts.status, "draft")))
      .returning()
      .then(([row]) => row ?? null)
  } else {
    const created = await contractsService.createContract(
      db,
      {
        scope: "customer",
        status: "draft",
        title: `${selected.template.name} — ${booking.bookingNumber}`,
        templateVersionId: selected.version.id,
        seriesId,
        bookingId,
        personId: booking.personId,
        organizationId: booking.organizationId,
        channelId: origin?.channelId ?? null,
        language,
        variables,
        metadata,
      },
      { allowBookingContractWorkflow: true },
    )
    contract = created
      ? await db
          .update(contracts)
          .set({ renderedBody, renderedBodyFormat: "html", updatedAt: new Date() })
          .where(eq(contracts.id, created.id))
          .returning()
          .then(([row]) => row ?? null)
      : null
  }
  if (!contract) return { status: "skipped", reason: "contract_not_mutable" }

  if (!contract.contractNumber) {
    const allocated = await allocateContractNumber(db, seriesId)
    if (!allocated) return { status: "skipped", reason: "series_not_found" }
    const numberedVariables = mergeContractNumberIntoVariables(variables, allocated.number)
    const numberedBody = contractsService.renderPreview({
      body: selected.version.body,
      variables: numberedVariables,
    })
    contract = await db
      .update(contracts)
      .set({
        contractNumber: allocated.number,
        variables: numberedVariables,
        renderedBody: numberedBody,
        updatedAt: new Date(),
      })
      .where(and(eq(contracts.id, contract.id), eq(contracts.status, "draft")))
      .returning()
      .then(([row]) => row ?? null)
    if (!contract) return { status: "skipped", reason: "contract_not_mutable" }
  }

  return {
    status: "prepared",
    bookingId,
    contractId: contract.id,
    organizationId: booking.organizationId,
    descriptor: {
      contractId: contract.id,
      bookingId,
      templateVersionId: selected.version.id,
      contractNumber: contract.contractNumber,
      body: contract.renderedBody ?? renderedBody,
      bodyFormat: "html",
      variables: (contract.variables as Record<string, unknown> | null) ?? variables,
    },
  }
}

async function resolveTemplateSelection(
  db: PostgresJsDatabase,
  input: {
    reusable: typeof contracts.$inferSelect | undefined
    language: string
    channelId: string | null
  },
): Promise<
  | {
      status: "selected"
      template: typeof contractTemplates.$inferSelect
      version: typeof contractTemplateVersions.$inferSelect
    }
  | Extract<BookingContractConfirmationResult, { status: "skipped" }>
> {
  if (input.reusable?.templateVersionId) {
    const [selection] = await db
      .select({ template: contractTemplates, version: contractTemplateVersions })
      .from(contractTemplateVersions)
      .innerJoin(contractTemplates, eq(contractTemplates.id, contractTemplateVersions.templateId))
      .where(eq(contractTemplateVersions.id, input.reusable.templateVersionId))
      .limit(1)
    if (selection) return { status: "selected", ...selection }
  }

  const template = await contractsService.getDefaultTemplate(db, {
    scope: "customer",
    language: input.language,
    channelId: input.channelId ?? undefined,
    fallbackLanguages: input.language === "en" ? [] : ["en"],
  })
  if (!template) return { status: "skipped", reason: "template_not_found" }
  if (!template.currentVersionId) {
    return { status: "skipped", reason: "template_version_missing" }
  }
  const [version] = await db
    .select()
    .from(contractTemplateVersions)
    .where(eq(contractTemplateVersions.id, template.currentVersionId))
    .limit(1)
  return version
    ? { status: "selected", template, version }
    : { status: "skipped", reason: "template_version_missing" }
}

export function bookingContractVariables(
  booking: BookingContractReviewInput["booking"],
  items: BookingContractReviewInput["items"],
  travelers: Awaited<ReturnType<typeof bookingsService.listTravelers>>,
  now = new Date(),
): Record<string, unknown> {
  const primaryProduct = items[0]
  const today = now.toISOString().slice(0, 10)
  const normalizedItems = items.map((item) => ({
    title: item.productNameSnapshot ?? item.title,
    quantity: item.quantity,
    amountCents: item.totalSellAmountCents,
    currency: item.sellCurrency,
  }))
  const normalizedTravelers = travelers.map((traveler) => ({
    id: traveler.id,
    firstName: traveler.firstName,
    lastName: traveler.lastName,
    fullName: [traveler.firstName, traveler.lastName].filter(Boolean).join(" "),
    email: traveler.email,
    phone: traveler.phone,
    category: traveler.travelerCategory,
    isPrimary: traveler.isPrimary,
  }))
  const leadTraveler =
    normalizedTravelers.find((traveler) => traveler.isPrimary) ?? normalizedTravelers[0] ?? null
  const customerName = [booking.contactFirstName, booking.contactLastName].filter(Boolean).join(" ")
  const pax = booking.pax ?? (normalizedTravelers.length > 0 ? normalizedTravelers.length : null)
  return {
    today,
    currentDate: today,
    currentDateTime: now.toISOString(),
    currentTime: now.toISOString().slice(11, 19),
    contract: {
      contractNumber: "",
      number: "",
      contractDate: today,
      date: today,
      signedAt: "",
      isManual: false,
      series: "",
      channel: "storefront",
      source: "self_service",
    },
    booking: {
      id: booking.id,
      bookingId: booking.id,
      reference: booking.bookingNumber,
      bookingNumber: booking.bookingNumber,
      number: booking.bookingNumber,
      status: booking.status,
      startDate: booking.startDate,
      endDate: booking.endDate,
      productName: primaryProduct?.productNameSnapshot ?? primaryProduct?.title ?? null,
      pax,
      paxTotal: pax,
      sellCurrency: booking.sellCurrency,
      currency: booking.sellCurrency,
      sellAmountCents: booking.sellAmountCents,
      totalAmountCents: booking.sellAmountCents,
      items: normalizedItems,
    },
    customer: {
      ...bookingContractCustomerVariables(booking),
      firstName: booking.contactFirstName,
      lastName: booking.contactLastName,
      fullName: customerName || null,
      type: booking.contactPartyType === "company" ? "B2B" : "B2C",
      address: {
        line1: booking.contactAddressLine1,
        line2: booking.contactAddressLine2,
        city: booking.contactCity,
        region: booking.contactRegion,
        postal: booking.contactPostalCode,
        country: booking.contactCountry,
      },
    },
    leadTraveler,
    travelers: normalizedTravelers,
    passengers: normalizedTravelers,
    items: normalizedItems,
    commercial: {
      currency: booking.sellCurrency,
      totalAmountCents: booking.sellAmountCents,
    },
    payment: {
      amountCents: booking.sellAmountCents,
      currency: booking.sellCurrency,
    },
    product: {
      title: primaryProduct?.productNameSnapshot ?? primaryProduct?.title ?? null,
    },
  }
}

function resolveSourceEventId(event: EventEnvelope<LegalBookingConfirmedPayload>): string {
  const eventId = event.metadata?.eventId
  return typeof eventId === "string" && eventId.trim()
    ? eventId
    : `booking.confirmed:${event.data.bookingId}`
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
