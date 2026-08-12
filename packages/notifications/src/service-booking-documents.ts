import { bookings } from "@voyant-travel/bookings/schema"
import { invoiceRenditions, invoices } from "@voyant-travel/finance/schema"
import { contractAttachments, contracts } from "@voyant-travel/legal/schema"
import { and, desc, eq, ne, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { bookingItemsRef, productMediaRef } from "./payment-bundle-refs.js"
import { enqueueNotification } from "./service-durable-send.js"
import { buildNotificationPortalContext } from "./service-portal-context.js"
import type {
  BookingDocumentBundleItem,
  NotificationService,
  SendBookingDocumentsNotificationInput,
} from "./service-shared.js"
import {
  listBookingNotificationItems,
  listBookingNotificationParticipants,
  NotificationError,
  resolveReminderRecipient,
} from "./service-shared.js"
import type { NotificationAttachment } from "./types.js"

export type BookingDocumentAttachmentResolver = (
  document: BookingDocumentBundleItem,
) => Promise<NotificationAttachment | null>

export interface SendBookingDocumentsRuntimeOptions {
  attachmentResolver?: BookingDocumentAttachmentResolver
  publicCustomerPortalBaseUrl?: string | null
}

export interface BookingDocumentsSentEvent {
  bookingId: string
  recipient: string
  deliveryId: string
  provider: string | null
  documentKeys: string[]
}

function getMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function getMetadataString(
  metadata: Record<string, unknown> | null,
  keys: ReadonlyArray<string>,
): string | null {
  if (!metadata) {
    return null
  }

  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }

  return null
}

function createDefaultAttachmentFromDocument(
  document: BookingDocumentBundleItem,
): NotificationAttachment | null {
  if (!document.downloadUrl) {
    return null
  }

  return {
    filename: document.name,
    path: document.downloadUrl,
    contentType: document.mimeType ?? undefined,
  }
}

async function listLegalBookingDocuments(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<BookingDocumentBundleItem[]> {
  const contractRows = await db
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.bookingId, bookingId),
        eq(contracts.scope, "customer"),
        ne(contracts.status, "void"),
      ),
    )
    .orderBy(desc(contracts.createdAt))

  if (contractRows.length === 0) {
    return []
  }

  const attachmentRows = await db
    .select()
    .from(contractAttachments)
    .where(
      and(
        eq(contractAttachments.kind, "document"),
        or(...contractRows.map((contract) => eq(contractAttachments.contractId, contract.id))),
      ),
    )
    .orderBy(desc(contractAttachments.createdAt))

  const bestAttachmentByContractId = new Map<string, typeof contractAttachments.$inferSelect>()
  for (const attachment of attachmentRows) {
    if (!bestAttachmentByContractId.has(attachment.contractId)) {
      bestAttachmentByContractId.set(attachment.contractId, attachment)
    }
  }

  return contractRows.flatMap((contract) => {
    const attachment = bestAttachmentByContractId.get(contract.id)
    if (!attachment) {
      return []
    }

    const metadata = getMetadataRecord(attachment.metadata)

    return [
      {
        key: `legal:${attachment.id}`,
        source: "legal" as const,
        documentType: "contract" as const,
        bookingId,
        contractId: contract.id,
        invoiceId: null,
        attachmentId: attachment.id,
        renditionId: null,
        contractStatus: contract.status,
        invoiceStatus: null,
        name: attachment.name,
        format: attachment.mimeType === "application/pdf" ? "pdf" : null,
        mimeType: attachment.mimeType ?? null,
        storageKey: attachment.storageKey ?? null,
        downloadUrl: getMetadataString(metadata, ["url"]),
        language: contract.language ?? null,
        metadata,
        createdAt: attachment.createdAt.toISOString(),
      },
    ]
  })
}

function compareInvoiceRenditions(
  left: typeof invoiceRenditions.$inferSelect,
  right: typeof invoiceRenditions.$inferSelect,
) {
  const formatRank = new Map([
    ["pdf", 0],
    ["html", 1],
    ["json", 2],
    ["xml", 3],
  ])

  const leftRank = formatRank.get(left.format) ?? Number.MAX_SAFE_INTEGER
  const rightRank = formatRank.get(right.format) ?? Number.MAX_SAFE_INTEGER

  if (leftRank !== rightRank) {
    return leftRank - rightRank
  }

  return right.createdAt.getTime() - left.createdAt.getTime()
}

async function listFinanceBookingDocuments(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<BookingDocumentBundleItem[]> {
  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.bookingId, bookingId), ne(invoices.status, "void")))
    .orderBy(desc(invoices.createdAt))

  if (invoiceRows.length === 0) {
    return []
  }

  const renditionRows = await db
    .select()
    .from(invoiceRenditions)
    .where(
      and(
        eq(invoiceRenditions.status, "ready"),
        or(...invoiceRows.map((invoice) => eq(invoiceRenditions.invoiceId, invoice.id))),
      ),
    )
    .orderBy(desc(invoiceRenditions.createdAt))

  const bestRenditionByInvoiceId = new Map<string, typeof invoiceRenditions.$inferSelect>()
  for (const rendition of renditionRows) {
    const existing = bestRenditionByInvoiceId.get(rendition.invoiceId)
    if (!existing || compareInvoiceRenditions(rendition, existing) < 0) {
      bestRenditionByInvoiceId.set(rendition.invoiceId, rendition)
    }
  }

  return invoiceRows.flatMap((invoice) => {
    const rendition = bestRenditionByInvoiceId.get(invoice.id)
    if (!rendition) {
      return []
    }

    const metadata = getMetadataRecord(rendition.metadata)
    const format = rendition.format
    const extension = format === "pdf" ? "pdf" : format

    return [
      {
        key: `finance:${rendition.id}`,
        source: "finance" as const,
        documentType: invoice.invoiceType === "proforma" ? "proforma" : "invoice",
        bookingId,
        contractId: null,
        invoiceId: invoice.id,
        attachmentId: null,
        renditionId: rendition.id,
        contractStatus: null,
        invoiceStatus: invoice.status,
        name: `${invoice.invoiceNumber}.${extension}`,
        format,
        mimeType:
          format === "pdf"
            ? "application/pdf"
            : format === "html"
              ? "text/html"
              : format === "json"
                ? "application/json"
                : "application/xml",
        storageKey: rendition.storageKey ?? null,
        downloadUrl: getMetadataString(metadata, ["url"]),
        language: rendition.language ?? invoice.language ?? null,
        metadata,
        createdAt: rendition.createdAt.toISOString(),
      },
    ]
  })
}

async function listProductBookingDocuments(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<BookingDocumentBundleItem[]> {
  const itemRows = await db
    .select({ productId: bookingItemsRef.productId })
    .from(bookingItemsRef)
    .where(eq(bookingItemsRef.bookingId, bookingId))
  const productIds = [
    ...new Set(
      itemRows
        .map(({ productId }) => productId)
        .filter((productId): productId is string => Boolean(productId)),
    ),
  ]
  if (productIds.length === 0) return []

  const brochureRows = await db
    .select()
    .from(productMediaRef)
    .where(
      and(
        eq(productMediaRef.isBrochure, true),
        eq(productMediaRef.isBrochureCurrent, true),
        or(...productIds.map((productId) => eq(productMediaRef.productId, productId))),
      ),
    )
    .orderBy(desc(productMediaRef.brochureVersion), desc(productMediaRef.createdAt))

  const bestByProductId = new Map<string, typeof productMediaRef.$inferSelect>()
  for (const brochure of brochureRows) {
    if (!bestByProductId.has(brochure.productId)) bestByProductId.set(brochure.productId, brochure)
  }

  return [...bestByProductId.values()].map((brochure) => ({
    key: `products:${brochure.id}`,
    source: "products" as const,
    documentType: "brochure" as const,
    bookingId,
    contractId: null,
    invoiceId: null,
    attachmentId: null,
    renditionId: null,
    contractStatus: null,
    invoiceStatus: null,
    name: brochure.name,
    format: brochure.mimeType === "application/pdf" ? "pdf" : null,
    mimeType: brochure.mimeType,
    storageKey: brochure.storageKey,
    downloadUrl: brochure.url,
    language: null,
    metadata: {
      productId: brochure.productId,
      brochureVersion: brochure.brochureVersion,
    },
    createdAt: brochure.createdAt.toISOString(),
  }))
}

export const bookingDocumentNotificationsService = {
  async listBookingDocumentBundle(db: PostgresJsDatabase, bookingId: string) {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
    if (!booking) {
      return null
    }

    const [legalDocuments, financeDocuments, productDocuments] = await Promise.all([
      listLegalBookingDocuments(db, bookingId),
      listFinanceBookingDocuments(db, bookingId),
      listProductBookingDocuments(db, bookingId),
    ])

    return {
      bookingId,
      documents: [...legalDocuments, ...financeDocuments, ...productDocuments],
    }
  },

  async sendBookingDocumentsNotification(
    db: PostgresJsDatabase,
    dispatcher: NotificationService,
    bookingId: string,
    input: SendBookingDocumentsNotificationInput,
    runtime: SendBookingDocumentsRuntimeOptions = {},
  ) {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
    if (!booking) {
      return { status: "not_found" as const }
    }
    if (!input.templateId && !input.templateSlug) {
      throw new NotificationError("A vetted notification template is required")
    }

    const bundle = await this.listBookingDocumentBundle(db, bookingId)
    const requestedTypes = new Set(input.documentTypes ?? ["contract", "invoice", "proforma"])
    const documents = (bundle?.documents ?? []).filter((document) =>
      requestedTypes.has(document.documentType),
    )

    if (documents.length === 0) {
      return { status: "no_documents" as const }
    }

    const [participants, items] = await Promise.all([
      listBookingNotificationParticipants(db, bookingId),
      listBookingNotificationItems(db, bookingId),
    ])
    const recipient = resolveReminderRecipient(booking, participants)
    const to = recipient?.email ?? null
    if (!to) {
      return { status: "no_recipient" as const }
    }

    const attachmentResolver =
      runtime.attachmentResolver ??
      (async (document: BookingDocumentBundleItem) => createDefaultAttachmentFromDocument(document))

    const attachments = (
      await Promise.all(documents.map((document) => attachmentResolver(document)))
    ).filter((attachment): attachment is NotificationAttachment => Boolean(attachment))

    if (attachments.length === 0) {
      return { status: "no_attachments" as const }
    }

    const delivery = await enqueueNotification({
      db,
      registry: dispatcher,
      input: {
        idempotencyKey: input.idempotencyKey,
        templateId: input.templateId ?? null,
        templateSlug: input.templateSlug ?? null,
        channel: "email",
        to,
        attachments,
        data: {
          booking: {
            id: booking.id,
            bookingNumber: booking.bookingNumber,
            status: booking.status,
            sellCurrency: booking.sellCurrency,
            sellAmountCents: booking.sellAmountCents,
            startDate: booking.startDate,
            endDate: booking.endDate,
          },
          traveler: recipient
            ? {
                firstName: recipient.firstName,
                lastName: recipient.lastName,
                email: recipient.email,
                participantType: recipient.participantType,
                isPrimary: recipient.isPrimary,
              }
            : null,
          travelers: participants,
          documents,
          items,
          portal: buildNotificationPortalContext(runtime.publicCustomerPortalBaseUrl, booking.id),
        },
        targetType: "booking",
        targetId: booking.id,
        bookingId: booking.id,
        personId: booking.personId ?? null,
        organizationId: booking.organizationId ?? null,
        metadata: {
          bookingDocumentKeys: documents.map((document) => document.key),
        },
        scheduledFor: input.scheduledFor ?? null,
        terminalEvent: {
          name: "booking.documents.sent",
          data: {
            bookingId: booking.id,
            recipient: to,
            documentKeys: documents.map((document) => document.key),
          },
        },
      },
    })

    if (!delivery) {
      return { status: "send_failed" as const }
    }

    return {
      status: "pending" as const,
      bookingId: booking.id,
      recipient: to,
      documents,
      delivery,
    }
  },

  /**
   * Confirm-and-dispatch — single orchestrated call for the operator flow
   * that wants "list the booking's documents, then send them to the client"
   * to be one action instead of two round-trips.
   *
   * With `sendNotification: false`, the caller gets the bundle back without
   * attempting a send — useful for rendering a preview/checkbox list before
   * the operator confirms. With `sendNotification: true`, the same send
   * guards as `sendBookingDocumentsNotification` apply (no_documents,
   * no_recipient, no_attachments, send_failed); the result keeps the bundle
   * regardless so the UI always has something to show.
   */
  async confirmAndDispatchBooking(
    db: PostgresJsDatabase,
    dispatcher: NotificationService,
    bookingId: string,
    input:
      | {
          sendNotification: false
          documentTypes?: SendBookingDocumentsNotificationInput["documentTypes"]
        }
      | ({ sendNotification?: true } & SendBookingDocumentsNotificationInput),
    runtime: SendBookingDocumentsRuntimeOptions = {},
  ) {
    const bundle = await this.listBookingDocumentBundle(db, bookingId)
    if (!bundle) return { status: "not_found" as const }

    const documents = bundle.documents
    const sendNotification = input.sendNotification ?? true
    if (!sendNotification) {
      return {
        status: "preview" as const,
        bookingId,
        documents,
      }
    }

    const result = await this.sendBookingDocumentsNotification(
      db,
      dispatcher,
      bookingId,
      input as SendBookingDocumentsNotificationInput,
      runtime,
    )

    if (result.status === "not_found") {
      return { status: "not_found" as const }
    }

    if (result.status !== "pending") {
      return {
        status: "skipped" as const,
        bookingId,
        documents,
        skipReason: result.status,
      }
    }

    return {
      status: "dispatched" as const,
      bookingId: result.bookingId,
      documents: result.documents,
      recipient: result.recipient,
      delivery: result.delivery,
    }
  },
}

export { createDefaultAttachmentFromDocument as createDefaultBookingDocumentAttachment }
