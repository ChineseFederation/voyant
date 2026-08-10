import { bookings } from "@voyant-travel/bookings/schema"
import type { EventBus } from "@voyant-travel/core"
import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

interface StoredAcceptance {
  templateId: string
  templateSlug: string
  acceptedAt: string
  acceptedMarketing: boolean
  clientIp?: string
  userAgent?: string
  renderedHtmlLength: number
}

export interface AcceptanceSignatureContract {
  id: string
  bookingId: string | null
  metadata: unknown
  status: string
}

export interface AcceptanceSignatureInput {
  signerName: string
  signerEmail: string | null
  method: "electronic"
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
}

/** Legal operations required by checkout acceptance-signature promotion. */
export interface AcceptanceSignatureLegalPort {
  getContract(
    db: PostgresJsDatabase,
    contractId: string,
  ): Promise<AcceptanceSignatureContract | null>
  getBookingContract(
    db: PostgresJsDatabase,
    bookingId: string,
  ): Promise<AcceptanceSignatureContract | null>
  recordBookingPaymentConfirmation(
    db: PostgresJsDatabase,
    bookingId: string,
    paymentSessionId: string,
  ): Promise<void>
  listSignatures(db: PostgresJsDatabase, contractId: string): Promise<ReadonlyArray<unknown>>
  issueContract(
    db: PostgresJsDatabase,
    contractId: string,
    eventBus?: EventBus,
  ): Promise<{ status: string }>
  sendContract(
    db: PostgresJsDatabase,
    contractId: string,
    eventBus?: EventBus,
  ): Promise<{ status: string }>
  signContract(
    db: PostgresJsDatabase,
    contractId: string,
    input: AcceptanceSignatureInput,
    eventBus?: EventBus,
  ): Promise<{ status: string }>
}

const ACCEPTANCE_MARKER_PREFIX = "__contract_acceptance__:"

function readContractAcceptance(
  contractMetadata: unknown,
  internalNotesFallback: string | null,
): StoredAcceptance | null {
  if (contractMetadata && typeof contractMetadata === "object") {
    const meta = contractMetadata as Record<string, unknown>
    if (meta.acceptance && typeof meta.acceptance === "object") {
      return meta.acceptance as StoredAcceptance
    }
  }
  if (!internalNotesFallback) return null
  for (const line of internalNotesFallback.split("\n")) {
    if (!line.startsWith(ACCEPTANCE_MARKER_PREFIX)) continue
    try {
      return JSON.parse(line.slice(ACCEPTANCE_MARKER_PREFIX.length)) as StoredAcceptance
    } catch {
      // Bad marker - try next line.
    }
  }
  return null
}

function isPaymentConfirmedGeneratedDraft(contract: AcceptanceSignatureContract): boolean {
  if (!contract.metadata || typeof contract.metadata !== "object") return false
  const metadata = contract.metadata as Record<string, unknown>
  return (
    metadata.paymentConfirmation !== null &&
    typeof metadata.paymentConfirmation === "object" &&
    metadata.bookingContractWorkflow !== null &&
    typeof metadata.bookingContractWorkflow === "object"
  )
}

export async function persistAcceptanceSignature(
  db: PostgresJsDatabase,
  contractId: string,
  eventBus: EventBus | undefined,
  legalPort: AcceptanceSignatureLegalPort,
): Promise<void> {
  const contract = await legalPort.getContract(db, contractId)
  if (!contract?.bookingId) return

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, contract.bookingId))
    .limit(1)
  if (!booking) return

  const acceptance = readContractAcceptance(contract.metadata, booking.internalNotes)
  if (!acceptance) return

  const existing = await legalPort.listSignatures(db, contractId)
  if (existing.length > 0) return

  let status = contract.status
  if (status === "draft") {
    if (!isPaymentConfirmedGeneratedDraft(contract)) return
    const issued = await legalPort.issueContract(db, contractId, eventBus)
    if (issued.status !== "issued") {
      console.warn(
        `[catalog-checkout] could not issue paid contract before acceptance signature for ${contractId}: ${issued.status}`,
      )
      return
    }
    status = "issued"
  }

  if (status === "issued") {
    const sent = await legalPort.sendContract(db, contractId, eventBus)
    if (sent.status !== "sent") {
      console.warn(
        `[catalog-checkout] could not send contract before acceptance signature for ${contractId}: ${sent.status}`,
      )
      return
    }
    status = "sent"
  }

  if (status !== "sent") return

  const contactName = [booking.contactFirstName, booking.contactLastName]
    .filter(Boolean)
    .join(" ")
    .trim()
  const signerName =
    contactName ||
    `Storefront customer${booking.bookingNumber ? ` (${booking.bookingNumber})` : ""}`

  const result = await legalPort.signContract(
    db,
    contractId,
    {
      signerName,
      signerEmail: booking.contactEmail ?? null,
      method: "electronic" as const,
      ipAddress: acceptance.clientIp ? acceptance.clientIp.slice(0, 64) : null,
      userAgent: acceptance.userAgent ? acceptance.userAgent.slice(0, 500) : null,
      metadata: {
        source: "storefront-checkout",
        templateId: acceptance.templateId,
        templateSlug: acceptance.templateSlug,
        acceptedAt: acceptance.acceptedAt,
        acceptedMarketing: acceptance.acceptedMarketing,
        renderedHtmlLength: acceptance.renderedHtmlLength,
      },
    },
    eventBus,
  )

  if (result.status !== "signed") {
    console.warn(
      `[catalog-checkout] could not record acceptance signature for ${contractId}: ${result.status}`,
    )
    return
  }

  if (booking.internalNotes?.includes(ACCEPTANCE_MARKER_PREFIX)) {
    const cleanedNotes = booking.internalNotes
      .split("\n")
      .filter((line: string) => !line.startsWith(ACCEPTANCE_MARKER_PREFIX))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    await db
      .update(bookings)
      .set({
        internalNotes: cleanedNotes.length > 0 ? cleanedNotes : null,
        revision: sql`${bookings.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
  }
}
